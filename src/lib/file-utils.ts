import mammoth from "mammoth";
import { acceptedExtensions, defaultOcrSettings } from "./constants";
import { extractPdfText } from "./backend";
import { extractTextWithOcr, hasReadyOcrSettings } from "./ocr";
import { renderPdfPagesForOcr } from "./pdf";
import type { DocumentRecord, OcrSettings, RawScannedFile } from "./types";

interface ParseDocumentOptions {
  ocrSettings?: OcrSettings;
}

export function formatBytes(size: number): string {
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    hour12: false
  });
}

export function getFileExtension(name: string): string {
  const match = name.toLowerCase().match(/\.[^.]+$/);
  return match?.[0] ?? "";
}

export function isSupportedFile(name: string): boolean {
  return acceptedExtensions.includes(getFileExtension(name));
}

export function sanitizeText(raw: string): string {
  return raw
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]+/g, " ")
    .trim();
}

export function extractExcerpt(text: string): string {
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

export async function rawFileToDocument(
  file: RawScannedFile,
  options: ParseDocumentOptions = {}
): Promise<DocumentRecord> {
  const ocrSettings = options.ocrSettings ?? defaultOcrSettings;
  const warnings: string[] = [];
  let text = "";

  if (file.extension === ".md" || file.extension === ".txt") {
    text = sanitizeText(file.textContent ?? "");
  } else if (file.extension === ".pdf") {
    if (!file.binaryBase64) {
      warnings.push("PDF 数据为空，无法解析。");
    } else {
      let backendPageTexts: string[] = [];
      let backendExtractionFailed = false;

      try {
        const textPayload = await extractPdfText(file.absolutePath);
        backendPageTexts = textPayload.pageTexts;
        text = sanitizeText(textPayload.text);
      } catch (error) {
        backendExtractionFailed = true;
        warnings.push(
          error instanceof Error ? `PDF 文本抽取失败：${error.message}` : "PDF 文本抽取失败。"
        );
      }

      const shouldTryOcr = backendExtractionFailed || isInsufficientPdfText(text);
      const pageIndicesNeedingOcr = backendPageTexts
        .map((pageText, index) => ({
          index,
          length: sanitizeText(pageText).replace(/\s/g, "").length
        }))
        .filter((page) => page.length < 40)
        .map((page) => page.index);

      if (shouldTryOcr && hasReadyOcrSettings(ocrSettings)) {
        try {
          const renderPayload = await renderPdfPagesForOcr(base64ToArrayBuffer(file.binaryBase64), {
            pageIndices:
              pageIndicesNeedingOcr.length > 0 ? pageIndicesNeedingOcr : undefined,
            renderAllPages: backendExtractionFailed || backendPageTexts.length === 0
          });
          const ocrResult = await extractTextWithOcr(renderPayload.imagesBase64, ocrSettings);
          const mergedText = sanitizeText(
            mergePdfAndOcrText(
              backendPageTexts,
              ocrResult.pageTexts,
              renderPayload.pageIndices
            ) || ocrResult.text
          );

          if (mergedText) {
            text = mergedText;
            warnings.push(
              backendExtractionFailed
                ? `PDF 主文本抽取失败，已自动改用 OCR 补读，共处理 ${renderPayload.processedPages} 页。`
                : `这份 PDF 已经做了 OCR 补读，共处理 ${renderPayload.processedPages} 页。`
            );
          } else {
            warnings.push("已尝试 OCR，但仍未提取到有效正文。");
          }
        } catch (error) {
          warnings.push(error instanceof Error ? `OCR 失败：${error.message}` : "OCR 处理失败。");
        }
      } else if (shouldTryOcr && !text) {
        warnings.push("当前未配置 OCR，扫描版 PDF 可能无法提取正文。");
      } else if (shouldTryOcr) {
        warnings.push("PDF 正文较少，如为扫描版可在设置页开启 OCR。");
      }
    }
  } else if (file.extension === ".docx") {
    if (!file.binaryBase64) {
      warnings.push("DOCX 数据为空，无法解析。");
    } else {
      try {
        const result = await mammoth.extractRawText({
          arrayBuffer: base64ToArrayBuffer(file.binaryBase64)
        });
        text = sanitizeText(result.value);
        if (!text) {
          warnings.push("DOCX 已读取，但正文为空。");
        }
        if (result.messages.length) {
          warnings.push(...result.messages.map((message) => message.message));
        }
      } catch {
        warnings.push("DOCX 解析失败。");
      }
    }
  } else {
    warnings.push("暂不支持的文件类型。");
  }

  if (!text) {
    warnings.push("没有提取到可用于总结的有效正文。");
  }

  return {
    id: crypto.randomUUID(),
    name: file.name,
    absolutePath: file.absolutePath,
    relativePath: file.relativePath,
    type: file.extension || "unknown",
    size: file.size,
    lastModified: file.lastModified,
    text,
    excerpt: extractExcerpt(text),
    warnings
  };
}

function isInsufficientPdfText(text: string): boolean {
  return text.replace(/\s/g, "").length < 80;
}

function mergePdfAndOcrText(
  pageTexts: string[],
  ocrPageTexts: string[],
  pageIndices: number[]
): string {
  if (!ocrPageTexts.length) {
    return pageTexts.join("\n\n");
  }

  const ocrTextByPageIndex = new Map<number, string>();
  ocrPageTexts.forEach((pageText, index) => {
    const pageIndex = pageIndices[index];
    if (typeof pageIndex === "number") {
      ocrTextByPageIndex.set(pageIndex, pageText);
    }
  });

  const totalPages = pageTexts.length;
  const mergedPages: string[] = [];

  for (let index = 0; index < totalPages; index += 1) {
    const pdfText = sanitizeText(pageTexts[index] ?? "");
    const ocrText = sanitizeText(ocrTextByPageIndex.get(index) ?? "");

    if (!pdfText && !ocrText) {
      continue;
    }

    if (!pdfText) {
      mergedPages.push(ocrText);
      continue;
    }

    if (!ocrText) {
      mergedPages.push(pdfText);
      continue;
    }

    const pdfLength = pdfText.replace(/\s/g, "").length;
    const ocrLength = ocrText.replace(/\s/g, "").length;

    if (pdfLength < 40 || ocrLength > pdfLength * 1.35) {
      mergedPages.push(ocrText);
      continue;
    }

    mergedPages.push(pdfText);
  }

  return mergedPages.join("\n\n");
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = window.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
}
