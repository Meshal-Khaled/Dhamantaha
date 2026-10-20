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

    @Test public void paginationDoesNotLoadFileBytes() throws Exception {
        for (int index = 0; index < 6; index++) store.save("receipt-" + index + ".pdf", "application/pdf", new byte[]{1});
        assertEquals(4, store.list(0, 4).length());
        assertEquals(2, store.list(4, 4).length());
        assertFalse(store.list(0, 4).getJSONObject(0).has("data"));
    }
}
