import mammoth from "mammoth";
import { acceptedExtensions, defaultOcrSettings } from "./constants";
import { extractTextWithOcr, hasReadyOcrSettings } from "./ocr";
import { extractPdfPayload } from "./pdf";
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
      try {
        const shouldRunFullOcr = hasReadyOcrSettings(ocrSettings);
        const payload = await extractPdfPayload(base64ToArrayBuffer(file.binaryBase64), {
          renderAllPages: shouldRunFullOcr
        });
        text = sanitizeText(payload.text);

        const shouldTryOcr =
          shouldRunFullOcr || isInsufficientPdfText(text) || payload.ocrCandidatePages > 0;

        if (shouldTryOcr) {
          if (hasReadyOcrSettings(ocrSettings)) {
            try {
              const ocrResult = await extractTextWithOcr(payload.imagesBase64, ocrSettings);
              const mergedText = sanitizeText(
                mergePdfAndOcrText(payload.pageTexts, ocrResult.pageTexts) || ocrResult.text
              );

              if (mergedText) {
                text = mergedText;
                warnings.push(
                  shouldRunFullOcr
                    ? `这份 PDF 已经做了全页 OCR 补读，共处理 ${payload.processedPages} 页。`
                    : `这份 PDF 里有 ${payload.processedPages} 页像扫描件或文字层不完整，已经自动用 OCR 补读。`
                );
              } else {
                warnings.push("已尝试 OCR，但仍未提取到有效正文。");
              }
            } catch (error) {
              warnings.push(
                error instanceof Error ? `OCR 失败：${error.message}` : "OCR 处理失败。"
              );
            }
          } else if (!text) {
            warnings.push("当前未配置 OCR，扫描版 PDF 可能无法提取正文。");
          } else {
            warnings.push(
              payload.ocrCandidatePages > 0
                ? `这份 PDF 里有 ${payload.ocrCandidatePages} 页更像扫描件或文字层不完整；如果想尽量补全文字，请在设置页开启 OCR。`
                : "PDF 正文较少，如为扫描版可在设置页开启 OCR。"
            );
          }
        }
      } catch (error) {
        warnings.push(
          error instanceof Error ? `PDF 文本抽取失败：${error.message}` : "PDF 文本抽取失败。"
        );
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

function mergePdfAndOcrText(pageTexts: string[], ocrPageTexts: string[]): string {
  if (!ocrPageTexts.length) {
    return pageTexts.join("\n\n");
  }

  const totalPages = Math.max(pageTexts.length, ocrPageTexts.length);
  const mergedPages: string[] = [];

  for (let index = 0; index < totalPages; index += 1) {
    const pdfText = sanitizeText(pageTexts[index] ?? "");
    const ocrText = sanitizeText(ocrPageTexts[index] ?? "");

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
