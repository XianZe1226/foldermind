import { defaultOcrSettings, defaultSettings, STORAGE_KEY } from "./constants";
import type { AppSnapshot, DocumentRecord, GeneratedNote } from "./types";

const fallbackSnapshot: AppSnapshot = {
  documents: [],
  notes: [],
  summary: null,
  reviewMarkdown: null,
  savedSettings: defaultSettings,
  savedOcrSettings: defaultOcrSettings,
  selectedFolderPath: null,
  savedOutput: null
};

export function loadSnapshot(): AppSnapshot {
  if (typeof window === "undefined") {
    return fallbackSnapshot;
  }

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    return fallbackSnapshot;
  }

  try {
    const parsed = JSON.parse(raw) as AppSnapshot;
    return {
      documents: parsed.documents ?? [],
      notes: parsed.notes ?? [],
      summary: parsed.summary ?? null,
      reviewMarkdown: parsed.reviewMarkdown ?? null,
      savedSettings: parsed.savedSettings ?? defaultSettings,
      savedOcrSettings: parsed.savedOcrSettings ?? defaultOcrSettings,
      selectedFolderPath: parsed.selectedFolderPath ?? null,
      savedOutput: parsed.savedOutput ?? null
    };
  } catch {
    return fallbackSnapshot;
  }
}

export function saveSnapshot(snapshot: AppSnapshot) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    const compactSnapshot: AppSnapshot = {
      ...snapshot,
      documents: snapshot.documents.map(compactDocumentForStorage),
      notes: snapshot.notes.map(compactNoteForStorage),
      reviewMarkdown:
        snapshot.reviewMarkdown && snapshot.reviewMarkdown.length > 24000
          ? `${snapshot.reviewMarkdown.slice(0, 24000)}\n\n<!-- 已截断本地缓存，完整版本以输出文件为准 -->`
          : snapshot.reviewMarkdown
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(compactSnapshot));
  } catch (error) {
    console.error("saveSnapshot failed", error);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // ignore cleanup failure
    }
  }
}

function compactDocumentForStorage(document: DocumentRecord): DocumentRecord {
  return {
    ...document,
    text: document.text.length > 600 ? document.text.slice(0, 600) : document.text,
    excerpt: document.excerpt.length > 240 ? document.excerpt.slice(0, 240) : document.excerpt
  };
}

function compactNoteForStorage(note: GeneratedNote): GeneratedNote {
  return {
    ...note,
    content: note.content.length > 5000 ? `${note.content.slice(0, 5000)}\n\n[缓存已截断]` : note.content
  };
}
