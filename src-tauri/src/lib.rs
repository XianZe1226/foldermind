use std::{
    fs,
    process::Command,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use base64::{engine::general_purpose::STANDARD, Engine};
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::command;
use walkdir::WalkDir;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ScannedFile {
    name: String,
    absolute_path: String,
    relative_path: String,
    extension: String,
    size: u64,
    last_modified: u64,
    text_content: Option<String>,
    binary_base64: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedArtifact {
    filename: String,
    content: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct SaveResult {
    output_dir: String,
    report_path: String,
    review_report_path: String,
    notes_json_path: String,
    note_paths: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfExtractionResult {
    text: String,
    images_base64: Vec<String>,
    processed_pages: u32,
    total_pages: u32,
    ocr_candidate_pages: u32,
    ocr_truncated: bool,
}

#[command]
fn pick_folder() -> Option<String> {
    FileDialog::new()
        .pick_folder()
        .map(|path| path.display().to_string())
}

#[command]
fn scan_folder(root_path: String) -> Result<Vec<ScannedFile>, String> {
    let root = PathBuf::from(root_path);
    if !root.exists() || !root.is_dir() {
        return Err("所选路径不是有效文件夹。".to_string());
    }

    let mut files = Vec::new();

    for entry in WalkDir::new(&root)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
    {
        let path = entry.path().to_path_buf();
        let extension = lowercase_extension(&path);
        if !matches!(extension.as_str(), ".md" | ".txt" | ".pdf" | ".docx") {
            continue;
        }

        let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
        let last_modified = metadata
            .modified()
            .ok()
            .and_then(|time| time.duration_since(UNIX_EPOCH).ok())
            .map(|duration| duration.as_millis() as u64)
            .unwrap_or_default();

        let relative_path = path
            .strip_prefix(&root)
            .unwrap_or(&path)
            .display()
            .to_string();

        let text_content = if matches!(extension.as_str(), ".md" | ".txt") {
            Some(read_text_file(&path)?)
        } else {
            None
        };

        let binary_base64 = if matches!(extension.as_str(), ".pdf" | ".docx") {
            let bytes = fs::read(&path).map_err(|error| error.to_string())?;
            Some(STANDARD.encode(bytes))
        } else {
            None
        };

        files.push(ScannedFile {
            name: path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| relative_path.clone()),
            absolute_path: path.display().to_string(),
            relative_path,
            extension,
            size: metadata.len(),
            last_modified,
            text_content,
            binary_base64,
        });
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

#[command]
fn write_analysis_bundle(
    root_path: String,
    report_markdown: String,
    review_markdown: String,
    notes_json: String,
    note_files: Vec<SavedArtifact>,
) -> Result<SaveResult, String> {
    let output_dir = Path::new(&root_path).join("FolderMind-output");
    let notes_dir = output_dir.join("notes");

    fs::create_dir_all(&notes_dir).map_err(|error| error.to_string())?;

    let report_path = output_dir.join("foldermind-report.md");
    let review_report_path = output_dir.join("foldermind-review-summary.md");
    let notes_json_path = output_dir.join("foldermind-notes.json");

    fs::write(&report_path, report_markdown).map_err(|error| error.to_string())?;
    fs::write(&review_report_path, review_markdown).map_err(|error| error.to_string())?;
    fs::write(&notes_json_path, notes_json).map_err(|error| error.to_string())?;

    let mut note_paths = Vec::new();
    for note in note_files {
        let note_path = notes_dir.join(note.filename);
        fs::write(&note_path, note.content).map_err(|error| error.to_string())?;
        note_paths.push(note_path.display().to_string());
    }

    Ok(SaveResult {
        output_dir: output_dir.display().to_string(),
        report_path: report_path.display().to_string(),
        review_report_path: review_report_path.display().to_string(),
        notes_json_path: notes_json_path.display().to_string(),
        note_paths,
    })
}

#[command]
fn extract_pdf_payload(pdf_path: String, max_pages: u32) -> Result<PdfExtractionResult, String> {
    let output = Command::new("python3")
        .arg("-c")
        .arg(PDF_HELPER_SCRIPT)
        .arg(&pdf_path)
        .arg(max_pages.to_string())
        .output()
        .map_err(|error| format!("无法启动本地 PDF 解析器: {error}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "本地 PDF 解析器执行失败。".to_string()
        } else {
            format!("本地 PDF 解析器执行失败: {stderr}")
        });
    }

    let stdout = String::from_utf8(output.stdout).map_err(|error| error.to_string())?;
    let payload: Value = serde_json::from_str(&stdout).map_err(|error| error.to_string())?;

    Ok(PdfExtractionResult {
        text: payload
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string(),
        images_base64: payload
            .get("imagesBase64")
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToString::to_string)
                    .collect()
            })
            .unwrap_or_default(),
        processed_pages: payload
            .get("processedPages")
            .and_then(Value::as_u64)
            .unwrap_or_default() as u32,
        total_pages: payload
            .get("totalPages")
            .and_then(Value::as_u64)
            .unwrap_or_default() as u32,
        ocr_candidate_pages: payload
            .get("ocrCandidatePages")
            .and_then(Value::as_u64)
            .unwrap_or_default() as u32,
        ocr_truncated: payload
            .get("ocrTruncated")
            .and_then(Value::as_bool)
            .unwrap_or(false),
    })
}

#[command]
fn open_local_path(target_path: String) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(&target_path);
        cmd
    };

    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("cmd");
        cmd.args(["/C", "start", "", &target_path]);
        cmd
    };

    #[cfg(all(not(target_os = "macos"), not(target_os = "windows")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(&target_path);
        cmd
    };

    command
        .status()
        .map_err(|error| format!("无法打开文件: {error}"))?;

    Ok(())
}

fn read_text_file(path: &Path) -> Result<String, String> {
    match fs::read_to_string(path) {
        Ok(content) => Ok(content),
        Err(_) => {
            let bytes = fs::read(path).map_err(|error| error.to_string())?;
            Ok(String::from_utf8_lossy(&bytes).to_string())
        }
    }
}

fn lowercase_extension(path: &Path) -> String {
    path.extension()
        .map(|extension| format!(".{}", extension.to_string_lossy().to_lowercase()))
        .unwrap_or_default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            pick_folder,
            scan_folder,
            write_analysis_bundle,
            extract_pdf_payload,
            open_local_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

const PDF_HELPER_SCRIPT: &str = r#"
import base64
import io
import json
import sys

pdf_path = sys.argv[1]
max_pages = int(sys.argv[2])

try:
    import fitz
except Exception as exc:
    raise SystemExit(f'PyMuPDF(fitz) 不可用: {exc}')

doc = fitz.open(pdf_path)
text_parts = []
images = []
ocr_page_indices = []

for page_index in range(len(doc)):
    page = doc.load_page(page_index)
    page_text = page.get_text('text') or ''
    text_parts.append(page_text)
    normalized = ''.join(page_text.split())
    if len(normalized) < 40:
        ocr_page_indices.append(page_index)

processed_pages = len(ocr_page_indices) if max_pages <= 0 else min(len(ocr_page_indices), max_pages)
for page_index in ocr_page_indices[:processed_pages]:
    page = doc.load_page(page_index)
    pix = page.get_pixmap(matrix=fitz.Matrix(1.8, 1.8), alpha=False)
    png_bytes = pix.tobytes('png')
    images.append(base64.b64encode(png_bytes).decode('ascii'))

print(json.dumps({
    'text': '\n'.join(text_parts),
    'imagesBase64': images,
    'processedPages': processed_pages,
    'totalPages': len(doc),
    'ocrCandidatePages': len(ocr_page_indices),
    'ocrTruncated': len(ocr_page_indices) > processed_pages,
}, ensure_ascii=False))
"#;
