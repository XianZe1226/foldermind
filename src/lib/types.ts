export type SupportedProvider = "deepseek" | "qwen" | "glm" | "minimax";
export type OcrProvider = "none" | "baidu";

export type AppView = "import" | "notes" | "settings";

export type ProcessingStatus =
  | "idle"
  | "scanning"
  | "scanned"
  | "summarizing"
  | "saving"
  | "ready"
  | "error";

export interface ProviderSettings {
  provider: SupportedProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface OcrSettings {
  provider: OcrProvider;
  apiKey: string;
  secretKey: string;
}

export interface RawScannedFile {
  name: string;
  absolutePath: string;
  relativePath: string;
  extension: string;
  size: number;
  lastModified: number;
  textContent: string | null;
  binaryBase64: string | null;
}

export interface DocumentRecord {
  id: string;
  name: string;
  absolutePath: string;
  relativePath: string;
  type: string;
  size: number;
  lastModified: number;
  text: string;
  excerpt: string;
  warnings: string[];
}

export interface GeneratedNote {
  id: string;
  documentId: string;
  title: string;
  summary: string;
  category: string;
  tags: string[];
  keywords: string[];
  content: string;
  confidence: "high" | "medium" | "low";
  createdAt: number;
  updatedAt: number;
}

export interface CategorySummary {
  name: string;
  description: string;
  noteCount: number;
}

export interface ImportSummary {
  folderName: string;
  generatedAt: number;
  overview: string;
  recommendedOrder: string[];
  categories: CategorySummary[];
  highlights: string[];
}

export interface SavedArtifact {
  filename: string;
  content: string;
}

export interface SaveResult {
  outputDir: string;
  reportPath: string;
  reviewReportPath: string;
  notesJsonPath: string;
  notePaths: string[];
}

export interface PdfExtractionResult {
  text: string;
  pageTexts: string[];
  imagesBase64: string[];
  processedPages: number;
  totalPages: number;
  ocrCandidatePages: number;
  ocrTruncated: boolean;
}

export interface OcrResult {
  text: string;
  pageTexts: string[];
}

export interface AppSnapshot {
  documents: DocumentRecord[];
  notes: GeneratedNote[];
  summary: ImportSummary | null;
  reviewMarkdown: string | null;
  savedSettings: ProviderSettings;
  savedOcrSettings: OcrSettings;
  selectedFolderPath: string | null;
  savedOutput: SaveResult | null;
}
