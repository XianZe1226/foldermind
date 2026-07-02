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
    documents,
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
    "1. summary 控制在 35-70 字中文，必须具体、紧凑，像速读卡片，不要空话。",
    "2. category 只能从 课程学习、项目资料、会议纪要、阅读摘录、杂项归档 中选一个。",
    "3. content 必须是尽可能短的 Markdown 笔记，优先保留最关键的考点信息，尽量控制总长度在 120-220 字。",
    "4. content 至少包含“AI 摘要”“关键要点”“后续动作”三个二级标题，但每节都必须极短。",
    "5. 如果正文内容不足，请明确指出不足，不要编造细节。",
    `文件名: ${document.name}`,
    `相对路径: ${document.relativePath}`,
    `抽取状态: ${document.warnings.length ? document.warnings.join("；") : "正文抽取正常"}`,
    `正文: ${trimForModel(document.text, 12000)}`
  ].join("\n");

  try {
    return await requestJson<RemoteNotePayload>(prompt, settings);
  } catch {
    return buildFallbackNotePayload(document);
  }
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

  let payload: RemoteFolderPayload;
  try {
    payload = await requestJson<RemoteFolderPayload>(prompt, settings);
  } catch {
    return buildFallbackFolderSummary(folderName, notes, documents);
  }

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
  documents: DocumentRecord[],
  notes: GeneratedNote[],
  summary: ImportSummary,
  settings: ProviderSettings
) {
  const sourcePacket = buildReviewSourcePacket(documents, notes);
  const prompt = [
    "你是一个中文考试冲刺整理助手，请基于整批资料的笔记结果和原始资料摘录，输出一份可直接保存为 Markdown 的复习冲刺讲义。",
    "不要输出 JSON，不要输出代码块围栏，直接输出 Markdown 正文。",
    "要求:",
    "1. 标题使用一级标题。",
    "2. 这是给一个此前完全没学过这门课、但现在马上要去做题的人看的，唯一目标是让他尽快抓住会考知识点并直接上手做题。",
    "3. 如果检测到混有多学科内容，只选择文件数量最多、内容最成体系的一门学科作为最终总结主线，其他学科最多用一小段说明已弱化处理。",
    "4. 全文必须尽最大可能长、尽最大可能全面、尽最大可能覆盖更多高频考点；如果资料足够，宁可写得很长，也不要过度压缩。",
    "5. 严禁写任何时间安排、学习计划、按天安排、阶段安排、先后任务、Day 1/2/3、今天/明天/后天、复习路线、冲刺安排等内容。",
    "6. 必须严格以资料里实际出现的知识点为基准，不要带入资料之外的课程知识，不要编造可能会考但材料没提到的内容。",
    "7. 输出必须至少包含这些二级标题：这门课会考什么、核心考点总图、必会知识点清单、高频考点逐条展开、必背定义 / 公式 / 规则、易错易混辨析、题型拆解与作答要点、最后一遍考点速览、资料缺口。",
    "8. 在“高频考点逐条展开”里尽可能按主题分组，把高频知识点逐条展开；每个点尽量写清：它是什么、常见怎么考、题目里出现什么词要想到它、作答时必须写出的关键词、最容易错在哪里。",
    "9. 在“题型拆解与作答要点”里不要安排顺序，而是直接总结不同题型看到什么就该写什么。",
    "10. 目标是做出一份可以直接拿去刷题的总讲义，而不是学习规划。",
    "11. 如果材料不完整，要明确指出缺口，但仍优先把已有可考知识点整理全。",
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
    )}`,
    "",
    "原始资料摘录（优先基于这些内容扩写考点，不要只复述简短摘要）:",
    sourcePacket
  ].join("\n");

  try {
    const content = await requestText(prompt, settings, {
      temperature: 0.2,
      max_tokens: 7000
    });
    const normalized =
      content.trim() || buildFallbackReviewMarkdown(folderName, documents, notes, summary);

    if (needsKnowledgeOnlyRewrite(normalized)) {
      const rewritten = await rewriteAsKnowledgeOnlyMarkdown(
        folderName,
        normalized,
        sourcePacket,
        settings
      );
      return sanitizeReviewMarkdown(
        rewritten.trim() || buildFallbackReviewMarkdown(folderName, documents, notes, summary)
      );
    }

    return sanitizeReviewMarkdown(normalized);
  } catch {
    return buildFallbackReviewMarkdown(folderName, documents, notes, summary);
  }
}

async function requestJson<T>(prompt: string, settings: ProviderSettings): Promise<T> {
  const content = await requestStructuredText(prompt, settings);

  try {
    return safeJsonParse<T>(content);
  } catch {
    const repaired = await repairJsonResponse(prompt, content, settings);
    return safeJsonParse<T>(repaired);
  }
}

async function requestText(
  prompt: string,
  settings: ProviderSettings,
  extraBody: Record<string, unknown> = {}
): Promise<string> {
  return requestChatContent(
    [
      {
        role: "system",
        content: "你是一个擅长把资料整理成中文复习讲义和复盘提纲的助手。"
      },
      {
        role: "user",
        content: prompt
      }
    ],
    settings,
    {
      temperature: 0.3,
      ...extraBody
    }
  );
}

async function requestStructuredText(prompt: string, settings: ProviderSettings): Promise<string> {
  return requestChatContent(
    [
      {
        role: "system",
        content: "你是一个谨慎、结构化、擅长生成中文知识整理结果的助手。"
      },
      {
        role: "user",
        content: prompt
      }
    ],
    settings,
    {
      temperature: 0.25,
      response_format: { type: "json_object" }
    }
  );
}

async function requestChatContent(
  messages: Array<{ role: "system" | "user"; content: string }>,
  settings: ProviderSettings,
  extraBody: Record<string, unknown>
): Promise<string> {
  const response = await fetch(resolveChatEndpoint(settings.baseUrl), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`
    },
    body: JSON.stringify({
      model: settings.model,
      messages,
      ...extraBody
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
  const cleaned = extractJsonCandidate(content)
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  return JSON.parse(cleaned) as T;
}

function extractJsonCandidate(content: string): string {
  const cleaned = content
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "");

  if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
    return cleaned;
  }

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
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

  if (text.length <= maxLength) {
    return text;
  }

  const segmentLength = Math.max(Math.floor(maxLength / 3) - 32, 800);
  const middleStart = Math.max(Math.floor(text.length / 2) - Math.floor(segmentLength / 2), 0);
  const tailStart = Math.max(text.length - segmentLength, 0);

  return [
    text.slice(0, segmentLength),
    "[中段摘要片段]",
    text.slice(middleStart, middleStart + segmentLength),
    "[末段摘要片段]",
    text.slice(tailStart)
  ].join("\n\n");
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

async function repairJsonResponse(
  originalPrompt: string,
  invalidContent: string,
  settings: ProviderSettings
): Promise<string> {
  return requestChatContent(
    [
      {
        role: "system",
        content:
          "你是一个 JSON 修复助手。你只能输出一个合法 JSON 对象，不能输出解释、Markdown、代码块或多余文字。"
      },
      {
        role: "user",
        content: [
          "把下面这段未严格遵守格式的模型输出，改写为一个合法 JSON 对象。",
          "要求：保留原意；缺失字段用空字符串、空数组或保守默认值补齐；不要新增解释。",
          "",
          "原始任务要求：",
          originalPrompt,
          "",
          "原始模型输出：",
          invalidContent
        ].join("\n")
      }
    ],
    settings,
    {
      temperature: 0.1,
      response_format: { type: "json_object" }
    }
  );
}

function buildFallbackNotePayload(document: DocumentRecord): RemoteNotePayload {
  const title = document.name.replace(/\.[^.]+$/, "");
  const keywords = extractKeywords(document.text);
  const summaryBase = document.text.trim()
    ? trimSentence(document.text, 56)
    : "正文抽取不足，只能基于文件名和路径做保守整理。";

  return {
    title,
    summary: summaryBase,
    category: inferCategory(document),
    tags: keywords.slice(0, 5),
    keywords: keywords.slice(0, 8),
    content: [
      `# ${title}`,
      "",
      "## AI 摘要",
      summaryBase,
      "",
      "## 关键要点",
      document.text.trim()
        ? `- ${trimSentence(document.text, 88)}`
        : "- 当前文件正文抽取不足，建议回原文件补读。",
      "",
      "## 后续动作",
      `- 回看原文件：${document.relativePath}`,
      "- 如需更完整考点，可检查 OCR 与模型返回格式。"
    ].join("\n"),
    confidence: inferConfidence(document)
  };
}

function buildFallbackFolderSummary(
  folderName: string,
  notes: GeneratedNote[],
  documents: DocumentRecord[]
): RemoteFolderPayload {
  const categories = buildFallbackCategories(notes);
  const dominantCategory =
    [...categories].sort((left, right) => right.noteCount - left.noteCount)[0]?.name ?? "课程学习";

  return {
    overview: `${folderName} 当前共整理 ${documents.length} 份资料，主线更接近“${dominantCategory}”。由于部分模型返回未严格遵守 JSON，本轮已切换为保守兜底整理结果。`,
    recommendedOrder: [...new Set(notes.map((note) => note.category))].slice(0, 5),
    highlights: notes.slice(0, 6).map((note) => `${note.title}: ${note.summary}`),
    categories
  };
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

function inferCategory(document: DocumentRecord): string {
  const haystack = `${document.name} ${document.relativePath} ${document.text}`.toLowerCase();
  if (/(课程|考试|复习|知识点|作业|数据库|原理|lecture|chapter)/i.test(haystack)) {
    return "课程学习";
  }
  if (/(项目|需求|设计|开发|代码|原型|迭代|issue)/i.test(haystack)) {
    return "项目资料";
  }
  if (/(会议|纪要|讨论|待办|同步|汇报)/i.test(haystack)) {
    return "会议纪要";
  }
  if (/(阅读|论文|摘录|文献|article|paper)/i.test(haystack)) {
    return "阅读摘录";
  }
  return "杂项归档";
}

function extractKeywords(text: string): string[] {
  const tokens = text
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 16);

  return [...new Set(tokens)].slice(0, 12);
}

function trimSentence(text: string, maxLength: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength)}...`;
}

function buildReviewSourcePacket(documents: DocumentRecord[], notes: GeneratedNote[]): string {
  const documentMap = new Map(documents.map((document) => [document.id, document]));

  return notes
    .map((note, index) => {
      const source = documentMap.get(note.documentId);
      return [
        `### 资料 ${index + 1}: ${note.title}`,
        `- 分类: ${note.category}`,
        `- 摘要: ${note.summary}`,
        `- 关键词: ${note.keywords.join("、") || note.tags.join("、") || "无"}`,
        `- 来源文件: ${source?.relativePath ?? "未知文件"}`,
        `- 原文摘录: ${source?.text ? trimForModel(source.text, 1400) : "正文抽取不足"}`
      ].join("\n");
    })
    .join("\n\n");
}

function needsKnowledgeOnlyRewrite(content: string): boolean {
  const normalized = content.replace(/\s+/g, "");
  return (
    normalized.length < 2800 ||
    /(Day\s*\d|按天|复习安排|学习安排|时间安排|冲刺安排|复习路线|第一天|第二天|第三天|今天|明天|后天)/i.test(
      content
    )
  );
}

async function rewriteAsKnowledgeOnlyMarkdown(
  folderName: string,
  currentContent: string,
  sourcePacket: string,
  settings: ProviderSettings
): Promise<string> {
  return requestText(
    [
      `请把下面这份《${folderName}》复习稿重写为“纯知识点 / 纯考点总讲义”。`,
      "要求：",
      "1. 删除所有时间安排、按天安排、学习步骤、先后任务、冲刺路线、Day 1/2/3、今天/明天/后天。",
      "2. 把篇幅尽量扩展到更长，优先增加知识点覆盖率和高频考点解释，不要增加空话。",
      "3. 只保留最纯粹的考试相关内容：会考什么、概念定义、公式规则、易错点、题型作答要点、最后速览。",
      "4. 必须严格基于资料内容，不要引入资料外知识。",
      "5. 直接输出 Markdown 正文，不要解释你做了什么。",
      "",
      "当前版本：",
      currentContent,
      "",
      "资料依据：",
      sourcePacket
    ].join("\n"),
    settings,
    {
      temperature: 0.15,
      max_tokens: 7000
    }
  );
}

function sanitizeReviewMarkdown(content: string): string {
  const lines = content.split("\n");
  const cleaned: string[] = [];
  let skipSection = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^#{1,6}\s*/.test(trimmed)) {
      skipSection = /(按天|安排|路线|Day\s*\d|第一天|第二天|第三天)/i.test(trimmed);
      if (skipSection) {
        continue;
      }
    }

    if (skipSection) {
      continue;
    }

    if (/(今天|明天|后天|Day\s*\d|第一天|第二天|第三天)/i.test(trimmed)) {
      continue;
    }

    cleaned.push(line);
  }

  return cleaned.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function buildAnswerHook(note: GeneratedNote): string {
  const keywords = note.keywords.slice(0, 5).join("、") || note.tags.slice(0, 5).join("、");
  if (keywords) {
    return `先写清 ${keywords} 对应的定义、关键条件、核心步骤和易错点。`;
  }
  return `先写定义，再写关键条件、核心步骤、容易混淆的点和结论。`;
}

function buildFallbackReviewMarkdown(
  folderName: string,
  documents: DocumentRecord[],
  notes: GeneratedNote[],
  summary: ImportSummary
) {
  const grouped = new Map<string, GeneratedNote[]>();
  const documentMap = new Map(documents.map((document) => [document.id, document]));
  for (const note of notes) {
    const bucket = grouped.get(note.category) ?? [];
    bucket.push(note);
    grouped.set(note.category, bucket);
  }

  return [
    `# ${folderName} 复习冲刺总结`,
    "",
    "## 这门课会考什么",
    summary.overview || "当前材料不足以完整概括整门课，但可以先围绕现有资料中反复出现的主线知识点直接做题。",
    "",
    "## 核心考点总图",
    ...summary.highlights.map((item) => `- ${item}`),
    "",
    "## 必会知识点清单",
    ...notes.map((note, index) => `${index + 1}. ${note.title}: ${note.summary}`),
    "",
    "## 高频考点逐条展开",
    ...notes.map((note) => {
      const source = documentMap.get(note.documentId);
      const sourceSnippet = source?.text
        ? trimSentence(source.text, 260)
        : "当前文件正文抽取不足，建议回原文件补读。";
      return [
        `### ${note.title}`,
        `- 这是什么: ${note.summary}`,
        `- 高频关键词: ${note.keywords.join("、") || note.tags.join("、") || "待从原文补充"}`,
        `- 做题时要想到: ${buildAnswerHook(note)}`,
        `- 资料依据: ${sourceSnippet}`
      ].join("\n");
    }),
    "",
    "## 必背定义 / 公式 / 规则",
    ...notes.map(
      (note) =>
        `- ${note.title}: ${note.keywords.slice(0, 8).join("、") || note.summary}`
    ),
    "",
    "## 易错易混辨析",
    ...summary.highlights.map((item) => `- ${item}`),
    "",
    "## 题型拆解与作答要点",
    ...notes.map(
      (note) => `- ${note.title}: ${buildAnswerHook(note)}`
    ),
    "",
    "## 最后一遍考点速览",
    ...[...grouped.entries()].map(
      ([category, categoryNotes]) =>
        `- ${category}: ${categoryNotes
          .map((note) => note.title)
          .join("、")}`
    ),
    "",
    "## 资料缺口",
    "- 对正文较短、OCR 不完整或提示抽取失败的文件，做题前务必回原文件补读。",
    "- 如果某些题型在资料里没有清楚出现，作答时优先写定义、目标、关键步骤、限制条件和易错点。"
  ].join("\n");
}
