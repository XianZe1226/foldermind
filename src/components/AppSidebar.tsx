import type { AppView, ProcessingStatus } from "../lib/types";

interface AppSidebarProps {
  currentView: AppView;
  status: ProcessingStatus;
  noteCount: number;
  documentCount: number;
  selectedFolderPath: string | null;
  hasSavedSettings: boolean;
  hasSavedOcrSettings: boolean;
  onChangeView: (view: AppView) => void;
}

export function AppSidebar({
  currentView,
  status,
  noteCount,
  documentCount,
  selectedFolderPath,
  hasSavedSettings,
  hasSavedOcrSettings,
  onChangeView
}: AppSidebarProps) {
  const items: Array<{ view: AppView; title: string; subtitle: string }> = [
    { view: "import", title: "Workspace", subtitle: "扫描与整理当前文件夹" },
    { view: "notes", title: "Report", subtitle: "查看分类笔记和报告" },
    { view: "settings", title: "Providers", subtitle: "保存当前生效的模型配置" }
  ];

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="brand-mark">FM</div>
        <div>
          <p className="eyebrow">FolderMind</p>
          <h1>Research Workspace</h1>
        </div>
      </div>

      <div className="sidebar-summary">
        <div>
          <span className="summary-label">状态</span>
          <strong>{status}</strong>
        </div>
        <div>
          <span className="summary-label">文件</span>
          <strong>{documentCount}</strong>
        </div>
        <div>
          <span className="summary-label">笔记</span>
          <strong>{noteCount}</strong>
        </div>
      </div>

      <div className="sidebar-meta">
        <div className="meta-block">
          <span>当前文件夹</span>
          <strong>{selectedFolderPath ?? "尚未选择"}</strong>
        </div>
        <div className="meta-block">
          <span>模型配置</span>
          <strong>{hasSavedSettings ? "已保存，可调用" : "未保存，暂不可总结"}</strong>
        </div>
        <div className="meta-block">
          <span>OCR</span>
          <strong>{hasSavedOcrSettings ? "已就绪或未启用" : "未保存完整，扫描时不会启用"}</strong>
        </div>
      </div>

      <nav className="nav-list">
        {items.map((item) => (
          <button
            key={item.view}
            className={currentView === item.view ? "nav-item active" : "nav-item"}
            onClick={() => onChangeView(item.view)}
          >
            <strong>{item.title}</strong>
            <span>{item.subtitle}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}
