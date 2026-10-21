package com.dhamantaha.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginHandle;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    private AppLock appLock;

    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReceiptWalletPlugin.class);
        registerPlugin(AppLockPlugin.class);
        registerPlugin(AppChromePlugin.class);
        super.onCreate(savedInstanceState);
        appLock = new AppLock(this);
        refreshChrome();
    }

    AppLock getAppLock() { return appLock; }

    void refreshChrome() {
        if (getBridge() == null) return;
        PluginHandle handle = getBridge().getPlugin("AppChrome");
        if (handle != null && handle.getInstance() instanceof AppChromePlugin) {
            AppChromePlugin chrome = (AppChromePlugin) handle.getInstance();
            chrome.attachPageListener();
            chrome.refreshAppearance();
        }
    }

    @Override public void onResume() {
        super.onResume();
        if (appLock != null) appLock.onResume();
    }

    @Override public void onPause() {
        if (appLock != null) appLock.onPause();
        super.onPause();
    }

    @Override public void onStop() {
        if (appLock != null) appLock.onStop();
        super.onStop();
    }

    @Override public void onDestroy() {
        if (appLock != null) appLock.destroy();
        super.onDestroy();
    }
}
