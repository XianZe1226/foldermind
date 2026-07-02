import type { GeneratedNote, ImportSummary, SavedArtifact } from "./types";

export function buildReportMarkdown(summary: ImportSummary): string {
  const lines = [
    `# ${summary.folderName} 文件夹整理报告`,
    "",
    `生成时间: ${new Date(summary.generatedAt).toLocaleString("zh-CN", { hour12: false })}`,
    "",
    "## 总览",
    summary.overview,
    "",
    "## 重点发现",
    ...summary.highlights.map((item) => `- ${item}`),
    "",
    "## 推荐阅读顺序",
    ...summary.recommendedOrder.map((item, index) => `${index + 1}. ${item}`),
    "",
    "## 分类统计",
    ...summary.categories.map(
      (category) => `- ${category.name}: ${category.noteCount} 条，${category.description}`
    )
  ];

  return lines.join("\n");
}

export function buildNoteArtifacts(notes: GeneratedNote[]): SavedArtifact[] {
  return notes.map((note) => ({
    filename: `${slugify(note.title)}.md`,
    content: note.content
  }));
}

export function buildNotesJson(notes: GeneratedNote[], summary: ImportSummary): string {
  return JSON.stringify(
    {
      summary,
      notes
    },
    null,
    2
  );
}

export function buildReviewMarkdown(
  folderName: string,
  reviewMarkdown: string,
  generatedAt: number
): string {
  const normalized = reviewMarkdown.trim();
  if (!normalized) {
    return [
      `# ${folderName} 整体复习总结`,
      "",
      `生成时间: ${new Date(generatedAt).toLocaleString("zh-CN", { hour12: false })}`,
      "",
      "暂未生成有效的整体复习总结。"
    ].join("\n");
  }

  if (normalized.startsWith("#")) {
    return normalized;
  }

  return [
    `# ${folderName} 整体复习总结`,
    "",
    `生成时间: ${new Date(generatedAt).toLocaleString("zh-CN", { hour12: false })}`,
    "",
    normalized
  ].join("\n");
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}
