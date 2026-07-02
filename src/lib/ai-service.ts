import { categoryDescriptions } from "./constants";
import type { DocumentRecord, GeneratedNote, ImportSummary, ProviderSettings } from "./types";

interface RemoteNotePayload {
  title: string;
  summary: string;
  category: string;
  tags: string[];
  keywords: string[];
  content: string;
  confidence?: "high" | "medium" | "low";
}

interface RemoteFolderPayload {
  overview: string;
  recommendedOrder: string[];
  highlights: string[];
  categories: Array<{ name: string; description: string; noteCount: number }>;
}

export async function generateNotesFromDocuments(
  documents: DocumentRecord[],
  settings: ProviderSettings,
  folderName: string
): Promise<{ notes: GeneratedNote[]; summary: ImportSummary; reviewMarkdown: string }> {
  if (!settings.apiKey.trim()) {
    throw new Error("请先在设置页保存当前模型的 API Key，再开始总结。");
  }

  const notes: GeneratedNote[] = [];

  for (const document of documents) {
    const payload = await requestSingleNote(document, settings);
    const now = Date.now();
    notes.push({
      id: crypto.randomUUID(),
      documentId: document.id,
      title: payload.title || document.name.replace(/\.[^.]+$/, ""),
      summary: payload.summary || "未返回摘要。",
      category: payload.category || "杂项归档",
      tags: (payload.tags ?? []).slice(0, 8),
      keywords: (payload.keywords ?? []).slice(0, 8),
      content:
        payload.content ||
        [
          `# ${payload.title || document.name}`,
          "",
          "## AI 摘要",
          payload.summary || "未返回摘要。",
          "",
          "## 源文件",
          `- ${document.relativePath}`,
          "",
          "## 个人补充",
          "在这里继续补充你的理解、待办和关联资料。"
        ].join("\n"),
      confidence: payload.confidence ?? inferConfidence(document),
      createdAt: now,
      updatedAt: now
    });
  }

  const overviewPayload = await requestFolderSummary(folderName, notes, documents, settings);
  const generatedAt = Date.now();
  const summary: ImportSummary = {
    folderName,
    generatedAt,
    overview: overviewPayload.overview,
    recommendedOrder: overviewPayload.recommendedOrder,
    highlights: overviewPayload.highlights,
    categories: overviewPayload.categories
  };
  const reviewMarkdown = await requestReviewSummaryMarkdown(
    folderName,
    notes,
    summary,
    settings
  );

  return {
    notes,
    summary,
    reviewMarkdown
  };
}

async function requestSingleNote(document: DocumentRecord, settings: ProviderSettings) {
  const prompt = [
    "你是一个严谨的中文资料整理助手，请把输入文档整理成结构化笔记。",
    "只返回 JSON，不要输出 Markdown 代码块。",
    '字段: title(string), summary(string), category(string), tags(string[]), keywords(string[]), content(string), confidence("high"|"medium"|"low")',
    "要求:",
    "1. summary 控制在 60-110 字中文，必须具体、紧凑，像速读卡片，不要空话。",
    "2. category 只能从 课程学习、项目资料、会议纪要、阅读摘录、杂项归档 中选一个。",
    "3. content 必须是简短、可继续编辑的 Markdown 笔记，尽量控制总长度在 220-420 字。",
    "4. content 至少包含“AI 摘要”“关键要点”“后续动作”三个二级标题，但每节都要短。",
    "5. 如果正文内容不足，请明确指出不足，不要编造细节。",
    `文件名: ${document.name}`,
    `相对路径: ${document.relativePath}`,
    `抽取状态: ${document.warnings.length ? document.warnings.join("；") : "正文抽取正常"}`,
    `正文: ${trimForModel(document.text, 12000)}`
  ].join("\n");

  return requestJson<RemoteNotePayload>(prompt, settings);
}

async function requestFolderSummary(
  folderName: string,
  notes: GeneratedNote[],
  documents: DocumentRecord[],
  settings: ProviderSettings
) {
  const prompt = [
    "你是一个知识管理助手，请根据已经生成的文档笔记，输出整个文件夹的整理报告。",
    "只返回 JSON，不要输出 Markdown 代码块。",
    '字段: overview(string), recommendedOrder(string[]), highlights(string[]), categories([{name,description,noteCount}])',
    "要求:",
    "1. overview 需要能直接放进报告首页，先判断文件夹是否混有多学科内容。",
    "2. 如果混有多学科，只围绕文件数量最多、内容最成体系的一门学科作为主学科来组织报告，其他零散学科只在一句话里说明被弱化处理。",
    "3. highlights 输出 4-8 条重要发现，优先写主学科的重点、难点和复习风险。",
    "4. categories 中的 description 要具体，不要空泛。",
    `文件夹名: ${folderName}`,
    `总文件数: ${documents.length}`,
    `笔记摘要数据: ${JSON.stringify(
      notes.map((note) => ({
        title: note.title,
        category: note.category,
        summary: note.summary,
        tags: note.tags
      }))
    )}`
  ].join("\n");

  const payload = await requestJson<RemoteFolderPayload>(prompt, settings);
  return {
    overview: payload.overview,
    recommendedOrder: payload.recommendedOrder?.length
      ? payload.recommendedOrder
      : [...new Set(notes.map((note) => note.category))],
    highlights: payload.highlights?.length
      ? payload.highlights
      : ["本次整理未返回高质量亮点，建议重新调整提示词。"],
    categories:
      payload.categories?.length
        ? payload.categories
        : buildFallbackCategories(notes)
  };
}

async function requestReviewSummaryMarkdown(
  folderName: string,
  notes: GeneratedNote[],
  summary: ImportSummary,
  settings: ProviderSettings
) {
  const prompt = [
    "你是一个中文复习整理助手，请基于整批资料的笔记结果，输出一份可直接保存为 Markdown 的整体复习总结。",
    "不要输出 JSON，不要输出代码块围栏，直接输出 Markdown 正文。",
    "要求:",
    "1. 标题使用一级标题。",
    "2. 这是给一个此前完全没学过这门课的人做三天突击复习用的总结，必须以所选文件夹里的资料内容为唯一基准，不要带入资料之外的课程知识。",
    "3. 如果检测到混有多学科内容，只选择文件数量最多、内容最成体系的一门学科作为最终总结主线，其他学科最多用一小段说明已弱化处理。",
    "4. 全文要长、全面、详实，优先帮助零基础读者在三天内抓住框架、重点、高频概念和最可能卡住的地方。",
    "5. 必须至少包含这些二级标题：这门课到底在讲什么、三天突击复习路线、核心知识点总表、必须优先吃透的概念、高频易错/易混点、按天复习安排、考前速记版。",
    "6. 在“核心知识点总表”里尽量按主题分组展开；在“按天复习安排”里给出 Day 1 / Day 2 / Day 3。",
    "7. 如果材料不完整，要明确指出缺口，不要编造。",
    `文件夹名: ${folderName}`,
    `整体总览: ${summary.overview}`,
    `重点发现: ${summary.highlights.join("；")}`,
    `推荐阅读顺序: ${summary.recommendedOrder.join(" -> ")}`,
    `笔记数据: ${JSON.stringify(
      notes.map((note) => ({
        title: note.title,
        category: note.category,
        summary: note.summary,
        keywords: note.keywords,
        tags: note.tags
      }))
    )}`
  ].join("\n");

  try {
    const content = await requestText(prompt, settings);
    return content.trim() || buildFallbackReviewMarkdown(folderName, notes, summary);
  } catch {
    return buildFallbackReviewMarkdown(folderName, notes, summary);
  }
}

async function requestJson<T>(prompt: string, settings: ProviderSettings): Promise<T> {
  const response = await fetch(resolveChatEndpoint(settings.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.25,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "你是一个谨慎、结构化、擅长生成中文知识整理结果的助手。"
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型接口请求失败(${response.status}): ${detail}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("模型接口没有返回可解析内容。");
  }

  return safeJsonParse<T>(content);
}

async function requestText(prompt: string, settings: ProviderSettings): Promise<string> {
  const response = await fetch(resolveChatEndpoint(settings.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: "你是一个擅长把资料整理成中文复习讲义和复盘提纲的助手。"
        },
        {
          role: "user",
          content: prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`模型接口请求失败(${response.status}): ${detail}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };

  return data.choices?.[0]?.message?.content?.trim() ?? "";
}

function safeJsonParse<T>(content: string): T {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(cleaned) as T;
}

function resolveChatEndpoint(baseUrl: string): string {
  const normalized = baseUrl.replace(/\/$/, "");
  if (normalized.endsWith("/chat/completions")) {
    return normalized;
  }
  if (normalized.endsWith("/v1")) {
    return `${normalized}/chat/completions`;
  }
  return `${normalized}/v1/chat/completions`;
}

function trimForModel(text: string, maxLength: number): string {
  if (!text) {
    return "正文为空，请基于文件名和路径做保守判断。";
  }

  return text.length > maxLength ? `${text.slice(0, maxLength)}\n\n[内容已截断]` : text;
}

function buildFallbackCategories(notes: GeneratedNote[]) {
  const counters = new Map<string, number>();
  for (const note of notes) {
    counters.set(note.category, (counters.get(note.category) ?? 0) + 1);
  }

  return [...counters.entries()].map(([name, noteCount]) => ({
    name,
    noteCount,
    description: categoryDescriptions[name] ?? "自动生成的资料分类。"
  }));
}

function inferConfidence(document: DocumentRecord): "high" | "medium" | "low" {
  if (document.text.length > 2000 && !document.warnings.length) {
    return "high";
  }
  if (document.text.length > 400) {
    return "medium";
  }
  return "low";
}

function buildFallbackReviewMarkdown(
  folderName: string,
  notes: GeneratedNote[],
  summary: ImportSummary
) {
  const grouped = new Map<string, GeneratedNote[]>();
  for (const note of notes) {
    const bucket = grouped.get(note.category) ?? [];
    bucket.push(note);
    grouped.set(note.category, bucket);
  }

  return [
    `# ${folderName} 整体复习总结`,
    "",
    "## 这门课到底在讲什么",
    summary.overview || "当前材料里没有足够的信息概括整门课，但可以先按已有资料的主线主题来突击复习。",
    "",
    "## 三天突击复习路线",
    "假设你此前没有系统学过这门课，建议先用半天搭框架，再用一天半啃核心主题，最后一天做查漏补缺和速记回看。",
    "",
    "## 核心知识点总表",
    ...notes.slice(0, 12).map((note) => `- ${note.title}: ${note.summary}`),
    "",
    "## 必须优先吃透的概念",
    ...notes.slice(0, 6).map((note) => `- ${note.title}`),
    "",
    "## 高频易错 / 易混点",
    ...summary.highlights.map((item) => `- ${item}`),
    "",
    "## 按天复习安排",
    "### Day 1",
    ...summary.recommendedOrder.slice(0, 2).map((item, index) => `${index + 1}. 先过 ${item}`),
    "### Day 2",
    ...summary.recommendedOrder.slice(2, 5).map((item, index) => `${index + 1}. 深入 ${item}`),
    "### Day 3",
    "- 回看重点发现、易错点和正文较短但可能会考的内容。",
    "",
    "## 分类回看",
    ...[...grouped.entries()].map(
      ([category, categoryNotes]) =>
        `- ${category}: ${categoryNotes.map((note) => note.title).join("、")}`
    ),
    "",
    "## 考前速记版",
    "- 先按上面的复习顺序过一遍分类。",
    "- 优先回看高频关键词、标题重复出现的主题和重点发现。",
    "- 对正文较短或抽取不完整的资料，建议回原文件补读。"
  ].join("\n");
}
