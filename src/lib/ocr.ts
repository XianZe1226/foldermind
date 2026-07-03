import { performOcr } from "./backend";
import type { OcrSettings } from "./types";

export function hasReadyOcrSettings(settings: OcrSettings): boolean {
  if (settings.provider === "none") {
    return false;
  }

  return settings.apiKey.trim().length > 0 && settings.secretKey.trim().length > 0;
}

export async function extractTextWithOcr(
  imagesBase64: string[],
  settings: OcrSettings
): Promise<string> {
  if (!imagesBase64.length || settings.provider === "none") {
    return "";
  }

  if (!hasReadyOcrSettings(settings)) {
    throw new Error("OCR 配置未保存完整，请补全 API Key 和 Secret Key。");
  }

  switch (settings.provider) {
    case "baidu":
      return performOcr(imagesBase64, settings);
    default:
      throw new Error("暂不支持当前 OCR 服务商。");
  }
}
