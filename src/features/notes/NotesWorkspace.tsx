import { useState } from "react";
import { formatDate } from "../../lib/file-utils";
import type {
  DocumentRecord,
  GeneratedNote,
  ImportSummary,
  SaveResult
} from "../../lib/types";

interface NotesWorkspaceProps {
  documents: DocumentRecord[];
  notes: GeneratedNote[];
  summary: ImportSummary | null;
  savedOutput: SaveResult | null;
  selectedCategory: string;
  selectedNoteId: string | null;
  onOpenReviewSummary: () => Promise<void>;
  onSelectCategory: (category: string) => void;
  onSelectNote: (noteId: string) => void;
  onChangeNoteContent: (noteId: string, content: string) => void;
  onResaveToFolder: () => Promise<void>;
}

export function NotesWorkspace({
  documents,
  notes,
  summary,
  savedOutput,
  selectedCategory,
  selectedNoteId,
  onOpenReviewSummary,
  onSelectCategory,
  onSelectNote,
  onChangeNoteContent,
  onResaveToFolder
}: NotesWorkspaceProps) {
  const [query, setQuery] = useState("");
  const categories = ["全部", ...new Set(notes.map((note) => note.category))];
  const categoryNotes =
    selectedCategory === "全部"
      ? notes
      : notes.filter((note) => note.category === selectedCategory);

  const filteredNotes = categoryNotes.filter((note) => {
    const haystack = `${note.title} ${note.summary} ${note.tags.join(" ")} ${note.content}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const activeNote =
    filteredNotes.find((note) => note.id === selectedNoteId) ?? filteredNotes[0] ?? null;
  const sourceDocument = documents.find((document) => document.id === activeNote?.documentId);

  return (
    <section className="report-layout">
      <aside className="report-column report-column-left">
        <div className="column-card">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Report</p>
              <h3>文件夹总览</h3>
            </div>
            <div className="panel-actions">
              <button className="ghost-button" onClick={onOpenReviewSummary} disabled={!savedOutput}>
                打开复习冲刺
              </button>
              <button className="ghost-button" onClick={onResaveToFolder}>
                重新保存
              </button>
            </div>
          </div>

          <div className="report-overview">
            <strong>{summary?.folderName ?? "尚未生成报告"}</strong>
            <p>{summary?.overview ?? "生成报告后，这里会出现整个文件夹的整理结论。"}</p>
          </div>

          <div className="highlights-list">
            {(summary?.highlights ?? []).map((item) => (
              <div key={item} className="highlight-item">
                {item}
              </div>
            ))}
          </div>

          <div className="output-card">
            <span>自动保存目录</span>
            <strong>{savedOutput?.outputDir ?? "生成后会自动写回所选文件夹内的 FolderMind-output"}</strong>
          </div>

          <div className="output-card">
            <span>复习冲刺总结</span>
            <strong>{savedOutput?.reviewReportPath ?? "生成后会额外保存一份复习冲刺 Markdown"}</strong>
          </div>
        </div>

        <div className="column-card">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Categories</p>
              <h3>分类导航</h3>
            </div>
          </div>
          <div className="category-list">
            {categories.map((category) => {
              const count =
                category === "全部"
                  ? notes.length
                  : notes.filter((note) => note.category === category).length;
              return (
                <button
                  key={category}
                  className={category === selectedCategory ? "category-item active" : "category-item"}
                  onClick={() => onSelectCategory(category)}
                >
                  <span>{category}</span>
                  <strong>{count}</strong>
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <div className="report-column report-column-center">
        <div className="column-card">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Documents</p>
              <h3>分类笔记</h3>
            </div>
          </div>
          <input
            className="search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索标题、摘要、标签"
          />
          <div className="note-list">
            {filteredNotes.length ? (
              filteredNotes.map((note) => (
                <button
                  key={note.id}
                  className={note.id === activeNote?.id ? "note-item active" : "note-item"}
                  onClick={() => onSelectNote(note.id)}
                >
                  <strong>{note.title}</strong>
                  <p>{note.summary}</p>
                  <div className="note-footer">
                    <span>{note.category}</span>
                    <small>{note.confidence}</small>
                  </div>
                </button>
              ))
            ) : (
              <div className="empty-state">当前条件下没有匹配的笔记。</div>
            )}
          </div>
        </div>
      </div>

      <div className="report-column report-column-right">
        <div className="column-card editor-card">
          <div className="panel-heading compact">
            <div>
              <p className="eyebrow">Editor</p>
              <h3>{activeNote?.title ?? "笔记详情"}</h3>
            </div>
          </div>

          {activeNote ? (
            <>
              <div className="detail-meta">
                <p>{activeNote.summary}</p>
                <div className="tag-row">
                  {activeNote.tags.map((tag) => (
                    <span key={tag} className="tag">
                      {tag}
                    </span>
                  ))}
                </div>
                <div className="meta-line">
                  <span>来源: {sourceDocument?.relativePath ?? "未知文件"}</span>
                  <span>更新时间: {formatDate(activeNote.updatedAt)}</span>
                </div>
              </div>

              <textarea
                className="editor-area"
                value={activeNote.content}
                onChange={(event) => onChangeNoteContent(activeNote.id, event.target.value)}
              />
            </>
          ) : (
            <div className="empty-state">还没有可查看的笔记。</div>
          )}
        </div>
      </div>
    </section>
  );
}
