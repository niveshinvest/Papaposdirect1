package com.papapos;

import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.appcompat.app.AppCompatActivity;
import com.papapos.bridge.PapaPrintBridge;

/**
 * PapaPOS Android Main Activity
 * Integrates the WebView with the Native Print Bridge
 */
public class MainActivity extends AppCompatActivity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        WebSettings webSettings = webView.getSettings();
        webSettings.setJavaScriptEnabled(true);
        webSettings.setDomStorageEnabled(true);

        // Register the Native Print Bridge
        webView.addJavascriptInterface(new PapaPrintBridge(webView), "PapaPrint");

        webView.setWebViewClient(new WebViewClient());
        
        // Replace with your actual hosted URL or local asset path
        webView.loadUrl("https://ais-pre-du5fsgxou56ptfxwxgdin7-31083452987.asia-southeast1.run.app");
    }
}
