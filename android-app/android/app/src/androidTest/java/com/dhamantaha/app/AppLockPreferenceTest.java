package com.dhamantaha.app;

import static org.junit.Assert.*;
import android.content.Context;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.UUID;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AppLockPreferenceTest {
    private File directory;
    private File path;

    @Before public void setup() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        directory = new File(context.getCacheDir(), "app-lock-test-" + UUID.randomUUID());
        assertTrue(directory.mkdirs());
        path = new File(directory, "lock");
    }

    @After public void cleanup() { removeTree(directory); }

    private void removeTree(File file) {
        File[] files = file.listFiles();
        if (files != null) for (File child : files) removeTree(child);
        file.delete();
    }

    @Test public void freshInstallDoesNotEnableLockWithoutConsent() {
        assertFalse(new AppLockPreference(path).isEnabled());
    }

    @Test public void enabledAndDisabledSettingsSurviveReopening() throws Exception {
        new AppLockPreference(path).setEnabled(true);
        assertTrue(new AppLockPreference(path).isEnabled());
        new AppLockPreference(path).setEnabled(false);
        assertFalse(new AppLockPreference(path).isEnabled());
    }

    @Test public void damagedSettingsNeverSilentlyDisableProtection() throws Exception {
        try (FileOutputStream output = new FileOutputStream(path)) { output.write("damaged".getBytes()); }
        assertTrue(new AppLockPreference(path).isEnabled());
        try (FileOutputStream output = new FileOutputStream(path)) { output.write(new byte[0]); }
        assertTrue(new AppLockPreference(path).isEnabled());
    }

    @Test public void writeFailureDoesNotReportASettingAsSaved() throws Exception {
        File parentFile = new File(directory, "not-a-directory");
        try (FileOutputStream output = new FileOutputStream(parentFile)) { output.write(1); }
        AppLockPreference preference = new AppLockPreference(new File(parentFile, "lock"));
        try { preference.setEnabled(true); fail("Expected storage failure"); }
        catch (IOException expected) { }
        assertFalse(preference.isEnabled());
    }
}
