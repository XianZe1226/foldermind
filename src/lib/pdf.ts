import { GlobalWorkerOptions, getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";

const OCR_RENDER_SCALE = 1.8;

GlobalWorkerOptions.workerSrc = workerSrc;

async function loadPdfDocument(buffer: ArrayBuffer) {
  return getDocument({
    data: buffer,
    // Keep an explicit worker URL for reliable OCR page rendering in Vite/Tauri.
    workerSrc
  } as Parameters<typeof getDocument>[0]).promise;
}

export async function extractPdfText(buffer: ArrayBuffer): Promise<string> {
  const pdf = await loadPdfDocument(buffer);
  const pageTexts: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items
      .map((item) => ("str" in item ? item.str : ""))
      .filter(Boolean)
      .join(" ");

    if (text.trim()) {
      pageTexts.push(text.trim());
    }
  }

  return pageTexts.join("\n");
}

export async function renderPdfPagesForOcr(
  buffer: ArrayBuffer,
  maxPages = 8
): Promise<{ imagesBase64: string[]; processedPages: number; totalPages: number }> {
  const pdf = await loadPdfDocument(buffer);
  const processedPages = Math.min(pdf.numPages, maxPages);
  const imagesBase64: string[] = [];

  for (let pageNumber = 1; pageNumber <= processedPages; pageNumber += 1) {
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

    canvas.width = 0;
    canvas.height = 0;
  }

  return {
    imagesBase64,
    processedPages,
    totalPages: pdf.numPages
  };
}
