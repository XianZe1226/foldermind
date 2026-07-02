# FolderMind

一个本地优先的 AI 文件夹整理与分类笔记桌面应用。

## 当前完成的 MVP

- 导入本地文件夹中的 `md / txt / pdf / docx`
- 扫描并建立文档清单
- 解析 Markdown、TXT、PDF 和 DOCX 正文
- 默认接入 DeepSeek 配置流，必须保存 API 参数后才能总结
- 先扫描文件夹，再由用户确认是否总结
- 自动把报告、笔记 JSON 和 Markdown 笔记写回所选文件夹内的 `FolderMind-output`
- 在分类工作区中查看和编辑笔记
- 保存最近一次整理结果到本地状态
- 预置 `Tauri + React + TypeScript` 工程结构

## 本地运行

```bash
npm install
npm run dev
```

打开后可以先选择 [demo-data/ml-course](/Users/xianze/Documents/Codex/2026-07-02/w-m/foldermind/demo-data/ml-course) 体验完整流程。

## 桌面运行

```bash
npm install
npm run tauri:dev
```

## 输出结果

总结完成后，会自动在用户所选文件夹内生成：

- `FolderMind-output/foldermind-report.md`
- `FolderMind-output/foldermind-notes.json`
- `FolderMind-output/notes/*.md`
