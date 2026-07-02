import type { OcrSettings } from "./types";

interface BaiduTokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface BaiduOcrResponse {
  words_result?: Array<{ words?: string }>;
  error_code?: number;
  error_msg?: string;
}

const BAIDU_TOKEN_ENDPOINT = "https://aip.baidubce.com/oauth/2.0/token";
const BAIDU_ACCURATE_ENDPOINT = "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic";
const TOKEN_EXPIRY_BUFFER_MS = 60_000;

const tokenCache = new Map<string, { token: string; expiresAt: number }>();

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
  if (!imagesBase64.length) {
    return "";
  }

  if (settings.provider === "none") {
    return "";
  }

  if (!hasReadyOcrSettings(settings)) {
    throw new Error("OCR 配置未保存完整，请补全 API Key 和 Secret Key。");
  }

  switch (settings.provider) {
    case "baidu":
      return extractTextWithBaidu(imagesBase64, settings);
    default:
      throw new Error("暂不支持当前 OCR 服务商。");
  }
}

async function extractTextWithBaidu(imagesBase64: string[], settings: OcrSettings) {
  const accessToken = await getBaiduAccessToken(settings);
  const pageTexts: string[] = [];

  for (const imageBase64 of imagesBase64) {
    const response = await fetch(`${BAIDU_ACCURATE_ENDPOINT}?access_token=${accessToken}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json"
      },
      body: new URLSearchParams({
        image: imageBase64
      }).toString()
    });

    const data = (await response.json()) as BaiduOcrResponse;
    if (!response.ok || data.error_code) {
      throw new Error(
        data.error_msg
          ? `百度 OCR 请求失败: ${data.error_msg}`
          : `百度 OCR 请求失败(${response.status})`
      );
    }

    const text = (data.words_result ?? [])
      .map((item) => item.words?.trim() ?? "")
      .filter(Boolean)
      .join("\n");

    if (text) {
      pageTexts.push(text);
    }
  }

  return pageTexts.join("\n\n");
}

async function getBaiduAccessToken(settings: OcrSettings) {
  const cacheKey = `${settings.apiKey}:${settings.secretKey}`;
  const cached = tokenCache.get(cacheKey);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }

  const url = new URL(BAIDU_TOKEN_ENDPOINT);
  url.searchParams.set("grant_type", "client_credentials");
  url.searchParams.set("client_id", settings.apiKey.trim());
  url.searchParams.set("client_secret", settings.secretKey.trim());

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Accept: "application/json"
    }
  });

  const data = (await response.json()) as BaiduTokenResponse;
  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description
        ? `百度 OCR 鉴权失败: ${data.error_description}`
        : "百度 OCR 鉴权失败。"
    );
  }

  const expiresAt =
    Date.now() + Math.max((data.expires_in ?? 0) * 1000 - TOKEN_EXPIRY_BUFFER_MS, 0);

  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt
  });

  return data.access_token;
}
