package com.jacobhl.hidescore;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HideScoreGoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
