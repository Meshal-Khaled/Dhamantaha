package com.dhamantaha.app;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppLock")
public class AppLockPlugin extends Plugin {
    @PluginMethod public void status(PluginCall call) {
        getActivity().runOnUiThread(() -> call.resolve(((MainActivity) getActivity()).getAppLock().status()));
    }

    @PluginMethod public void setEnabled(PluginCall call) {
        Boolean enabled = call.getBoolean("enabled");
        if (enabled == null) { call.reject("Choose whether app lock should be enabled."); return; }
        getActivity().runOnUiThread(() -> ((MainActivity) getActivity()).getAppLock().setEnabled(enabled, (status, error) -> {
            if (error != null) call.reject(error, "authentication_error");
            else call.resolve(status);
        }));
    }
}
