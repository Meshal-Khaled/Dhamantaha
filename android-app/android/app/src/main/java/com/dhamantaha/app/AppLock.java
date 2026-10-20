package com.dhamantaha.app;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
import android.provider.Settings;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.TextView;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import java.io.File;
import java.io.IOException;

/** Native entry gate. The WebView is hidden until Android confirms authentication. */
final class AppLock {
    private static final int AUTHENTICATORS = BiometricManager.Authenticators.BIOMETRIC_WEAK
        | BiometricManager.Authenticators.DEVICE_CREDENTIAL;
    interface Completion { void finish(JSObject status, String error); }

    private final MainActivity activity;
    private final AppLockPreference preference;
    private final View webView;
    private final View overlay;
    private final TextView message;
    private final Button unlockButton;
    private final BiometricPrompt prompt;
    private boolean enabled;
    private boolean unlocked;
    private boolean authenticating;
    private boolean resumed;
    private boolean destroyed;
    private Boolean pendingSetting;
    private Completion completion;

    AppLock(MainActivity activity) {
        this.activity = activity;
        preference = new AppLockPreference(new File(activity.getNoBackupFilesDir(), "app-lock"));
        enabled = preference.isEnabled();
        webView = activity.getBridge().getWebView();
        FrameLayout content = activity.findViewById(android.R.id.content);
        overlay = activity.getLayoutInflater().inflate(R.layout.app_lock, content, false);
        content.addView(overlay, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        message = overlay.findViewById(R.id.app_lock_message);
        unlockButton = overlay.findViewById(R.id.app_lock_unlock);
        unlockButton.setOnClickListener(view -> authenticate(null, null));
        overlay.findViewById(R.id.app_lock_device_settings).setOnClickListener(view ->
            activity.startActivity(new Intent(Settings.ACTION_SECURITY_SETTINGS)));
        prompt = new BiometricPrompt(activity, ContextCompat.getMainExecutor(activity), new BiometricPrompt.AuthenticationCallback() {
            @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                if (destroyed || !authenticating) return;
                Boolean setting = pendingSetting;
                if (setting != null) {
                    try {
                        preference.setEnabled(setting);
                        enabled = setting;
                    } catch (IOException error) {
                        finishAuthentication("Could not save app lock settings. Try again.");
                        return;
                    }
                }
                unlocked = true;
                finishAuthentication(null);
            }

            @Override public void onAuthenticationError(int code, CharSequence error) {
                if (destroyed || !authenticating) return;
                String text = code == BiometricPrompt.ERROR_USER_CANCELED || code == BiometricPrompt.ERROR_CANCELED
                    || code == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                    ? "Authentication cancelled. Tap Unlock to try again."
                    : "Could not authenticate. Try again and use your phone password or PIN if needed.";
                finishAuthentication(text);
            }

            @Override public void onAuthenticationFailed() {
                message.setText("Not recognized. Try again or use your phone password or PIN.");
            }
        });
        render();
    }

    boolean isDeviceSecure() {
        KeyguardManager keyguard = (KeyguardManager) activity.getSystemService(Context.KEYGUARD_SERVICE);
        return keyguard != null && keyguard.isDeviceSecure();
    }

    boolean isLocked() { return enabled && !unlocked; }

    JSObject status() {
        JSObject status = new JSObject();
        status.put("enabled", enabled);
        status.put("available", isDeviceSecure());
        status.put("biometricsAvailable", BiometricManager.from(activity).canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_WEAK) == BiometricManager.BIOMETRIC_SUCCESS);
        status.put("locked", enabled && !unlocked);
        return status;
    }

    void setEnabled(boolean next, Completion callback) {
        if (enabled == next) { callback.finish(status(), null); return; }
        authenticate(next, callback); // Both enabling and disabling require Android authentication.
    }

    private void authenticate(Boolean setting, Completion callback) {
        if (destroyed) return;
        if (authenticating || !resumed) {
            if (callback != null) callback.finish(null, "Finish the current authentication and try again.");
            return;
        }
        if (!isDeviceSecure()) {
            String error = "Set up a phone password, PIN, or pattern in Android Settings first.";
            message.setText(error);
            if (callback != null) callback.finish(null, error);
            return;
        }
        authenticating = true;
        pendingSetting = setting;
        completion = callback;
        unlockButton.setEnabled(false);
        message.setText("Use your fingerprint, supported face unlock, or phone password/PIN.");
        try {
            BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
                .setTitle(setting == null ? "Unlock Dhamantaha" : setting ? "Enable app lock" : "Turn off app lock")
                .setSubtitle("Use biometrics or your phone screen lock")
                // WEAK | DEVICE_CREDENTIAL supports face/fingerprint with screen-lock fallback on API 24+.
                .setAllowedAuthenticators(AUTHENTICATORS)
                .build();
            prompt.authenticate(info);
        } catch (RuntimeException error) {
            finishAuthentication("Could not open Android authentication. Try again.");
        }
    }

    private void finishAuthentication(String error) {
        authenticating = false;
        pendingSetting = null;
        Completion callback = completion;
        completion = null;
        render();
        if (error != null) message.setText(error);
        if (callback != null) callback.finish(error == null ? status() : null, error);
    }

    void onResume() {
        resumed = true;
        render();
        if (enabled && !unlocked && !authenticating) authenticate(null, null);
    }

    void onPause() { resumed = false; }

    void onStop() {
        unlocked = false;
        render();
    }

    private void render() {
        boolean locked = enabled && !unlocked;
        if (enabled) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_SECURE);
        else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_SECURE);
        overlay.setVisibility(locked ? View.VISIBLE : View.GONE);
        webView.setVisibility(locked ? View.INVISIBLE : View.VISIBLE);
        webView.setImportantForAccessibility(locked ? View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS : View.IMPORTANT_FOR_ACCESSIBILITY_AUTO);
        unlockButton.setEnabled(!authenticating);
        if (locked) overlay.bringToFront();
        activity.refreshChrome();
    }

    void destroy() {
        destroyed = true;
        prompt.cancelAuthentication();
        if (completion != null) completion.finish(null, "Authentication was interrupted. Please try again.");
        completion = null;
    }
}
