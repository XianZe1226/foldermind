import { useEffect, useState } from "react";
import { AppSidebar } from "./components/AppSidebar";
import { ImportPanel } from "./features/import/ImportPanel";
import { NotesWorkspace } from "./features/notes/NotesWorkspace";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { generateNotesFromDocuments } from "./lib/ai-service";
import { openLocalPath, pickFolder, scanFolder, writeAnalysisBundle } from "./lib/backend";
import { defaultOcrSettings, defaultSettings } from "./lib/constants";
import { rawFileToDocument } from "./lib/file-utils";
import {
  buildNoteArtifacts,
  buildNotesJson,
  buildReportMarkdown,
  buildReviewMarkdown
} from "./lib/report-files";
import { loadSnapshot, saveSnapshot } from "./lib/storage";
import type {
  AppView,
  DocumentRecord,
  GeneratedNote,
  ImportSummary,
  OcrSettings,
  ProcessingStatus,
  ProviderSettings,
  SaveResult
} from "./lib/types";

function App() {
  const [snapshot] = useState(() => loadSnapshot());

  const [view, setView] = useState<AppView>("import");
  const [status, setStatus] = useState<ProcessingStatus>("idle");
  const [documents, setDocuments] = useState<DocumentRecord[]>(snapshot.documents);
  const [notes, setNotes] = useState<GeneratedNote[]>(snapshot.notes);
  const [summary, setSummary] = useState<ImportSummary | null>(snapshot.summary);
  const [reviewMarkdown, setReviewMarkdown] = useState<string | null>(snapshot.reviewMarkdown);
  const [savedSettings, setSavedSettings] = useState<ProviderSettings>(
    snapshot.savedSettings ?? defaultSettings
  );
  const [draftSettings, setDraftSettings] = useState<ProviderSettings>(
    snapshot.savedSettings ?? defaultSettings
  );
  const [savedOcrSettings, setSavedOcrSettings] = useState<OcrSettings>(
    snapshot.savedOcrSettings ?? defaultOcrSettings
  );
  const [draftOcrSettings, setDraftOcrSettings] = useState<OcrSettings>(
    snapshot.savedOcrSettings ?? defaultOcrSettings
  );
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(
    snapshot.selectedFolderPath
  );
  const [savedOutput, setSavedOutput] = useState<SaveResult | null>(snapshot.savedOutput);
  const [selectedCategory, setSelectedCategory] = useState("全部");
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    snapshot.notes[0]?.id ?? null
  );
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [reviewPromptState, setReviewPromptState] = useState<{
    visible: boolean;
    path: string | null;
    autoOpened: boolean;
  }>({
    visible: false,
    path: null,
    autoOpened: false
  });

  const hasSavedSettings =
    savedSettings.apiKey.trim().length > 0 &&
    savedSettings.baseUrl.trim().length > 0 &&
    savedSettings.model.trim().length > 0;
  const hasSavedOcrSettings =
    savedOcrSettings.provider === "none" ||
    (savedOcrSettings.apiKey.trim().length > 0 && savedOcrSettings.secretKey.trim().length > 0);

  useEffect(() => {
    saveSnapshot({
      documents,
      notes,
      summary,
      reviewMarkdown,
      savedSettings,
      savedOcrSettings,
      selectedFolderPath,
      savedOutput
    });
  }, [documents, notes, summary, reviewMarkdown, savedSettings, savedOcrSettings, selectedFolderPath, savedOutput]);

  async function handlePickFolder() {
    try {
      setStatus("scanning");
      setStatusMessage("正在打开文件夹选择器...");

      const folderPath = await pickFolder();
      if (!folderPath) {
        setStatus("idle");
        setStatusMessage("已取消选择文件夹。");
        return;
      }

      const rawFiles = await scanFolder(folderPath);
      const parsedDocuments = await Promise.all(
        rawFiles.map((rawFile) =>
          rawFileToDocument(rawFile, {
            ocrSettings: savedOcrSettings
          })
        )
      );
      const ocrCount = parsedDocuments.filter((document) =>
        document.warnings.some((warning) => warning.includes("OCR"))
      ).length;

      setSelectedFolderPath(folderPath);
      setDocuments(parsedDocuments);
      setNotes([]);
      setSummary(null);
      setReviewMarkdown(null);
      setSavedOutput(null);
      setSelectedCategory("全部");
      setSelectedNoteId(null);
      setStatus("scanned");
      setView("import");
      setStatusMessage(
        ocrCount
          ? `已扫描 ${parsedDocuments.length} 份文件，其中 ${ocrCount} 份使用了 OCR。请确认是否总结当前文件夹。`
          : `已扫描 ${parsedDocuments.length} 份文件。请确认是否总结当前文件夹。`
      );
    } catch (error) {
      console.error(error);
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "扫描文件夹失败。");
    }
  }

  async function handleSummarizeCurrentFolder() {
    if (!selectedFolderPath) {
      setStatusMessage("请先选择一个文件夹。");
      return;
    }

    if (!hasSavedSettings) {
      setView("settings");
      setStatusMessage("请先在设置页保存模型 API 配置，再开始总结。");
      return;
    }

    try {
      setStatus("summarizing");
      setStatusMessage(`正在调用 ${savedSettings.provider} 生成结构化报告...`);

      const folderName = selectedFolderPath.split("/").filter(Boolean).pop() ?? "当前文件夹";
      const generated = await generateNotesFromDocuments(documents, savedSettings, folderName);

      setStatus("saving");
      setStatusMessage("正在把总报告、整体复习总结和笔记自动写回所选文件夹...");

      const reportMarkdown = buildReportMarkdown(generated.summary);
      const reviewReportMarkdown = buildReviewMarkdown(
        folderName,
        generated.reviewMarkdown,
        generated.summary.generatedAt
      );
      const notesJson = buildNotesJson(generated.notes, generated.summary);
      const noteFiles = buildNoteArtifacts(generated.notes);
      const output = await writeAnalysisBundle(
        selectedFolderPath,
        reportMarkdown,
        reviewReportMarkdown,
        notesJson,
        noteFiles
      );

      setNotes(generated.notes);
      setSummary(generated.summary);
      setReviewMarkdown(reviewReportMarkdown);
      setSavedOutput(output);
      setSelectedCategory("全部");
      setSelectedNoteId(generated.notes[0]?.id ?? null);
      setStatus("ready");
      setView("notes");
      setStatusMessage(`已自动保存到 ${output.outputDir}，正在打开复习冲刺总结...`);

      let autoOpened = false;
      try {
        await openLocalPath(output.reviewReportPath);
        autoOpened = true;
        setStatusMessage(`已自动保存到 ${output.outputDir}，并已打开复习冲刺总结。`);
      } catch {
        setStatusMessage(
          `已自动保存到 ${output.outputDir}，但未能自动打开复习冲刺总结，请在弹窗中重试。`
        );
      }

      setReviewPromptState({
        visible: true,
        path: output.reviewReportPath,
        autoOpened
      });
    } catch (error) {
      console.error(error);
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "总结失败。");
    }
  }

  async function handleResaveToFolder() {
    if (!selectedFolderPath || !summary || !notes.length || !reviewMarkdown) {
      setStatusMessage("当前没有可保存的报告内容。");
      return;
    }

    try {
      setStatus("saving");
      const output = await writeAnalysisBundle(
        selectedFolderPath,
        buildReportMarkdown(summary),
        reviewMarkdown,
        buildNotesJson(notes, summary),
        buildNoteArtifacts(notes)
      );
      setSavedOutput(output);
      setStatus("ready");
      setStatusMessage(`已重新保存到 ${output.outputDir}`);
    } catch (error) {
      console.error(error);
      setStatus("error");
      setStatusMessage(error instanceof Error ? error.message : "重新保存失败。");
    }
  }

  function handleNoteContentChange(noteId: string, content: string) {
    setNotes((current) =>
      current.map((note) =>
        note.id === noteId
          ? {
              ...note,
              content,
              updatedAt: Date.now()
            }
          : note
      )
    );
  }

  function handleSaveSettings() {
    setSavedSettings(draftSettings);
    setSavedOcrSettings(draftOcrSettings);
    setStatusMessage("模型与 OCR 配置已保存，之后的扫描和总结都会使用这组参数。");
  }

  async function handleOpenReviewSummary() {
    if (!savedOutput?.reviewReportPath) {
      setStatusMessage("当前还没有可打开的复习冲刺总结。");
      return;
    }

    try {
      await openLocalPath(savedOutput.reviewReportPath);
      setStatusMessage(`已打开复习冲刺总结：${savedOutput.reviewReportPath}`);
    } catch (error) {
      console.error(error);
      setStatusMessage(error instanceof Error ? error.message : "打开复习冲刺总结失败。");
    }
  }

  return (
    <div className="app-shell">
      <AppSidebar
        currentView={view}
        status={status}
        noteCount={notes.length}
        documentCount={documents.length}
        selectedFolderPath={selectedFolderPath}
        hasSavedSettings={hasSavedSettings}
        hasSavedOcrSettings={hasSavedOcrSettings}
        onChangeView={setView}
      />

      <main className="app-main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Workspace Flow</p>
            <h2>扫描本地资料，确认后总结，再把分类笔记自动写回原文件夹</h2>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" onClick={() => setView("settings")}>
              接口设置
            </button>
            <button className="primary-button" onClick={handlePickFolder}>
              重新选择文件夹
            </button>
          </div>
        </header>

        {view === "import" && (
          <ImportPanel
            status={status}
            documents={documents}
            selectedFolderPath={selectedFolderPath}
            hasSavedSettings={hasSavedSettings}
            savedOcrSettings={savedOcrSettings}
            statusMessage={statusMessage}
            onPickFolder={handlePickFolder}
            onSummarize={handleSummarizeCurrentFolder}
          />
        )}

        {view === "notes" && (
          <NotesWorkspace
            documents={documents}
            notes={notes}
            summary={summary}
            savedOutput={savedOutput}
            selectedCategory={selectedCategory}
            selectedNoteId={selectedNoteId}
            onOpenReviewSummary={handleOpenReviewSummary}
            onSelectCategory={setSelectedCategory}
            onSelectNote={setSelectedNoteId}
            onChangeNoteContent={handleNoteContentChange}
            onResaveToFolder={handleResaveToFolder}
          />
        )}

        {view === "settings" && (
          <SettingsPanel
            draftSettings={draftSettings}
            savedSettings={savedSettings}
            draftOcrSettings={draftOcrSettings}
            savedOcrSettings={savedOcrSettings}
            onChangeModel={setDraftSettings}
            onChangeOcr={setDraftOcrSettings}
            onSave={handleSaveSettings}
          />
        )}
      </main>

      {reviewPromptState.visible && reviewPromptState.path ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-modal-title"
          >
            <p className="eyebrow">Review Sprint</p>
            <h3 id="review-modal-title">复习冲刺总结已生成</h3>
            <p>
              已按“看完就去做题”的目标生成整体复习冲刺，并保存到下面这个文件。
              {reviewPromptState.autoOpened ? " 文档已经自动打开，你也可以再次打开。" : " 你现在可以直接打开它。"}
            </p>
            <div className="modal-path">{reviewPromptState.path}</div>
            <div className="modal-actions">
              <button className="primary-button" onClick={handleOpenReviewSummary}>
                {reviewPromptState.autoOpened ? "再次打开复习冲刺总结" : "打开复习冲刺总结"}
              </button>
              <button
                className="ghost-button"
                onClick={() =>
                  setReviewPromptState({
                    visible: false,
                    path: null,
                    autoOpened: false
                  })
                }
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
