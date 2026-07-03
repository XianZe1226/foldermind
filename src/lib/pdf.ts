import type { PdfOcrRenderResult } from "./types";

const OCR_RENDER_SCALE = 1.45;
const OCR_JPEG_QUALITY = 0.84;

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
type PdfRenderProgressStage = "loading" | "rendering" | "rendered";

interface PdfRenderProgress {
  stage: PdfRenderProgressStage;
  pageIndex: number;
  processedPages: number;
  totalPages: number;
}

let pdfJsModulePromise: Promise<PdfJsModule> | null = null;
let workerSrcPromise: Promise<string> | null = null;

function loadPdfJsModule(): Promise<PdfJsModule> {
  if (!pdfJsModulePromise) {
    pdfJsModulePromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  }

  return pdfJsModulePromise;
}

async function loadWorkerSrc(): Promise<string> {
  if (!workerSrcPromise) {
    workerSrcPromise = import("pdfjs-dist/legacy/build/pdf.worker.mjs?url").then(
      (workerModule) => workerModule.default
    );
  }

  return workerSrcPromise;
}

async function loadPdfDocument(buffer: ArrayBuffer) {
  const { getDocument, GlobalWorkerOptions } = await loadPdfJsModule();
  const workerSrc = await loadWorkerSrc();
  GlobalWorkerOptions.workerSrc = workerSrc;
  const data = new Uint8Array(buffer);
  const baseOptions = {
    data,
    workerSrc,
    useWasm: false,
    isOffscreenCanvasSupported: false,
    isImageDecoderSupported: false,
    useWorkerFetch: false
  } as Parameters<PdfJsModule["getDocument"]>[0];

  try {
    return await getDocument(baseOptions).promise;
  } catch (error) {
    console.warn("PDF worker 加载失败，已切换到兼容渲染模式。", error);
    return getDocument({
      ...baseOptions,
      data: new Uint8Array(buffer),
      disableWorker: true
    } as Parameters<PdfJsModule["getDocument"]>[0]).promise;
  }
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => {
    window.requestAnimationFrame(() => {
      window.setTimeout(resolve, 0);
    });
  });
}

export async function renderPdfPagesForOcr(
  buffer: ArrayBuffer,
  options: { renderAllPages?: boolean; pageIndices?: number[] } = {}
): Promise<PdfOcrRenderResult> {
  const pdf = await loadPdfDocument(buffer);
  const imagesBase64: string[] = [];
  const pageIndices: number[] = [];
  const renderAllPages = options.renderAllPages ?? false;
  const requestedPages = new Set(options.pageIndices ?? []);
  const shouldRenderSelectedPagesOnly = requestedPages.size > 0 && !renderAllPages;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pageIndex = pageNumber - 1;
    if (shouldRenderSelectedPagesOnly && !requestedPages.has(pageIndex)) {
      continue;
    }

    const page = await pdf.getPage(pageNumber);
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
    pageIndices.push(pageIndex);

    canvas.width = 0;
    canvas.height = 0;
  }

  return {
    imagesBase64,
    pageIndices,
    processedPages: imagesBase64.length,
    totalPages: pdf.numPages,
    ocrCandidatePages: renderAllPages ? pdf.numPages : pageIndices.length,
    ocrTruncated: false
  };
}

export async function renderPdfPagesForOcrBatches(
  buffer: ArrayBuffer,
  options: {
    renderAllPages?: boolean;
    pageIndices?: number[];
    batchSize?: number;
    onProgress?: (progress: PdfRenderProgress) => void;
  },
  onBatch: (imagesBase64: string[], pageIndices: number[]) => Promise<void>
): Promise<Omit<PdfOcrRenderResult, "imagesBase64" | "pageIndices">> {
  const pdf = await loadPdfDocument(buffer);
  const renderAllPages = options.renderAllPages ?? false;
  const requestedPages = new Set(options.pageIndices ?? []);
  const shouldRenderSelectedPagesOnly = requestedPages.size > 0 && !renderAllPages;
  const batchSize = Math.max(options.batchSize ?? 1, 1);
  let imagesBase64: string[] = [];
  let pageIndices: number[] = [];
  let processedPages = 0;

  async function flushBatch() {
    if (!imagesBase64.length) {
      return;
    }

    await onBatch(imagesBase64, pageIndices);
    processedPages += imagesBase64.length;
    imagesBase64 = [];
    pageIndices = [];
  }

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const pageIndex = pageNumber - 1;
    if (shouldRenderSelectedPagesOnly && !requestedPages.has(pageIndex)) {
      continue;
    }

    options.onProgress?.({
      stage: "loading",
      pageIndex,
      processedPages,
      totalPages: pdf.numPages
    });

    await yieldToBrowser();
    const page = await pdf.getPage(pageNumber);
    const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("浏览器画布初始化失败，无法执行 PDF OCR。");
    }

    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);

    options.onProgress?.({
      stage: "rendering",
      pageIndex,
      processedPages,
      totalPages: pdf.numPages
    });

    await yieldToBrowser();
    await page.render({
      canvas,
      canvasContext: context,
      viewport
    }).promise;

    imagesBase64.push(
      canvas.toDataURL("image/jpeg", OCR_JPEG_QUALITY).replace(/^data:image\/\w+;base64,/, "")
    );
    pageIndices.push(pageIndex);

    canvas.width = 0;
    canvas.height = 0;

    options.onProgress?.({
      stage: "rendered",
      pageIndex,
      processedPages: processedPages + imagesBase64.length,
      totalPages: pdf.numPages
    });

    await yieldToBrowser();
    if (imagesBase64.length >= batchSize) {
      await flushBatch();
      await yieldToBrowser();
    }
  }

  await flushBatch();

  return {
    processedPages,
    totalPages: pdf.numPages,
    ocrCandidatePages: renderAllPages ? pdf.numPages : processedPages,
    ocrTruncated: false
  };
}
