import type { OcrSettings, ProviderSettings, SupportedProvider } from "./types";

export const STORAGE_KEY = "foldermind.snapshot.v3";

export const defaultSettings: ProviderSettings = {
  provider: "deepseek",
  apiKey: "",
  baseUrl: "https://api.deepseek.com",
  model: "deepseek-v4-flash"
};

export const defaultOcrSettings: OcrSettings = {
  provider: "none",
  apiKey: "",
  secretKey: ""
};

export const providerPresets: Record<SupportedProvider, Omit<ProviderSettings, "apiKey">> = {
  deepseek: {
    provider: "deepseek",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-v4-flash"
  },
  qwen: {
    provider: "qwen",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    model: "qwen-plus"
  },
  glm: {
    provider: "glm",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4.5-air"
  },
  minimax: {
    provider: "minimax",
    baseUrl: "https://api.minimax.chat/v1",
    model: "minimax-text-01"
  }
};

export const acceptedExtensions = [".md", ".txt", ".pdf", ".docx"];

export const categoryDescriptions: Record<string, string> = {
  "课程学习": "以课程知识点、理论概念和复习材料为主。",
  "项目资料": "以需求、设计、开发记录和项目说明为主。",
  "会议纪要": "以会议记录、行动项和总结复盘为主。",
  "阅读摘录": "以论文、文章、阅读笔记和观点整理为主。",
  "杂项归档": "无法稳定归类或内容较短的资料。"
};
