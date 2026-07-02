import { providerPresets } from "../../lib/constants";
import type { OcrProvider, OcrSettings, ProviderSettings, SupportedProvider } from "../../lib/types";

interface SettingsPanelProps {
  draftSettings: ProviderSettings;
  savedSettings: ProviderSettings;
  draftOcrSettings: OcrSettings;
  savedOcrSettings: OcrSettings;
  onChangeModel: (settings: ProviderSettings) => void;
  onChangeOcr: (settings: OcrSettings) => void;
  onSave: () => void;
}

export function SettingsPanel({
  draftSettings,
  savedSettings,
  draftOcrSettings,
  savedOcrSettings,
  onChangeModel,
  onChangeOcr,
  onSave
}: SettingsPanelProps) {
  const modelDirty = JSON.stringify(draftSettings) !== JSON.stringify(savedSettings);
  const ocrDirty = JSON.stringify(draftOcrSettings) !== JSON.stringify(savedOcrSettings);
  const dirty = modelDirty || ocrDirty;
  const modelValid =
    draftSettings.apiKey.trim().length > 0 &&
    draftSettings.baseUrl.trim().length > 0 &&
    draftSettings.model.trim().length > 0;
  const ocrValid =
    draftOcrSettings.provider === "none" ||
    (draftOcrSettings.apiKey.trim().length > 0 && draftOcrSettings.secretKey.trim().length > 0);
  const canSave =
    dirty && modelValid && ocrValid;

  function updateField<K extends keyof ProviderSettings>(
    field: K,
    value: ProviderSettings[K]
  ) {
    onChangeModel({
      ...draftSettings,
      [field]: value
    });
  }

  function updateOcrField<K extends keyof OcrSettings>(field: K, value: OcrSettings[K]) {
    onChangeOcr({
      ...draftOcrSettings,
      [field]: value
    });
  }

  function handleProviderChange(provider: SupportedProvider) {
    const preset = providerPresets[provider];
    onChangeModel({
      provider,
      apiKey: draftSettings.apiKey,
      baseUrl: preset.baseUrl,
      model: preset.model
    });
  }

  function handleOcrProviderChange(provider: OcrProvider) {
    onChangeOcr({
      provider,
      apiKey: provider === "none" ? "" : draftOcrSettings.apiKey,
      secretKey: provider === "none" ? "" : draftOcrSettings.secretKey
    });
  }

  return (
    <section className="workspace-panel settings-shell">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Provider Setup</p>
          <h2>模型与 OCR 配置</h2>
        </div>
        <button className="primary-button" disabled={!canSave} onClick={onSave}>
          保存当前配置
        </button>
      </div>

      <div className="settings-section">
        <div className="settings-section-head">
          <p className="eyebrow">Model</p>
          <strong>总结时实际调用这一组已保存的模型参数</strong>
        </div>
        <div className="settings-grid">
          <label className="field">
            <span>Provider</span>
            <select
              value={draftSettings.provider}
              onChange={(event) => handleProviderChange(event.target.value as SupportedProvider)}
            >
              <option value="deepseek">DeepSeek</option>
              <option value="qwen">Qwen</option>
              <option value="glm">GLM</option>
              <option value="minimax">MiniMax</option>
            </select>
          </label>

          <label className="field">
            <span>Base URL</span>
            <input
              value={draftSettings.baseUrl}
              onChange={(event) => updateField("baseUrl", event.target.value)}
              placeholder="https://api.deepseek.com"
            />
          </label>

          <label className="field">
            <span>Model</span>
            <input
              value={draftSettings.model}
              onChange={(event) => updateField("model", event.target.value)}
              placeholder="deepseek-v4-flash"
            />
          </label>

          <label className="field field-wide">
            <span>API Key</span>
            <input
              type="password"
              value={draftSettings.apiKey}
              onChange={(event) => updateField("apiKey", event.target.value)}
              placeholder="输入模型 API Key"
            />
          </label>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-head">
          <p className="eyebrow">OCR</p>
          <strong>扫描 PDF 时在文本抽取不足的情况下自动补做识别</strong>
        </div>
        <div className="settings-grid">
          <label className="field">
            <span>OCR Provider</span>
            <select
              value={draftOcrSettings.provider}
              onChange={(event) => handleOcrProviderChange(event.target.value as OcrProvider)}
            >
              <option value="none">关闭 OCR</option>
              <option value="baidu">百度 OCR</option>
            </select>
          </label>

          <div className="field field-hint">
            <span>生效方式</span>
            <p>需要点击保存。保存后重新扫描文件夹，OCR fallback 才会参与 PDF 读取。</p>
          </div>

          <label className="field">
            <span>API Key</span>
            <input
              type="password"
              value={draftOcrSettings.apiKey}
              onChange={(event) => updateOcrField("apiKey", event.target.value)}
              placeholder="输入 OCR API Key"
              disabled={draftOcrSettings.provider === "none"}
            />
          </label>

          <label className="field">
            <span>Secret Key</span>
            <input
              type="password"
              value={draftOcrSettings.secretKey}
              onChange={(event) => updateOcrField("secretKey", event.target.value)}
              placeholder="输入 OCR Secret Key"
              disabled={draftOcrSettings.provider === "none"}
            />
          </label>
        </div>
      </div>

      <div className="settings-footnote">
        <div className="status-chip">
          {dirty ? "当前改动尚未保存" : "当前配置已保存并会被扫描 / 总结流程使用"}
        </div>
        <p>
          默认模型预设是 DeepSeek。Qwen / GLM / MiniMax 这里提供的是可编辑国内模型预设。
          OCR 目前内置百度 OCR，后续如果你还要扩展腾讯云或阿里云，也可以继续沿着这一层接。
        </p>
      </div>
    </section>
  );
}
