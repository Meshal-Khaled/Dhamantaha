package com.dhamantaha.app;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReceiptWalletPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
