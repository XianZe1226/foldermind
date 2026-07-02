import { invoke } from "@tauri-apps/api/core";
import type {
  PdfExtractionResult,
  RawScannedFile,
  SaveResult,
  SavedArtifact
} from "./types";

export async function pickFolder(): Promise<string | null> {
  return invoke<string | null>("pick_folder");
}

export async function scanFolder(folderPath: string): Promise<RawScannedFile[]> {
  return invoke<RawScannedFile[]>("scan_folder", {
    rootPath: folderPath
  });
}

export async function writeAnalysisBundle(
  folderPath: string,
  reportMarkdown: string,
  reviewMarkdown: string,
  notesJson: string,
  noteFiles: SavedArtifact[]
): Promise<SaveResult> {
  return invoke<SaveResult>("write_analysis_bundle", {
    rootPath: folderPath,
    reportMarkdown,
    reviewMarkdown,
    notesJson,
    noteFiles
  });
}

export async function extractPdfPayload(
  pdfPath: string,
  maxPages = 0
): Promise<PdfExtractionResult> {
  return invoke<PdfExtractionResult>("extract_pdf_payload", {
    pdfPath,
    maxPages
  });
}

export async function openLocalPath(targetPath: string): Promise<void> {
  return invoke("open_local_path", {
    targetPath
  });
}
