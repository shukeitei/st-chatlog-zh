# 把白月光接回家

把星野 / 猫箱的聊天记录转换成 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 可导入的 `.jsonl` 格式。

🔗 在线使用：https://shukeitei.github.io/st-chatlog-zh/

## 它能做什么

- 输入「你的名字」「对方名字」和一段纯文本对话，导出 SillyTavern 聊天记录文件
- 自动识别文本里的起始时间，也可手动指定
- 支持先导出「前 3 条测试包」验证显示效果，再导出完整版
- **全程在浏览器本地完成，不上传任何数据**

## 它不做什么

这是**格式转换**工具，不处理图片和视频。截图 / 录屏需要先用 Gemini（手机 App 或 Google AI
Studio 网页版都行）整理成 `USER: 内容` 和 `角色名: 内容` 这样一行一句的纯文本，再回到本工具转换。

## 开发

```bash
npm install
npm run dev      # 本地预览
npm run build    # 构建到 dist/
```

推送到 `main` 分支后，GitHub Actions 自动构建并部署到 GitHub Pages。

## 技术栈

Vite + React，单页静态站点。核心转换逻辑在 `src/App.jsx`。
