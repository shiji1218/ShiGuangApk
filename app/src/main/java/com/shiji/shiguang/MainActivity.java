package com.shiji.shiguang;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.MediaStore;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/**
 * 拾光手账 · WebView 壳
 * - 加载 assets 内的 H5，完全离线
 * - 开启 DOM Storage（localStorage 持久化）
 * - JS 桥：备份文件保存到系统「下载」目录
 * - 文件选择器：支持「从备份文件导入」
 */
public class MainActivity extends Activity {

    private static final int REQ_FILE = 1001;
    private static final int REQ_PERM = 1002;
    private static final int REQ_NOTIF = 1003;

    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private String[] pendingSave;   // {name, content} 等待存储权限
    private final Handler main = new Handler(Looper.getMainLooper());

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings st = web.getSettings();
        st.setJavaScriptEnabled(true);
        st.setDomStorageEnabled(true);
        st.setAllowFileAccess(true);
        st.setAllowFileAccessFromFileURLs(true);
        st.setAllowUniversalAccessFromFileURLs(true);
        st.setTextZoom(100);   // 跟随系统字体缩放会打乱 H5 自适应布局

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme() == null ? "" : u.getScheme();
                // 只允许本地页面与内部数据流，外部链接一律不放行
                return !(scheme.equals("file") || scheme.equals("data") || scheme.equals("blob"));
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_GET_CONTENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                String[] types = params.getAcceptTypes();
                String type = (types != null && types.length > 0
                        && types[0] != null && !types[0].isEmpty()) ? types[0] : "*/*";
                intent.setType(type);
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                    intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                }
                try {
                    startActivityForResult(Intent.createChooser(intent, "选择文件"), REQ_FILE);
                } catch (Exception e) {
                    fileCallback = null;
                    return false;
                }
                return true;
            }
        });

        web.addJavascriptInterface(new Bridge(), "AppBridge");
        setContentView(web);
        web.loadUrl("file:///android_asset/index.html");
    }

    /** 提供给 H5 的原生桥 */
    private class Bridge {
        @JavascriptInterface
        public void saveFile(String name, String content) {
            if (Build.VERSION.SDK_INT >= 29) {
                doSave(name, content);
                return;
            }
            // Android 9 及以下：需要写存储权限
            if (checkSelfPermission(Manifest.permission.WRITE_EXTERNAL_STORAGE)
                    == PackageManager.PERMISSION_GRANTED) {
                doSave(name, content);
            } else {
                pendingSave = new String[]{name == null ? "" : name, content == null ? "" : content};
                requestPermissions(new String[]{Manifest.permission.WRITE_EXTERNAL_STORAGE}, REQ_PERM);
            }
        }

        @JavascriptInterface
        public void setDailyReminder(int hour, int minute) {
            // Android 13+ 通知需要运行时权限
            if (Build.VERSION.SDK_INT >= 33) {
                main.post(() -> requestPermissions(
                        new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF));
            }
            ReminderScheduler.set(MainActivity.this, hour, minute);
        }

        @JavascriptInterface
        public void cancelDailyReminder() {
            ReminderScheduler.cancel(MainActivity.this);
        }
    }

    private void doSave(String name, String content) {
        final String fileName = (name == null || name.isEmpty())
                ? "shiguang-backup.json" : name;
        final String body = content == null ? "" : content;

        new Thread(() -> {
            boolean ok = false;
            try {
                if (Build.VERSION.SDK_INT >= 29) {
                    ContentValues cv = new ContentValues();
                    cv.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
                    cv.put(MediaStore.Downloads.MIME_TYPE, "application/json");
                    Uri uri = getContentResolver()
                            .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
                    if (uri != null) {
                        try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                            if (os != null) {
                                os.write(body.getBytes(StandardCharsets.UTF_8));
                                ok = true;
                            }
                        }
                    }
                } else {
                    File dir = Environment.getExternalStoragePublicDirectory(
                            Environment.DIRECTORY_DOWNLOADS);
                    if (!dir.exists()) dir.mkdirs();
                    File file = new File(dir, fileName);
                    try (FileOutputStream fos = new FileOutputStream(file)) {
                        fos.write(body.getBytes(StandardCharsets.UTF_8));
                        ok = true;
                    }
                }
            } catch (Exception e) {
                ok = false;
            }
            final boolean done = ok;
            main.post(() -> toast(done
                    ? "备份已保存到「下载」目录 📦"
                    : "备份保存失败 ⚠️"));
        }).start();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE && fileCallback != null) {
            Uri[] out = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    // 多选
                    android.content.ClipData clip = data.getClipData();
                    java.util.ArrayList<Uri> list = new java.util.ArrayList<>();
                    for (int i = 0; i < clip.getItemCount(); i++) {
                        Uri u = clip.getItemAt(i).getUri();
                        if (u != null) list.add(u);
                    }
                    if (!list.isEmpty()) out = list.toArray(new Uri[0]);
                } else if (data.getData() != null) {
                    out = new Uri[]{data.getData()};
                }
            }
            fileCallback.onReceiveValue(out);
            fileCallback = null;
            return;
        }
        if (requestCode == REQ_PERM) {
            if (resultCode == RESULT_OK && pendingSave != null) {
                doSave(pendingSave[0], pendingSave[1]);
            } else {
                pendingSave = null;
                toast("没有存储权限，无法保存备份");
            }
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
        } else {
            super.onBackPressed();
        }
    }

    private void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
    }
}
