# 拾光手账（APK 版）

个人手账风日记 Android App。核心特色：**日记只有当天可以修改，过去的日子自动封存，之后只能追加批注**；一天可写多篇，批注随时可改。

技术方案：原生 WebView 壳 + 内置 H5 页面（`app/src/main/assets/`），**零第三方依赖、无网络权限、完全离线**，数据只存本机。

## 功能

- 📅 月历：有日记的花边圆章标记，未来日期置灰不可点
- 📝 一天多篇日记：心情 / 天气 / 标题 / 正文，写作时间精确到秒
- 🔒 自动封存：过了当天正文不可修改；过去没写的日子允许「补写」，保存即封存
- 🗒️ 批注：随时对任意日记新增 / 点击修改（带创建与修改时间）
- 🔍 搜索：同时搜标题、正文、批注，命中高亮
- 📦 一键备份：导出 / 导入 JSON（App 内保存到系统「下载」目录）
- 🎨 轻复古奶油色 UI：和纸胶带、橡皮章、朱砂印章、做旧纸纹

## 云端构建 APK（无需本地安装任何工具）

1. 仓库页 **Actions** → 选择 **Build APK** → **Run workflow**
2. 等待运行变绿（约 2~3 分钟）
3. 点进该次运行 → 底部 **Artifacts** → 下载 `shiguang-apk`，解压得到 `app-debug.apk`
4. 传到手机直接安装（允许「未知来源」即可）

也可在本地构建（需自备 JDK 17 + Android SDK）：

```bash
gradle assembleDebug   # 产物：app/build/outputs/apk/debug/app-debug.apk
```

## 更新页面内容

H5 页面源码在 `app/src/main/assets/`，改完后提交推送，Actions 会自动重新构建出新 APK。

## 数据说明

- 数据以 localStorage 形式存在 App 内部，卸载即清除；换机前请先在「数据备份」页导出 JSON
- 与浏览器 / PWA 版数据互不相通，可用导出 / 导入迁移
- 无任何联网行为，备份文件仅保存在本机「下载」目录

## 技术栈

| 层 | 说明 |
|---|---|
| 壳 | Android WebView（Java，minSdk 26 / targetSdk 35） |
| 页面 | 原生 HTML / CSS / JS，无框架无构建 |
| CI | GitHub Actions（Temurin 17 + Gradle 8.9 + AGP 8.5.2） |
