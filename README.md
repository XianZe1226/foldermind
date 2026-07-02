# FolderMind

FolderMind 是一个本地优先的 AI 文件夹整理与复习笔记桌面应用。  
它面向“把一整个课程资料文件夹快速整理成可复习内容”这个场景，支持先扫描文件夹、再由用户确认是否总结，最后自动生成单篇笔记、总报告和整体复习总结。

## 项目定位

这个项目适合以下场景：

- 课程资料整理
- 考前突击复习
- 项目资料归档与总结
- 多份文档自动分类成笔记

核心目标不是做一个通用聊天工具，而是做一个“以文件夹资料为输入”的本地知识整理软件。

## 主要功能

- 导入本地文件夹中的 `md / txt / pdf / docx`
- 递归扫描文件夹并建立文档清单
- 本地提取正文内容，支持 PDF / DOCX 读取
- 支持扫描版 PDF 的 OCR fallback
- 支持配置国内模型接口
  - DeepSeek
  - Qwen
  - GLM
  - MiniMax
- 扫描后不会自动调用模型，必须由用户确认后才开始总结
- 为每个文件生成一份较短的分类笔记
- 生成一份文件夹总报告 `foldermind-report.md`
- 额外生成一份更长、更全面的整体复习总结 `foldermind-review-summary.md`
- 自动把结果写回所选文件夹中的 `FolderMind-output`
- 总结完成后可直接弹窗打开整体复习总结文档

## 整体复习总结策略

整体复习总结不是简单拼接单篇摘要，而是单独再做一次总结。

当前规则：

- 单个文件总结更短，偏速读卡片
- 最终整体复习总结更长、更详实
- 默认按“只有 3 天时间、而且此前没学过这门课”的突击复习视角输出
- 只以所选文件夹中的资料内容为基准，不凭空补充课外知识
- 如果文件夹中混有多学科内容，会优先围绕文件数量最多、内容最成体系的一科来总结

## 支持的输入类型

- `.md`
- `.txt`
- `.pdf`
- `.docx`

其中：

- `md / txt` 直接读取文本
- `docx` 使用本地解析提取正文
- `pdf` 先做本地文本提取，不足时再走 OCR

## OCR 说明

当前内置 OCR Provider：

- 百度 OCR

使用方式：

1. 打开“接口设置”
2. 选择 OCR Provider
3. 填写 OCR 的 `API Key` 和 `Secret Key`
4. 点击保存
5. 重新扫描文件夹

注意：OCR 配置保存后，要重新扫描文件夹才会参与 PDF 读取。

## 使用流程

1. 打开应用
2. 进入“接口设置”保存模型配置
3. 如需 OCR，再保存 OCR 配置
4. 选择本地文件夹
5. 查看扫描结果
6. 手动点击“总结当前文件夹”
7. 等待应用生成单篇笔记、总报告和整体复习总结
8. 应用自动把结果写回原文件夹

## 输出文件

总结完成后，会在所选文件夹下自动生成：

```text
FolderMind-output/
  foldermind-report.md
  foldermind-review-summary.md
  foldermind-notes.json
  notes/
    *.md
```

说明：

- `foldermind-report.md`：文件夹整理总报告
- `foldermind-review-summary.md`：整体复习总结
- `foldermind-notes.json`：结构化笔记数据
- `notes/*.md`：每个文件对应的单独笔记

## 技术栈

- Tauri
- React
- TypeScript
- Rust

## 本地开发

安装依赖：

```bash
npm install
```

启动前端开发：

```bash
npm run dev
```

启动桌面开发：

```bash
npm run tauri:dev
```

构建前端：

```bash
npm run build
```

构建桌面应用：

```bash
npm run tauri:build -- --debug
```

## 演示数据

项目内置了一份演示资料，可用于体验完整流程：

[demo-data/ml-course](/Users/xianze/Documents/Codex/2026-07-02/w-m/foldermind/demo-data/ml-course)

## 当前实现状态

目前已经完成：

- 本地文件夹扫描
- PDF / DOCX / TXT / Markdown 内容提取
- OCR fallback
- 国内模型接口配置与保存
- 单篇分类笔记生成
- 文件夹总报告生成
- 整体复习总结生成
- 自动写回原文件夹
- 总结完成后打开复习总结文档

## 后续可扩展方向

- 增加更多 OCR Provider
- 支持更多文档格式
- 增加复习模式模板
- 增加课程/学科识别可视化
- 增加知识点关系图谱
