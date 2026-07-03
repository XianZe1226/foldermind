use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{Duration, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD, Engine};
use reqwest::blocking::Client;
use rfd::FileDialog;
use serde::{Deserialize, Serialize};
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
struct OcrResult {
    text: String,
    page_texts: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct PdfTextExtractionResult {
    text: String,
    page_texts: Vec<String>,
    total_pages: u32,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct LoadedFileContent {
    text_content: Option<String>,
    binary_base64: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BaiduTokenResponse {
    access_token: Option<String>,
    error: Option<String>,
    error_description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BaiduOcrWord {
    words: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BaiduOcrResponse {
    error_code: Option<i64>,
    error_msg: Option<String>,
    words_result: Option<Vec<BaiduOcrWord>>,
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
            text_content: None,
            binary_base64: None,
        });
    }

    files.sort_by(|left, right| left.relative_path.cmp(&right.relative_path));
    Ok(files)
}

#[command]
fn load_file_content(absolute_path: String) -> Result<LoadedFileContent, String> {
    let path = PathBuf::from(&absolute_path);
    if !path.exists() || !path.is_file() {
        return Err("所选文件不存在或无法访问。".to_string());
    }

    let extension = lowercase_extension(&path);
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

    Ok(LoadedFileContent {
        text_content,
        binary_base64,
    })
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

#[command]
fn extract_pdf_text(pdf_path: String) -> Result<PdfTextExtractionResult, String> {
    let pdf_bytes = fs::read(&pdf_path).map_err(|error| format!("无法读取 PDF 文件: {error}"))?;
    let extracted_text = pdf_extract::extract_text_from_mem(&pdf_bytes)
        .map_err(|error| format!("后端 PDF 文本抽取失败: {error}"))?;
    let page_texts = split_pdf_pages(&extracted_text);

    Ok(PdfTextExtractionResult {
        text: page_texts.join("\n\n"),
        total_pages: page_texts.len() as u32,
        page_texts,
    })
}

#[command]
fn perform_ocr(
    images_base64: Vec<String>,
    provider: String,
    api_key: String,
    secret_key: String,
) -> Result<OcrResult, String> {
    let provider = provider.trim().to_lowercase();
    if provider != "baidu" {
        return Err("暂不支持当前 OCR 服务商。".to_string());
    }

    let api_key = api_key.trim().to_string();
    let secret_key = secret_key.trim().to_string();
    if api_key.is_empty() || secret_key.is_empty() {
        return Err("OCR 配置未保存完整，请补全 API Key 和 Secret Key。".to_string());
    }

    let client = Client::builder()
        .connect_timeout(Duration::from_secs(30))
        .timeout(Duration::from_secs(180))
        .build()
        .map_err(|error| format!("OCR 网络客户端初始化失败: {error}"))?;

    let token_response = client
        .post("https://aip.baidubce.com/oauth/2.0/token")
        .query(&[
            ("grant_type", "client_credentials"),
            ("client_id", api_key.as_str()),
            ("client_secret", secret_key.as_str()),
        ])
        .header("Accept", "application/json")
        .send()
        .map_err(|error| format!("百度 OCR 鉴权失败: {error}"))?;

    let token_status = token_response.status();
    let token_payload = token_response
        .json::<BaiduTokenResponse>()
        .map_err(|error| format!("百度 OCR 鉴权响应解析失败: {error}"))?;

    if !token_status.is_success() {
        let message = token_payload
            .error_description
            .or(token_payload.error)
            .unwrap_or_else(|| format!("HTTP {}", token_status.as_u16()));
        return Err(format!("百度 OCR 鉴权失败: {message}"));
    }

    let access_token = token_payload.access_token.ok_or_else(|| {
        let message = token_payload
            .error_description
            .or(token_payload.error)
            .unwrap_or_else(|| "未返回 access_token".to_string());
        format!("百度 OCR 鉴权失败: {message}")
    })?;

    let mut page_texts = Vec::with_capacity(images_base64.len());

    for image_base64 in images_base64 {
        let response = client
            .post(format!(
                "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic?access_token={access_token}"
            ))
            .header("Accept", "application/json")
            .form(&[("image", image_base64)])
            .send()
            .map_err(|error| format!("百度 OCR 请求失败: {error}"))?;

        let status = response.status();
        let payload = response
            .json::<BaiduOcrResponse>()
            .map_err(|error| format!("百度 OCR 响应解析失败: {error}"))?;

        if !status.is_success() {
            let message = payload
                .error_msg
                .unwrap_or_else(|| format!("HTTP {}", status.as_u16()));
            return Err(format!("百度 OCR 请求失败: {message}"));
        }

        if payload.error_code.is_some() {
            return Err(format!(
                "百度 OCR 请求失败: {}",
                payload
                    .error_msg
                    .unwrap_or_else(|| "服务端返回错误".to_string())
            ));
        }

        let page_text = payload
            .words_result
            .unwrap_or_default()
            .into_iter()
            .filter_map(|item| item.words)
            .map(|words| words.trim().to_string())
            .filter(|words| !words.is_empty())
            .collect::<Vec<_>>()
            .join("\n");

        page_texts.push(page_text);
    }

    Ok(OcrResult {
        text: page_texts
            .iter()
            .filter(|text| !text.trim().is_empty())
            .cloned()
            .collect::<Vec<_>>()
            .join("\n\n"),
        page_texts,
    })
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
            load_file_content,
            write_analysis_bundle,
            open_local_path,
            extract_pdf_text,
            perform_ocr
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn split_pdf_pages(raw: &str) -> Vec<String> {
    let normalized = raw.replace("\r\n", "\n");
    let mut pages = normalized
        .split('\u{0C}')
        .map(|page| page.trim().to_string())
        .collect::<Vec<_>>();

    while pages.last().is_some_and(|page| page.is_empty()) {
        pages.pop();
    }

    if pages.is_empty() && !normalized.trim().is_empty() {
        return vec![normalized.trim().to_string()];
    }

    pages
}
