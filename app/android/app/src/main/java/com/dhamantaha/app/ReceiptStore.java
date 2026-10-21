package com.dhamantaha.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** SQLite metadata + original files, both under Android's private no-backup directory. */
final class ReceiptStore extends SQLiteOpenHelper {
    static final int MAX_BYTES = 20 * 1024 * 1024;
    // v2 adds original hashes; v3 adds item photos and warranty terms without changing receipts.
    static final int VERSION = 3;
    private final File originals;
    private final File attachments;

    ReceiptStore(Context context) {
        this(context, new File(context.getNoBackupFilesDir(), "receipt-wallet"));
    }

    // Separate directory allows instrumentation tests without touching the user's wallet.
    ReceiptStore(Context context, File directory) {
        super(context, new File(directory, "receipts.db").getAbsolutePath(), null, VERSION);
        originals = new File(directory, "originals");
        if (!originals.isDirectory() && !originals.mkdirs()) throw new IllegalStateException("Cannot open receipt storage.");
        attachments = new File(directory, "attachments");
        if (!attachments.isDirectory() && !attachments.mkdirs()) throw new IllegalStateException("Cannot open attachment storage.");
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE receipts (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, analysis TEXT, sha256 TEXT)");
        db.execSQL("CREATE INDEX receipts_created ON receipts(created_at DESC, id)");
        db.execSQL("CREATE INDEX receipts_sha256 ON receipts(sha256)");
        createAssets(db);
    }

    private void createAssets(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE assets (id TEXT PRIMARY KEY, receipt_id TEXT NOT NULL, item_index INTEGER NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, explanation TEXT, UNIQUE(receipt_id, item_index, kind))");
    }

    // Runs inside SQLite's upgrade transaction: a failure leaves the database at its old version.
    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        if (oldVersion < 2) {
            db.execSQL("ALTER TABLE receipts ADD COLUMN sha256 TEXT");
            db.execSQL("CREATE INDEX receipts_sha256 ON receipts(sha256)");
            try (Cursor cursor = db.rawQuery("SELECT id FROM receipts", null)) {
                while (cursor.moveToNext()) {
                    File file = original(cursor.getString(0));
                    if (!file.isFile()) continue; // cleanOrphans() never removes rows, so a missing original stays unhashed.
                    ContentValues values = new ContentValues();
                    values.put("sha256", sha256(file));
                    db.update("receipts", values, "id = ?", new String[]{cursor.getString(0)});
                }
            } catch (IOException error) {
                throw new IllegalStateException("Cannot upgrade receipt storage.", error);
            }
        }
        if (oldVersion < 3) createAssets(db);
    }

    /** Saves a new original, or returns the receipt already holding these exact bytes with "duplicate": true. */
    JSONObject save(String name, String mime, byte[] bytes) throws IOException, JSONException {
        if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IllegalArgumentException("Choose a file up to 20 MB.");
        if (!mime.equals("application/pdf") && !mime.matches("image/(jpeg|png|webp|heic|heif|avif|gif|bmp)")) {
            throw new IllegalArgumentException("Choose a receipt photo or PDF.");
        }
        String hash = sha256(bytes);
        try (Cursor cursor = getReadableDatabase().query("receipts", new String[]{"id"}, "sha256 = ?", new String[]{hash},
                null, null, "created_at, id", "1")) {
            if (cursor.moveToFirst()) return get(cursor.getString(0)).put("duplicate", true);
        }
        String id = UUID.randomUUID().toString();
        File file = original(id);
        File pending = new File(originals, id + ".tmp");
        boolean committed = false;
        try {
            try (FileOutputStream output = new FileOutputStream(pending)) {
                output.write(bytes);
                output.getFD().sync();
            }
            if (!pending.renameTo(file)) throw new IOException("Cannot save receipt file.");
            long now = System.currentTimeMillis();
            ContentValues values = new ContentValues();
            values.put("id", id);
            values.put("name", name == null || name.trim().isEmpty() ? "Receipt" : name);
            values.put("mime", mime);
            values.put("size", bytes.length);
            values.put("created_at", now);
            values.put("updated_at", now);
            values.put("sha256", hash);
            getWritableDatabase().insertOrThrow("receipts", null, values);
            committed = true;
            return get(id);
        } finally {
            if (!committed) file.delete();
            pending.delete();
        }
    }

    JSONArray list(int offset, int limit) throws JSONException {
        JSONArray records = new JSONArray();
        try (Cursor cursor = getReadableDatabase().query("receipts", null, null, null, null, null,
                "created_at DESC, id", offset + "," + limit)) {
            while (cursor.moveToNext()) records.put(record(cursor));
        }
        return records;
    }

    JSONObject get(String id) throws JSONException {
        original(id); // Validate the ID before it is used as a path.
        try (Cursor cursor = getReadableDatabase().query("receipts", null, "id = ?", new String[]{id}, null, null, null)) {
            if (!cursor.moveToFirst()) throw new IllegalArgumentException("This receipt no longer exists.");
            return record(cursor).put("assets", assets(id));
        }
    }

    JSONArray assets(String receiptId) throws JSONException {
        JSONArray rows = new JSONArray();
        try (Cursor cursor = getReadableDatabase().query("assets", null, "receipt_id = ?", new String[]{receiptId}, null, null, "item_index, kind")) {
            while (cursor.moveToNext()) {
                String explanation = cursor.getString(cursor.getColumnIndexOrThrow("explanation"));
                rows.put(new JSONObject().put("id", cursor.getString(cursor.getColumnIndexOrThrow("id")))
                    .put("index", cursor.getInt(cursor.getColumnIndexOrThrow("item_index")))
                    .put("kind", cursor.getString(cursor.getColumnIndexOrThrow("kind")))
                    .put("name", cursor.getString(cursor.getColumnIndexOrThrow("name")))
                    .put("mime", cursor.getString(cursor.getColumnIndexOrThrow("mime")))
                    .put("size", cursor.getLong(cursor.getColumnIndexOrThrow("size")))
                    .put("explanation", explanation == null ? JSONObject.NULL : new JSONObject(explanation)));
            }
        }
        return rows;
    }

    private void validateItem(String receiptId, int index, String kind) throws JSONException {
        JSONObject analysis = get(receiptId).optJSONObject("analysis");
        if (analysis == null || index < 0 || index >= analysis.getJSONArray("items").length()) throw new IllegalArgumentException("This item no longer exists.");
        if (!"photo".equals(kind) && !"terms".equals(kind)) throw new IllegalArgumentException("Invalid attachment type.");
    }

    JSONObject saveAsset(String receiptId, int index, String kind, String name, String mime, byte[] bytes) throws Exception {
        validateItem(receiptId, index, kind);
        if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IllegalArgumentException("Choose a nonempty file up to 20 MB.");
        if (!mime.matches("image/(jpeg|png|webp)") && !(kind.equals("terms") && mime.equals("application/pdf"))) throw new IllegalArgumentException("Choose a JPG, PNG, WebP photo or a PDF of the terms.");
        String previous = null;
        JSONArray currentAssets = assets(receiptId);
        for (int i = 0; i < currentAssets.length(); i++) {
            JSONObject row = currentAssets.getJSONObject(i);
            if (row.getInt("index") == index && row.getString("kind").equals(kind)) previous = row.getString("id");
        }
        String id = UUID.randomUUID().toString();
        File pending = new File(attachments, id + ".tmp");
        File file = assetFile(id);
        boolean committed = false;
        try {
            try (FileOutputStream output = new FileOutputStream(pending)) { output.write(bytes); output.getFD().sync(); }
            if (!pending.renameTo(file)) throw new IOException("Cannot save attachment.");
            ContentValues values = new ContentValues();
            values.put("id", id); values.put("receipt_id", receiptId); values.put("item_index", index); values.put("kind", kind);
            values.put("name", name == null ? "Attachment" : name); values.put("mime", mime); values.put("size", bytes.length);
            if (getWritableDatabase().insertWithOnConflict("assets", null, values, SQLiteDatabase.CONFLICT_REPLACE) == -1) throw new IOException("Cannot save attachment.");
            committed = true;
            if (previous != null) assetFile(previous).delete();
            return get(receiptId);
        } finally { pending.delete(); if (!committed) file.delete(); }
    }

    JSONObject asset(String receiptId, String assetId) throws JSONException {
        get(receiptId);
        JSONArray rows = assets(receiptId);
        for (int i = 0; i < rows.length(); i++) if (rows.getJSONObject(i).getString("id").equals(assetId)) return rows.getJSONObject(i);
        throw new IllegalArgumentException("This attachment no longer exists.");
    }

    File assetFile(String id) {
        original(id); // Same UUID path validation as originals.
        return new File(attachments, id);
    }

    JSONObject saveExplanation(String receiptId, String assetId, JSONObject explanation) throws JSONException {
        if (!asset(receiptId, assetId).getString("kind").equals("terms")) throw new IllegalArgumentException("Choose warranty terms first.");
        ContentValues values = new ContentValues(); values.put("explanation", explanation.toString());
        getWritableDatabase().update("assets", values, "id = ? AND receipt_id = ?", new String[]{assetId, receiptId});
        return get(receiptId);
    }

    JSONObject updateAnalysis(String id, JSONObject analysis) throws JSONException {
        get(id);
        ContentValues values = new ContentValues();
        values.put("analysis", analysis.toString());
        values.put("updated_at", System.currentTimeMillis());
        getWritableDatabase().update("receipts", values, "id = ?", new String[]{id});
        return get(id);
    }

    void delete(String id) throws IOException, JSONException {
        get(id);
        JSONArray assetRows = assets(id);
        File file = original(id);
        File tombstone = new File(originals, id + ".deleted");
        if (file.exists() && !file.renameTo(tombstone)) throw new IOException("Cannot delete receipt file.");
        try {
            SQLiteDatabase db = getWritableDatabase();
            db.beginTransaction();
            try {
                db.delete("assets", "receipt_id = ?", new String[]{id});
                db.delete("receipts", "id = ?", new String[]{id});
                db.setTransactionSuccessful();
            } finally { db.endTransaction(); }
        } catch (RuntimeException error) {
            tombstone.renameTo(file);
            throw error;
        }
        tombstone.delete();
        for (int i = 0; i < assetRows.length(); i++) assetFile(assetRows.getJSONObject(i).getString("id")).delete();
    }

    File original(String id) {
        if (id == null || !id.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")) {
            throw new IllegalArgumentException("Invalid receipt ID.");
        }
        return new File(originals, id);
    }

    // Recover unused files if Android killed the process between the file and SQL writes.
    void cleanOrphans() {
        File[] extras = attachments.listFiles();
        if (extras != null) for (File file : extras) {
            try (Cursor cursor = getReadableDatabase().rawQuery("SELECT 1 FROM assets WHERE id = ?", new String[]{file.getName()})) {
                if (!cursor.moveToFirst()) file.delete();
            }
        }
        File[] files = originals.listFiles();
        if (files == null) return;
        for (File file : files) {
            if (file.getName().endsWith(".tmp")) { file.delete(); continue; }
            if (file.getName().endsWith(".deleted")) {
                String id = file.getName().replace(".deleted", "");
                try (Cursor cursor = getReadableDatabase().rawQuery("SELECT 1 FROM receipts WHERE id = ?", new String[]{id})) {
                    if (cursor.moveToFirst()) file.renameTo(original(id));
                    else file.delete();
                }
                continue;
            }
            try (Cursor cursor = getReadableDatabase().rawQuery("SELECT 1 FROM receipts WHERE id = ?", new String[]{file.getName()})) {
                if (!cursor.moveToFirst()) file.delete();
            }
        }
    }

    private static MessageDigest digest() {
        try { return MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException error) { throw new IllegalStateException(error); }
    }

    // Built by hand: String.format would use the phone's locale digits, which can be Arabic-Indic.
    private static String hex(byte[] hash) {
        StringBuilder text = new StringBuilder(hash.length * 2);
        for (byte value : hash) text.append(Character.forDigit((value >> 4) & 0xf, 16)).append(Character.forDigit(value & 0xf, 16));
        return text.toString();
    }

    static String sha256(byte[] bytes) {
        return hex(digest().digest(bytes));
    }

    static String sha256(File file) throws IOException {
        MessageDigest digest = digest();
        try (FileInputStream input = new FileInputStream(file)) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) digest.update(buffer, 0, count);
        }
        return hex(digest.digest());
    }

    private JSONObject record(Cursor cursor) throws JSONException {
        String analysis = cursor.getString(cursor.getColumnIndexOrThrow("analysis"));
        return new JSONObject()
            .put("id", cursor.getString(cursor.getColumnIndexOrThrow("id")))
            .put("name", cursor.getString(cursor.getColumnIndexOrThrow("name")))
            .put("mime", cursor.getString(cursor.getColumnIndexOrThrow("mime")))
            .put("size", cursor.getLong(cursor.getColumnIndexOrThrow("size")))
            .put("createdAt", cursor.getLong(cursor.getColumnIndexOrThrow("created_at")))
            .put("updatedAt", cursor.getLong(cursor.getColumnIndexOrThrow("updated_at")))
            .put("analysis", analysis == null ? JSONObject.NULL : new JSONObject(analysis));
    }
}
