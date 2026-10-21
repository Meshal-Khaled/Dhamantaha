package com.dhamantaha.app;

import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.os.Build;
import android.view.Window;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.WebViewListener;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Keeps Android chrome and Back navigation in step with the visible wallet screen. */
@CapacitorPlugin(name = "AppChrome")
public class AppChromePlugin extends Plugin {
    private OnBackPressedCallback backCallback;
    private boolean requestedBack;
    private boolean pageListenerAttached;
    private String theme = "light";

    private final WebViewListener pageListener = new WebViewListener() {
        @Override public void onPageStarted(WebView webView) {
            // A reloaded WebView must opt in again after its new JS listener is ready.
            requestedBack = false;
            if (backCallback != null) backCallback.setEnabled(false);
        }
    };

    @Override public void load() {
        getActivity().runOnUiThread(() -> {
            backCallback = new OnBackPressedCallback(false) {
                @Override public void handleOnBackPressed() {
                    MainActivity activity = (MainActivity) getActivity();
                    AppLock lock = activity.getAppLock();
                    if (lock == null || lock.isLocked() || !hasListeners("back")) {
                        // Never route Back to a wallet hidden behind Android authentication.
                        setEnabled(false);
                        activity.getOnBackPressedDispatcher().onBackPressed();
                        setEnabled(requestedBack);
                        return;
                    }
                    notifyListeners("back", new JSObject());
                }
            };
            getActivity().getOnBackPressedDispatcher().addCallback(getActivity(), backCallback);
            refreshAppearance();
        });
    }

    void attachPageListener() {
        // Bridge.Builder installs its own listener list after plugin load().
        // MainActivity invokes this only after super.onCreate has returned.
        if (pageListenerAttached) return;
        bridge.addWebViewListener(pageListener);
        pageListenerAttached = true;
    }

    @PluginMethod public void setTheme(PluginCall call) {
        String next = call.getString("theme");
        if (!"light".equals(next) && !"dark".equals(next)) {
            call.reject("Choose the light or dark appearance.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            theme = next;
            refreshAppearance();
            call.resolve();
        });
    }

    @PluginMethod public void setBackHandler(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) {
            call.reject("Choose whether the wallet should handle Back.");
            return;
        }
        getActivity().runOnUiThread(() -> {
            requestedBack = enabled;
            if (backCallback != null) backCallback.setEnabled(enabled);
            call.resolve();
        });
    }

    /** Called on the UI thread after theme, app-lock, or activity changes. */
    @SuppressWarnings("deprecation")
    void refreshAppearance() {
        MainActivity activity = (MainActivity) getActivity();
        if (activity.isFinishing() || activity.isDestroyed()) return;
        AppLock lock = activity.getAppLock();
        boolean dark = "dark".equals(theme) && (lock == null || !lock.isLocked());
        int background = Color.parseColor(dark ? "#102622" : "#f6f9f7");
        int navigation = Color.parseColor(dark ? "#19342e" : "#ffffff");
        Window window = activity.getWindow();
        window.setBackgroundDrawable(new ColorDrawable(background));
        window.getDecorView().setBackgroundColor(background);
        bridge.getWebView().setBackgroundColor(background);
        // These colors also cover older Android versions; edge-to-edge Android draws
        // the system icons over the wallet itself and uses the same contrast setting.
        window.setStatusBarColor(background);
        window.setNavigationBarColor(navigation);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }
        WindowInsetsControllerCompat controller = WindowCompat.getInsetsController(window, window.getDecorView());
        controller.setAppearanceLightStatusBars(!dark);
        controller.setAppearanceLightNavigationBars(!dark);
    }

    @Override protected void handleOnResume() {
        getActivity().runOnUiThread(this::refreshAppearance);
    }

    @Override protected void handleOnDestroy() {
        getActivity().runOnUiThread(() -> {
            requestedBack = false;
            if (backCallback != null) backCallback.remove();
            if (pageListenerAttached) bridge.removeWebViewListener(pageListener);
            pageListenerAttached = false;
        });
    }
}
