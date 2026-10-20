package com.dhamantaha.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    private AppLock appLock;

    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReceiptWalletPlugin.class);
        registerPlugin(AppLockPlugin.class);
        super.onCreate(savedInstanceState);
        appLock = new AppLock(this);
    }

    AppLock getAppLock() { return appLock; }

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
