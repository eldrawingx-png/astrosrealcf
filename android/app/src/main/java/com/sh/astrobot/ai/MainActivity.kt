package com.sh.astrobot.ai

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.WindowManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private var pendingWebPermissionRequest: PermissionRequest? = null

    private val prefs by lazy {
        getSharedPreferences("sh_astrobot_native_prefs", Context.MODE_PRIVATE)
    }

    private val runtimePermissionsLauncher =
        registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) {
            // Re-grant pending WebView camera/mic request if user just accepted Android permissions
            pendingWebPermissionRequest?.let { req ->
                req.grant(req.resources)
                pendingWebPermissionRequest = null
            }
        }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        window.statusBarColor = Color.parseColor("#07090E")
        window.navigationBarColor = Color.parseColor("#07090E")

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor("#07090E"))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                allowFileAccess = true
                allowContentAccess = true
                mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                cacheMode = WebSettings.LOAD_DEFAULT
                userAgentString = "$userAgentString SHAstroBotAndroid/1.0"
            }

            addJavascriptInterface(AstroBotJsBridge(this@MainActivity), "AstroBotAndroid")

            webChromeClient = object : WebChromeClient() {
                override fun onPermissionRequest(request: PermissionRequest) {
                    runOnUiThread {
                        val needed = mutableListOf<String>()
                        if (request.resources.contains(PermissionRequest.RESOURCE_VIDEO_CAPTURE) &&
                            !hasPermission(Manifest.permission.CAMERA)
                        ) {
                            needed.add(Manifest.permission.CAMERA)
                        }
                        if (request.resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE) &&
                            !hasPermission(Manifest.permission.RECORD_AUDIO)
                        ) {
                            needed.add(Manifest.permission.RECORD_AUDIO)
                        }

                        if (needed.isEmpty()) {
                            request.grant(request.resources)
                        } else {
                            pendingWebPermissionRequest = request
                            runtimePermissionsLauncher.launch(needed.toTypedArray())
                        }
                    }
                }
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    return false
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError
                ) {
                    if (request.isForMainFrame) {
                        val currentUrl = getCurrentServerUrl()
                        val fallbackHtml = """
                            <!doctype html>
                            <html lang="es">
                            <head>
                              <meta charset="utf-8" />
                              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
                              <style>
                                body { margin:0; background:#07090E; color:#E2E8F0; font-family:sans-serif; display:flex; min-height:100vh; align-items:center; justify-content:center; padding:24px; box-sizing:border-box; }
                                .card { max-width:420px; width:100%; background:#0D111A; border:1px solid #1E293B; border-radius:16px; padding:24px; }
                                h1 { margin:0 0 8px; font-size:18px; color:#22D3EE; }
                                p { margin:0 0 16px; font-size:13px; line-height:1.5; color:#94A3B8; }
                                code { display:block; background:#04070D; border:1px solid #1E293B; padding:10px; border-radius:8px; font-size:12px; color:#67E8F9; margin-bottom:16px; word-break:break-all; }
                                button { width:100%; min-height:44px; border:0; border-radius:10px; font-size:13px; font-weight:600; margin-bottom:10px; cursor:pointer; }
                                .primary { background:#06B6D4; color:#020617; }
                                .secondary { background:#1E293B; color:#E2E8F0; }
                              </style>
                            </head>
                            <body>
                              <div class="card">
                                <h1>S.H. AstroBot AI</h1>
                                <p>No se pudo conectar con el servidor de AstroBot:</p>
                                <code>$currentUrl</code>
                                <p>Si estás conectado por USB con <b>adb</b>, asegúrate de ejecutar <b>adb reverse tcp:3000 tcp:3000</b> y tener el servidor activo, o cambia al servidor en la nube.</p>
                                <button class="primary" onclick="location.reload()">Reintentar conexión</button>
                                <button class="secondary" onclick="AstroBotAndroid.useCloudServer()">Usar servidor Cloud HTTPS</button>
                                <button class="secondary" onclick="AstroBotAndroid.useUsbLocalServer()">Usar servidor USB (127.0.0.1:3000)</button>
                              </div>
                            </body>
                            </html>
                        """.trimIndent()
                        view.loadDataWithBaseURL(null, fallbackHtml, "text/html", "UTF-8", null)
                    }
                }
            }
        }

        setContentView(webView)
        requestInitialPermissions()
        setupBackNavigation()
        webView.loadUrl(getCurrentServerUrl())
    }

    private fun setupBackNavigation() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    finish()
                }
            }
        })
    }

    private fun requestInitialPermissions() {
        val perms = mutableListOf(
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            perms.add(Manifest.permission.BLUETOOTH_SCAN)
            perms.add(Manifest.permission.BLUETOOTH_CONNECT)
        } else {
            perms.add(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        val missing = perms.filter { !hasPermission(it) }
        if (missing.isNotEmpty()) {
            runtimePermissionsLauncher.launch(missing.toTypedArray())
        }
    }

    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(this, permission) ==
            PackageManager.PERMISSION_GRANTED
    }

    fun getCurrentServerUrl(): String {
        return prefs.getString("server_url", BuildConfig.DEFAULT_SERVER_URL)
            ?: BuildConfig.DEFAULT_SERVER_URL
    }

    fun updateServerUrl(newUrl: String) {
        val clean = newUrl.trim()
        if (!clean.startsWith("http://") && !clean.startsWith("https://")) return
        prefs.edit().putString("server_url", clean).apply()
        runOnUiThread {
            webView.loadUrl(clean)
        }
    }

    fun setScreenAwake(enabled: Boolean) {
        runOnUiThread {
            if (enabled) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
    }

    fun triggerHaptic(durationMs: Long) {
        val clamped = durationMs.coerceIn(10L, 400L)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
            vm?.defaultVibrator?.vibrate(
                VibrationEffect.createOneShot(clamped, VibrationEffect.DEFAULT_AMPLITUDE)
            )
        } else {
            @Suppress("DEPRECATION")
            val v = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                v?.vibrate(
                    VibrationEffect.createOneShot(clamped, VibrationEffect.DEFAULT_AMPLITUDE)
                )
            } else {
                @Suppress("DEPRECATION")
                v?.vibrate(clamped)
            }
        }
    }

    override fun onDestroy() {
        webView.destroy()
        super.onDestroy()
    }
}

class AstroBotJsBridge(private val activity: MainActivity) {

    @JavascriptInterface
    fun isNativeAndroid(): Boolean = true

    @JavascriptInterface
    fun getAppVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun getServerUrl(): String = activity.getCurrentServerUrl()

    @JavascriptInterface
    fun setServerUrl(url: String) {
        activity.updateServerUrl(url)
    }

    @JavascriptInterface
    fun useUsbLocalServer() {
        activity.updateServerUrl(BuildConfig.USB_LOCAL_URL)
    }

    @JavascriptInterface
    fun useCloudServer() {
        activity.updateServerUrl(BuildConfig.DEFAULT_SERVER_URL)
    }

    @JavascriptInterface
    fun setKeepScreenOn(enabled: Boolean) {
        activity.setScreenAwake(enabled)
    }

    @JavascriptInterface
    fun vibrate(durationMs: Long) {
        activity.triggerHaptic(durationMs)
    }
}
