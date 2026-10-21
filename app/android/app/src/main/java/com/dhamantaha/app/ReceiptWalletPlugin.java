package com.dhamantaha.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

@CapacitorPlugin(name = "ReceiptWallet")
public class ReceiptWalletPlugin extends Plugin {
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private ReceiptStore store;

    private interface Operation { JSObject run() throws Exception; }

    private void execute(PluginCall call, Operation operation) {
        worker.execute(() -> {
            try {
                if (store == null) {
                    store = new ReceiptStore(getContext());
                    store.cleanOrphans();
                }
                JSObject result = operation.run();
                if (result != null) call.resolve(result); // open() resolves after Android launches the viewer.
            } catch (Exception error) {
                // Do not log receipt data, paths, or bridge arguments.
                call.reject(error instanceof IllegalArgumentException ? error.getMessage()
                    : "Could not access device storage. Free some space and try again.", "storage_error");
            }
        });
    }

    @PluginMethod public void list(PluginCall call) {
        execute(call, () -> {
            int offset = Math.max(0, call.getInt("offset", 0));
            int limit = Math.max(1, Math.min(50, call.getInt("limit", 50)));
            JSObject result = new JSObject();
            result.put("receipts", store.list(offset, limit));
            return result;
        });
    }

    @PluginMethod public void save(PluginCall call) {
        execute(call, () -> {
            String base64 = call.getString("data", "");
            if (base64.length() > (ReceiptStore.MAX_BYTES * 4L / 3L) + 4L) throw new IllegalArgumentException("Choose a file up to 20 MB.");
            byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
            return JSObject.fromJSONObject(store.save(call.getString("name"), call.getString("mime", ""), bytes));
        });
    }

    @PluginMethod public void get(PluginCall call) {
        execute(call, () -> {
            String id = call.getString("id");
            JSObject result = JSObject.fromJSONObject(store.get(id));
            result.put("uri", Uri.fromFile(store.original(id)).toString());
            return result;
        });
    }

    @PluginMethod public void updateAnalysis(PluginCall call) {
        execute(call, () -> {
            JSONObject analysis = call.getObject("analysis");
            if (analysis == null || !analysis.has("receipt") || !analysis.has("items")) throw new IllegalArgumentException("Invalid analysis result.");
            return JSObject.fromJSONObject(store.updateAnalysis(call.getString("id"), analysis));
        });
    }

    @PluginMethod public void delete(PluginCall call) {
        execute(call, () -> {
            String id = call.getString("id");
            store.delete(id);
            File directory = new File(getContext().getCacheDir(), "receipt-preview");
            File[] previews = directory.listFiles();
            if (previews != null) for (File preview : previews) if (preview.getName().startsWith(id)) preview.delete();
            return new JSObject();
        });
    }

    @PluginMethod public void saveAsset(PluginCall call) {
        execute(call, () -> {
            String data = call.getString("data", "");
            if (data.length() > ReceiptStore.MAX_BYTES * 4L / 3L + 4L) throw new IllegalArgumentException("Choose a file up to 20 MB.");
            return JSObject.fromJSONObject(store.saveAsset(call.getString("id"), call.getInt("index", -1), call.getString("kind", ""), call.getString("name"), call.getString("mime", ""), Base64.decode(data, Base64.DEFAULT)));
        });
    }

    @PluginMethod public void getAsset(PluginCall call) {
        execute(call, () -> {
            String assetId = call.getString("assetId");
            JSObject result = JSObject.fromJSONObject(store.asset(call.getString("id"), assetId));
            result.put("uri", Uri.fromFile(store.assetFile(assetId)).toString());
            return result;
        });
    }

    @PluginMethod public void saveExplanation(PluginCall call) {
        execute(call, () -> {
            JSONObject explanation = call.getObject("explanation");
            if (explanation == null) throw new IllegalArgumentException("Invalid explanation.");
            return JSObject.fromJSONObject(store.saveExplanation(call.getString("id"), call.getString("assetId"), explanation));
        });
    }

    @PluginMethod public void openAsset(PluginCall call) {
        execute(call, () -> {
            String assetId = call.getString("assetId");
            JSONObject asset = store.asset(call.getString("id"), assetId);
            openFile(call, store.assetFile(assetId), call.getString("id") + "-" + asset.getInt("index") + "-" + asset.getString("kind"), asset.getString("mime"));
            return null;
        });
    }

    @PluginMethod public void open(PluginCall call) {
        execute(call, () -> {
            String id = call.getString("id");
            JSONObject record = store.get(id);
            openFile(call, store.original(id), id, record.getString("mime"));
            return null;
        });
    }

    private void openFile(PluginCall call, File original, String id, String mime) throws Exception {
            File directory = new File(getContext().getCacheDir(), "receipt-preview");
            if (!directory.isDirectory() && !directory.mkdirs()) throw new IllegalStateException();
            File file = new File(directory, id);
            try (FileInputStream input = new FileInputStream(original);
                 FileOutputStream output = new FileOutputStream(file)) {
                byte[] buffer = new byte[8192];
                int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
            Intent intent = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, mime)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().runOnUiThread(() -> {
                try {
                    getActivity().startActivity(intent);
                    call.resolve();
                } catch (ActivityNotFoundException error) {
                    call.reject("Install a PDF or image viewer to open this file.", "viewer_unavailable");
                }
            });
    }

    @Override protected void handleOnDestroy() {
        worker.execute(() -> { if (store != null) store.close(); });
        worker.shutdown();
    }
}
