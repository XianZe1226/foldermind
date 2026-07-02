import { categoryDescriptions } from "./constants";
import type {
  CategorySummary,
  DocumentRecord,
  GeneratedNote,
  ImportSummary,
  ProviderSettings
} from "./types";

const stopwords = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "课程",
  "一个",
  "我们",
  "可以",
  "进行",
  "以及",
  "相关",
  "内容"
]);

function scoreCategory(text: string, path: string): string {
  const combined = `${path} ${text}`;
  if (/(课程|实验|作业|复习|概念|知识点|lecture|assignment)/i.test(combined)) {
    return "课程学习";
  }
  if (/(需求|设计|开发|接口|部署|项目|架构|issue|sprint)/i.test(combined)) {
    return "项目资料";
  }
  if (/(会议|纪要|todo|action item|follow up|同步)/i.test(combined)) {
    return "会议纪要";
  }
  if (/(论文|阅读|摘要|书籍|摘录|参考文献|paper|research)/i.test(combined)) {
    return "阅读摘录";
  }
  return "杂项归档";
}

function topKeywords(text: string): string[] {
  const counts = new Map<string, number>();
  const words = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 2 && !stopwords.has(word));

  for (const word of words) {
    counts.set(word, (counts.get(word) ?? 0) + 1);
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([word]) => word);
}

function summarizeText(text: string, fallbackTitle: string): string {
  if (!text) {
    return `${fallbackTitle} 当前未提取到可分析正文，建议后续补充对应格式解析器后重新整理。`;
  }

  const sentences = text
    .split(/(?<=[。！？.!?])/)
    .map((part) => part.trim())
    .filter(Boolean);

  const base = sentences.slice(0, 3).join(" ");
  if (base.length > 220) {
    return `${base.slice(0, 220)}...`;
  }
  return base || text.slice(0, 220);
}

function tagsFromCategory(category: string, keywords: string[]): string[] {
  const preset: Record<string, string[]> = {
    "课程学习": ["课程", "复习", "知识点"],
    "项目资料": ["项目", "开发", "文档"],
    "会议纪要": ["会议", "行动项", "同步"],
    "阅读摘录": ["阅读", "摘要", "摘录"],
    "杂项归档": ["归档", "整理", "笔记"]
  };

  return [...new Set([...(preset[category] ?? ["整理"]), ...keywords])].slice(0, 6);
}

export async function generateNotesFromDocuments(
  documents: DocumentRecord[],
  _settings: ProviderSettings
): Promise<{ notes: GeneratedNote[]; summary: ImportSummary }> {
  await new Promise((resolve) => setTimeout(resolve, 600));

  const notes = documents.map((document) => {
    const category = scoreCategory(document.text, document.relativePath);
    const keywords = topKeywords(document.text);
    const summary = summarizeText(document.text, document.name);
    const title = document.name.replace(/\.[^.]+$/, "");
    const now = Date.now();

    return {
      id: crypto.randomUUID(),
      documentId: document.id,
      title,
      summary,
      category,
      tags: tagsFromCategory(category, keywords),
      keywords,
      content: [
        `# ${title}`,
        "",
        "## AI 摘要",
        summary,
        "",
        "## 关键信息",
        ...keywords.map((keyword) => `- ${keyword}`),
        "",
        "## 个人补充",
        "在这里继续补充你的整理笔记。"
      ].join("\n"),
      confidence: document.text ? "medium" : "low",
      createdAt: now,
      updatedAt: now
    } satisfies GeneratedNote;
  });

  const categoryMap = new Map<string, CategorySummary>();
  for (const note of notes) {
    const current = categoryMap.get(note.category);
    if (current) {
      current.noteCount += 1;
      continue;
    }
    categoryMap.set(note.category, {
      name: note.category,
      description: categoryDescriptions[note.category] ?? "自动生成的资料分类。",
      noteCount: 1
    });
  }

  const categories = [...categoryMap.values()].sort((a, b) => b.noteCount - a.noteCount);
  const folderName = inferFolderName(documents);
  const overview = buildOverview(folderName, documents, categories);

  return {
    notes,
    summary: {
      folderName,
      generatedAt: Date.now(),
      overview,
      recommendedOrder: categories.map((category) => category.name),
      categories,
      highlights: [
        `共整理 ${documents.length} 份文件`,
        `当前最多的分类是 ${categories[0]?.name ?? "杂项归档"}`,
        "这是一份本地 mock 结果，仅用于离线展示。"
      ]
    }
  };
}

function inferFolderName(documents: DocumentRecord[]): string {
  const first = documents[0]?.relativePath;
  if (!first) {
    return "未命名文件夹";
  }
  return first.split("/")[0] || "未命名文件夹";
}

function buildOverview(
  folderName: string,
  documents: DocumentRecord[],
  categories: CategorySummary[]
): string {
  const categoryLine = categories
    .map((category) => `${category.name}(${category.noteCount})`)
    .join("、");

  return `已对文件夹「${folderName}」中的 ${documents.length} 份资料完成初步整理。当前资料主要分布在 ${categoryLine} 等主题下，建议先浏览数量最多的分类，再逐步补充每条笔记中的个人理解与行动项。`;
}
