package com.jacobhl.hidescore;

import android.content.Intent;
import android.net.Uri;
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
        loadAppLink(getIntent());
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

    // The activity is singleTask, so a link tapped while the app is already running
    // arrives here rather than through onCreate.
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadAppLink(intent);
    }

    // This app is a server.url shell — the WebView loads hidescore.com itself — so
    // handling an app link means pointing that WebView at the incoming URL. Without
    // this the link opens the app but leaves it on whatever page it was showing, which
    // is indistinguishable from the link being ignored. @capacitor/app is not used for
    // this, so it is done natively.
    private void loadAppLink(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri uri = intent.getData();
        if (uri == null) return;
        if (!"https".equals(uri.getScheme())) return;  // hidescore-auth:// is the plugin's, not ours
        String host = uri.getHost();
        if (!"hidescore.com".equals(host) && !"www.hidescore.com".equals(host)) return;
        if (getBridge() == null || getBridge().getWebView() == null) return;
        final String url = uri.toString();
        runOnUiThread(() -> getBridge().getWebView().loadUrl(url));
    }
}
