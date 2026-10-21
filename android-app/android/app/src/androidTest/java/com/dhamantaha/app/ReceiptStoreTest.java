package com.dhamantaha.app;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.ByteArrayOutputStream;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.UUID;
import org.json.JSONObject;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ReceiptStoreTest {
    private Context context;
    private File directory;
    private ReceiptStore store;

    @Before public void setup() {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        directory = new File(context.getCacheDir(), "wallet-test-" + UUID.randomUUID());
        store = new ReceiptStore(context, directory);
    }

    @After public void cleanup() {
        store.close();
        removeTree(directory);
    }

    private void removeTree(File file) {
        File[] children = file.listFiles();
        if (children != null) for (File child : children) removeTree(child);
        file.delete();
    }

    private byte[] readBytes(File file) throws Exception {
        try (FileInputStream input = new FileInputStream(file); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            int count;
            while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            return output.toByteArray();
        }
    }

    @Test public void photoAndPdfSurviveDatabaseReopenWithExactBytes() throws Exception {
        byte[] photo = new byte[]{(byte) 0xff, (byte) 0xd8, 12, 44, (byte) 0xff, (byte) 0xd9};
        byte[] pdf = "%PDF-1.7 receipt original".getBytes();
        String imageId = store.save("photo.jpg", "image/jpeg", photo).getString("id");
        String pdfId = store.save("bill.pdf", "application/pdf", pdf).getString("id");
        store.close();
        store = new ReceiptStore(context, directory);
        assertEquals(2, store.list(0, 50).length());
        assertArrayEquals(photo, readBytes(store.original(imageId)));
        assertArrayEquals(pdf, readBytes(store.original(pdfId)));
        assertEquals("application/pdf", store.get(pdfId).getString("mime"));
    }

    @Test public void itemAssetsSurviveReopenReplaceSafelyAndDeleteWithReceipt() throws Exception {
        String id = store.save("receipt.pdf", "application/pdf", "%PDF original assets test".getBytes()).getString("id");
        store.updateAnalysis(id, new JSONObject("{\"receipt\":{},\"items\":[{\"description\":\"Laptop\"},{\"description\":\"Bag\"}]}"));
        store.saveAsset(id, 0, "photo", "laptop.jpg", "image/jpeg", new byte[]{1, 2, 3});
        store.saveAsset(id, 1, "terms", "terms.pdf", "application/pdf", "%PDF warranty terms".getBytes());
        String photoId = store.assets(id).getJSONObject(0).getString("id");
        String termsId = store.assets(id).getJSONObject(1).getString("id");
        store.saveExplanation(id, termsId, new JSONObject("{\"coverage\":{\"sourceText\":\"Printed conditions\"}}"));
        store.close(); store = new ReceiptStore(context, directory);
        assertEquals(2, store.assets(id).length());
        assertArrayEquals(new byte[]{1, 2, 3}, readBytes(store.assetFile(photoId)));
        assertTrue(store.asset(id, termsId).getJSONObject("explanation").has("coverage"));
        try { store.asset(UUID.randomUUID().toString(), termsId); fail("must scope to owner"); } catch (IllegalArgumentException expected) {}
        try { store.saveAsset(id, 8, "photo", "invalid.jpg", "image/jpeg", new byte[]{1}); fail("must validate item"); } catch (IllegalArgumentException expected) {}
        store.saveAsset(id, 0, "photo", "new.jpg", "image/jpeg", new byte[]{4, 5});
        assertFalse(store.assetFile(photoId).exists());
        assertTrue(store.assetFile(termsId).exists());
        File newPhoto = store.assetFile(store.assets(id).getJSONObject(0).getString("id"));
        store.cleanOrphans(); assertTrue(newPhoto.exists());
        store.delete(id);
        assertFalse(newPhoto.exists()); assertFalse(store.assetFile(termsId).exists());
        assertEquals(0, store.assets(id).length());
    }

    @Test public void analysisPersistsWithoutChangingOriginalOrAddingRows() throws Exception {
        byte[] bytes = "%PDF-1.7 receipt".getBytes();
        String id = store.save("receipt.pdf", "application/pdf", bytes).getString("id");
        JSONObject analysis = new JSONObject("{\"receipt\":{\"merchantName\":\"Shop\"},\"items\":[]}");
        store.updateAnalysis(id, analysis);
        store.close();
        store = new ReceiptStore(context, directory);
        assertEquals("Shop", store.get(id).getJSONObject("analysis").getJSONObject("receipt").getString("merchantName"));
        assertEquals(1, store.list(0, 50).length());
        assertArrayEquals(bytes, readBytes(store.original(id)));
    }

    @Test public void deleteRemovesOnlyTheSelectedReceiptAndOriginal() throws Exception {
        String first = store.save("one.png", "image/png", new byte[]{1}).getString("id");
        String second = store.save("two.pdf", "application/pdf", new byte[]{2}).getString("id");
        store.delete(first);
        assertFalse(store.original(first).exists());
        assertTrue(store.original(second).exists());
        assertEquals(second, store.list(0, 50).getJSONObject(0).getString("id"));
    }

    @Test public void failedSqlInsertRollsBackTheOriginalFile() throws Exception {
        store.getWritableDatabase().execSQL("CREATE TRIGGER reject_insert BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'full'); END");
        try { store.save("receipt.png", "image/png", new byte[]{1}); fail("Expected write failure"); }
        catch (android.database.sqlite.SQLiteException expected) { }
        assertEquals(0, new File(directory, "originals").list().length);
        assertEquals(0, store.list(0, 50).length());
    }

    @Test public void recoversInterruptedDeletionAndRemovesOrphans() throws Exception {
        String id = store.save("receipt.png", "image/png", new byte[]{1}).getString("id");
        File original = store.original(id);
        assertTrue(original.renameTo(new File(original.getParentFile(), id + ".deleted")));
        File orphan = new File(original.getParentFile(), UUID.randomUUID().toString());
        try (FileOutputStream output = new FileOutputStream(orphan)) { output.write(new byte[]{2}); }
        store.cleanOrphans();
        assertTrue(original.exists());
        assertFalse(orphan.exists());
    }

    @Test public void rejectsPathTraversalAndInvalidFiles() throws Exception {
        try { store.original("../../private"); fail("Expected invalid ID"); }
        catch (IllegalArgumentException expected) { }
        try { store.save("empty.pdf", "application/pdf", new byte[0]); fail("Expected empty rejection"); }
        catch (IllegalArgumentException expected) { }
        try { store.save("file.html", "text/html", new byte[]{1}); fail("Expected type rejection"); }
        catch (IllegalArgumentException expected) { }
    }

    @Test public void savingTheSameBytesAgainReturnsTheExistingReceipt() throws Exception {
        byte[] pdf = "%PDF-1.7 same receipt".getBytes();
        JSONObject first = store.save("bill.pdf", "application/pdf", pdf);
        store.updateAnalysis(first.getString("id"), new JSONObject("{\"receipt\":{\"merchantName\":\"Shop\"},\"items\":[]}"));
        JSONObject again = store.save("bill (1).pdf", "application/pdf", pdf);
        assertTrue(again.getBoolean("duplicate"));
        assertEquals(first.getString("id"), again.getString("id"));
        assertEquals("Shop", again.getJSONObject("analysis").getJSONObject("receipt").getString("merchantName"));
        assertFalse(first.has("duplicate"));
        assertEquals(1, store.list(0, 50).length());
        assertEquals(1, new File(directory, "originals").list().length);
        assertNotEquals(first.getString("id"), store.save("other.pdf", "application/pdf", "%PDF-1.7 other".getBytes()).getString("id"));
    }

    @Test public void upgradeFromVersionOneHashesExistingOriginals() throws Exception {
        store.close();
        removeTree(directory);
        File originals = new File(directory, "originals");
        assertTrue(originals.mkdirs());
        byte[] bytes = "%PDF-1.7 saved before version 2".getBytes();
        String id = UUID.randomUUID().toString();
        String missing = UUID.randomUUID().toString();
        try (FileOutputStream output = new FileOutputStream(new File(originals, id))) { output.write(bytes); }
        try (android.database.sqlite.SQLiteDatabase v1 = android.database.sqlite.SQLiteDatabase.openOrCreateDatabase(new File(directory, "receipts.db"), null)) {
            v1.execSQL("CREATE TABLE receipts (id TEXT PRIMARY KEY, name TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, analysis TEXT)");
            v1.execSQL("CREATE INDEX receipts_created ON receipts(created_at DESC, id)");
            v1.execSQL("INSERT INTO receipts VALUES (?, 'old.pdf', 'application/pdf', ?, 1, 1, NULL)", new Object[]{id, bytes.length});
            v1.execSQL("INSERT INTO receipts VALUES (?, 'gone.pdf', 'application/pdf', 1, 2, 2, NULL)", new Object[]{missing});
            v1.setVersion(1);
        }
        store = new ReceiptStore(context, directory);
        assertEquals(ReceiptStore.VERSION, store.getReadableDatabase().getVersion());
        assertEquals(2, store.list(0, 50).length());
        JSONObject again = store.save("old copy.pdf", "application/pdf", bytes);
        assertTrue(again.getBoolean("duplicate"));
        assertEquals(id, again.getString("id"));
        assertEquals(2, store.list(0, 50).length());
    }

    @Test public void paginationDoesNotLoadFileBytes() throws Exception {
        // Distinct bytes: identical files would be one receipt.
        for (int index = 0; index < 6; index++) store.save("receipt-" + index + ".pdf", "application/pdf", new byte[]{(byte) (index + 1)});
        assertEquals(4, store.list(0, 4).length());
        assertEquals(2, store.list(4, 4).length());
        assertFalse(store.list(0, 4).getJSONObject(0).has("data"));
    }
}
