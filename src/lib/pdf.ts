import type { PdfExtractionResult } from "./types";

const OCR_RENDER_SCALE = 1.8;
const OCR_TEXT_MIN_LENGTH = 40;

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;
let workerSrcPromise: Promise<string> | null = null;

function loadPdfJsModule(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }

  return pdfJsModulePromise;
}

function loadWorkerSrc(): Promise<string> {
  if (!workerSrcPromise) {
    workerSrcPromise = import("pdfjs-dist/legacy/build/pdf.worker.mjs?url").then(
      (module) => module.default
    );
  }

  return workerSrcPromise;
}

async function loadPdfDocument(buffer: ArrayBuffer) {
  const [{ getDocument, GlobalWorkerOptions }, workerSrc] = await Promise.all([
    loadPdfJsModule(),
    loadWorkerSrc()
  ]);

  GlobalWorkerOptions.workerSrc = workerSrc;

  return getDocument({
    data: new Uint8Array(buffer),
    workerSrc,
    // WKWebView 对新版 pdf.js worker 兼容性不稳定，这里直接在主线程解析。
    disableWorker: true
  } as Parameters<PdfJsModule["getDocument"]>[0]).promise;
}

function normalizedTextLength(text: string): number {
  return text.replace(/\s/g, "").length;
}

function shouldUseOcrForPage(text: string): boolean {
  return normalizedTextLength(text) < OCR_TEXT_MIN_LENGTH;
}

export async function extractPdfPayload(
  buffer: ArrayBuffer,
  options: { renderAllPages?: boolean } = {}
): Promise<PdfExtractionResult> {
  const pdf = await loadPdfDocument(buffer);
  const pageTexts: string[] = [];
  const imagesBase64: string[] = [];
  const renderAllPages = options.renderAllPages ?? false;
  let ocrCandidatePages = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ")
      .trim();

    pageTexts.push(text);

    const pageLooksScanned = shouldUseOcrForPage(text);
    if (pageLooksScanned) {
      ocrCandidatePages += 1;
    }

    if (!renderAllPages && !pageLooksScanned) {
      continue;
    }

    const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("浏览器画布初始化失败，无法执行 PDF OCR。");
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    await page.render({
      canvas,
      canvasContext: context,
      viewport
    }).promise;

    imagesBase64.push(
      canvas.toDataURL("image/jpeg", 0.92).replace(/^data:image\/\w+;base64,/, "")
    );

    canvas.width = 0;
    canvas.height = 0;
  }

  return {
    text: pageTexts.filter(Boolean).join("\n\n"),
    pageTexts,
    imagesBase64,
    processedPages: imagesBase64.length,
    totalPages: pdf.numPages,
    ocrCandidatePages: renderAllPages ? pdf.numPages : ocrCandidatePages,
    ocrTruncated: false
  };
}
