package app.luckylines

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.webkit.WebViewAssetLoader
import android.webkit.WebViewClient
import org.json.JSONObject

class MainActivity : Activity() {
    private lateinit var web: WebView
    private var pendingImport: String? = null
    private var insetTop = 0
    private var insetBottom = 0

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        Notify.channels(this)
        pendingImport = importFrom(intent)

        val loader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()
        web = WebView(this)
        web.setBackgroundColor(0xFF10121A.toInt())
        setContentView(web)
        web.settings.javaScriptEnabled = true
        web.settings.domStorageEnabled = true
        web.settings.allowFileAccess = false
        web.settings.allowContentAccess = false
        web.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? =
                loader.shouldInterceptRequest(request.url)

            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                if (request.url.host == "appassets.androidplatform.net") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, request.url)) } catch (e: Exception) { /* no handler */ }
                return true
            }

            override fun onPageFinished(view: WebView, url: String) = pushInsets()
        }
        web.addJavascriptInterface(Bridge(), "LuckyBridge")

        // targetSdk 35 draws edge to edge: hand the system bar sizes to the page so nothing sits under them.
        ViewCompat.setOnApplyWindowInsetsListener(web) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            insetTop = bars.top
            insetBottom = bars.bottom
            pushInsets()
            insets
        }
        web.loadUrl("https://appassets.androidplatform.net/assets/web/index.html")
        Scheduler.schedulePeriodic(this)
    }

    private fun pushInsets() {
        val d = resources.displayMetrics.density
        val js = "document.documentElement.style.setProperty('--inset-top','${(insetTop / d).toInt()}px');" +
            "document.documentElement.style.setProperty('--inset-bottom','${(insetBottom / d).toInt()}px');"
        web.evaluateJavascript(js, null)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val p = importFrom(intent) ?: return
        web.evaluateJavascript("window.onLuckyImport && window.onLuckyImport(${JSONObject.quote(p)})", null)
    }

    private fun importFrom(i: Intent?): String? {
        val u: Uri = i?.data ?: return null
        return u.getQueryParameter("p")?.let { "?p=$it" }
    }

    @Deprecated("Still the simplest way to route back presses into the page")
    override fun onBackPressed() {
        web.evaluateJavascript("window.onLuckyBack ? window.onLuckyBack() : false") { handled ->
            if (handled != "true") finish()
        }
    }

    fun askNotifications() {
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(arrayOf(Manifest.permission.POST_NOTIFICATIONS), 7)
        }
    }

    inner class Bridge {
        @JavascriptInterface
        fun share(text: String) = runOnUiThread {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
            }
            startActivity(Intent.createChooser(send, "Send lines"))
        }

        @JavascriptInterface
        fun sync(json: String) {
            Store.saveSync(this@MainActivity, json)
            Scheduler.scheduleReminders(this@MainActivity)
        }

        @JavascriptInterface
        fun requestNotifications() = runOnUiThread { askNotifications() }

        @JavascriptInterface
        fun getPendingImport(): String? {
            val p = pendingImport
            pendingImport = null
            return p
        }

        @JavascriptInterface
        fun exportBackup(json: String) = runOnUiThread {
            val send = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_SUBJECT, "Lucky Lines backup")
                putExtra(Intent.EXTRA_TEXT, json)
            }
            startActivity(Intent.createChooser(send, "Save backup to"))
        }
    }
}
