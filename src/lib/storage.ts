import { defaultOcrSettings, defaultSettings, STORAGE_KEY } from "./constants";
import type { AppSnapshot } from "./types";

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

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
}
