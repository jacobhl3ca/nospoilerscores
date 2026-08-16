package com.jacobhl.hidescore;

import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(HideScoreGoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
        installBackHandler();
    }

    // Capacitor's own Android layer has no back-button handling at all, so what the
    // hardware/gesture Back does is whatever happens to be registered. Here that was
    // @capacitor/app's callback, which goes back in WebView history when it can and
    // otherwise does *nothing*: at the root page Back was a dead button and the app
    // could not be dismissed with it. (The shells without @capacitor/app have the
    // opposite bug, closing the app from any depth.) Registering after
    // super.onCreate() puts this callback last, and the dispatcher runs the most
    // recently added one first, so this is the behaviour that wins.
    //
    // goBack() pops WebView history, which fires popstate on hidescore.com, so the
    // ?v= video-modal history entries in HomeContent.tsx still unwind correctly.
    private void installBackHandler() {
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() == null ? null : getBridge().getWebView();
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    finish();
                }
            }
        });
    }
}
