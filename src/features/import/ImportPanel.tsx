import { formatBytes, formatDate } from "../../lib/file-utils";
import type { DocumentRecord, OcrSettings, ProcessingStatus } from "../../lib/types";

interface ImportPanelProps {
  status: ProcessingStatus;
  documents: DocumentRecord[];
  selectedFolderPath: string | null;
  hasSavedSettings: boolean;
  savedOcrSettings: OcrSettings;
  statusMessage: string | null;
  onPickFolder: () => Promise<void>;
  onSummarize: () => Promise<void>;
}

export function ImportPanel({
  status,
  documents,
  selectedFolderPath,
  hasSavedSettings,
  savedOcrSettings,
  statusMessage,
  onPickFolder,
  onSummarize
}: ImportPanelProps) {
  const readableDocuments = documents.filter((document) => document.text.trim().length > 0);
  const ocrStatus =
    savedOcrSettings.provider === "none"
      ? "未启用"
      : savedOcrSettings.apiKey.trim().length > 0 && savedOcrSettings.secretKey.trim().length > 0
        ? `已启用 ${savedOcrSettings.provider}`
        : "配置未保存完整";

  return (
    <section className="workspace-panel import-shell">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Folder Intake</p>
          <h2>先扫描，再确认是否总结</h2>
        </div>
        <button className="primary-button" onClick={onPickFolder}>
          选择文件夹
        </button>
      </div>

      <div className="hero-strip">
        <div>
          <span className="summary-label">当前目录</span>
          <strong>{selectedFolderPath ?? "尚未选择文件夹"}</strong>
        </div>
        <div>
          <span className="summary-label">支持格式</span>
          <strong>md / txt / pdf / docx</strong>
        </div>
        <div>
          <span className="summary-label">可用于总结</span>
          <strong>{readableDocuments.length} / {documents.length}</strong>
        </div>
        <div>
          <span className="summary-label">OCR</span>
          <strong>{ocrStatus}</strong>
        </div>
      </div>

      {statusMessage ? <div className="info-banner">{statusMessage}</div> : null}

      <div className="confirm-card">
        <div>
          <p className="eyebrow">Confirmation</p>
          <h3>是否总结当前文件夹？</h3>
          <p>
            扫描完成后不会自动调用模型。只有你点击下面的按钮，并且已经保存模型配置，
            才会开始生成报告与分类笔记。
          </p>
        </div>
        <button
          className="primary-button"
          disabled={status !== "scanned" || !documents.length || !hasSavedSettings}
          onClick={onSummarize}
        >
          总结当前文件夹
        </button>
      </div>

      <div className="scan-grid">
        <div className="scan-stat">
          <span>扫描状态</span>
          <strong>{status}</strong>
        </div>
        <div className="scan-stat">
          <span>已识别文件</span>
          <strong>{documents.length}</strong>
        </div>
        <div className="scan-stat">
          <span>可读正文文件</span>
          <strong>{readableDocuments.length}</strong>
        </div>
        <div className="scan-stat">
          <span>配置状态</span>
          <strong>{hasSavedSettings ? "已保存，可开始总结" : "请先保存 API"}</strong>
        </div>
      </div>

      <div className="file-table">
        <table>
          <thead>
            <tr>
              <th>文件</th>
              <th>类型</th>
              <th>大小</th>
              <th>修改时间</th>
              <th>内容状态</th>
            </tr>
          </thead>
          <tbody>
            {documents.length ? (
              documents.map((document) => (
                <tr key={document.id}>
                  <td>
                    <div className="file-title">
                      <strong>{document.name}</strong>
                      <span>{document.relativePath}</span>
                    </div>
                  </td>
                  <td>{document.type}</td>
                  <td>{formatBytes(document.size)}</td>
                  <td>{formatDate(document.lastModified)}</td>
                  <td>
                    {document.warnings.length
                      ? document.warnings.join("；")
                      : "正文提取正常，可直接总结"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={5} className="empty-cell">
                  先选择一个本地文件夹。扫描后这里会告诉你哪些文件真正读到了正文。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
