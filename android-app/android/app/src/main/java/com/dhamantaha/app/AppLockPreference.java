package com.dhamantaha.app;

import android.util.AtomicFile;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;

/** App-local opt-in. Never backed up, and never stores biometric or screen-lock credentials. */
final class AppLockPreference {
    private final AtomicFile file;

    AppLockPreference(File path) { file = new AtomicFile(path); }

    boolean isEnabled() {
        if (!file.getBaseFile().exists() && !new File(file.getBaseFile() + ".bak").exists()) return false;
        try {
            byte[] bytes = file.readFully();
            // A damaged preference must not silently turn a previously enabled lock off.
            return bytes.length != 1 || bytes[0] != '0';
        } catch (IOException error) { return true; }
    }

    void setEnabled(boolean enabled) throws IOException {
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(enabled ? '1' : '0');
            file.finishWrite(output);
        } catch (IOException error) {
            if (output != null) file.failWrite(output);
            throw error;
        }
    }
}
