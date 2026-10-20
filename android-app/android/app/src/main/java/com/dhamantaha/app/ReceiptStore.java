package com.dhamantaha.app;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.UUID;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/** SQLite metadata + original files, both under Android's private no-backup directory. */
final class ReceiptStore extends SQLiteOpenHelper {
    static final int MAX_BYTES = 20 * 1024 * 1024;
    private final File originals;

    ReceiptStore(Context context) {
        this(context, new File(context.getNoBackupFilesDir(), "receipt-wallet"));
    }

    // Separate directory allows instrumentation tests without touching the user's wallet.
    ReceiptStore(Context context, File directory) {
        super(context, new File(directory, "receipts.db").getAbsolutePath(), null, 1);
        originals = new File(directory, "originals");
        if (!originals.isDirectory() && !originals.mkdirs()) throw new IllegalStateException("Cannot open receipt storage.");
    }

    @Override public void onCreate(SQLiteDatabase db) {
        db.execSQL("CREATE TABLE receipts (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, analysis TEXT)");
        db.execSQL("CREATE INDEX receipts_created ON receipts(created_at DESC, id)");
    }

    @Override public void onUpgrade(SQLiteDatabase db, int oldVersion, int newVersion) {
        // Add non-destructive migrations here when the schema version changes.
        throw new IllegalStateException("Unsupported receipt database version.");
    }

    JSONObject save(String name, String mime, byte[] bytes) throws IOException, JSONException {
        if (bytes.length == 0 || bytes.length > MAX_BYTES) throw new IllegalArgumentException("Choose a file up to 20 MB.");
        if (!mime.equals("application/pdf") && !mime.matches("image/(jpeg|png|webp|heic|heif|avif|gif|bmp)")) {
            throw new IllegalArgumentException("Choose a receipt photo or PDF.");
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
            return record(cursor);
        }
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
        File file = original(id);
        File tombstone = new File(originals, id + ".deleted");
        if (file.exists() && !file.renameTo(tombstone)) throw new IOException("Cannot delete receipt file.");
        try {
            getWritableDatabase().delete("receipts", "id = ?", new String[]{id});
        } catch (RuntimeException error) {
            tombstone.renameTo(file);
            throw error;
        }
        tombstone.delete();
    }

    File original(String id) {
        if (id == null || !id.matches("[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}")) {
            throw new IllegalArgumentException("Invalid receipt ID.");
        }
        return new File(originals, id);
    }

    // Recover unused files if Android killed the process between the file and SQL writes.
    void cleanOrphans() {
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
