mod processor;

use processor::{BatchMode, ProcessOptions, ProcessSummary};
use std::path::PathBuf;
use tauri::Emitter;

#[tauri::command]
fn pick_files() -> Option<Vec<String>> {
    let files = rfd::FileDialog::new()
        .add_filter(
            "Images",
            &["jpg", "jpeg", "png", "webp", "avif", "heic", "heif"],
        )
        .pick_files()?;

    Some(
        files
            .into_iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect(),
    )
}

#[tauri::command]
fn pick_folder() -> Option<String> {
    let folder = rfd::FileDialog::new().pick_folder()?;
    Some(folder.to_string_lossy().to_string())
}

#[tauri::command]
fn resolve_folder_path(path: String) -> Option<String> {
    let p = std::path::Path::new(&path);
    if p.is_dir() {
        Some(p.to_string_lossy().to_string())
    } else if p.is_file() {
        p.parent().map(|parent| parent.to_string_lossy().to_string())
    } else {
        Some(path)
    }
}

#[tauri::command]
async fn process_images(
    app: tauri::AppHandle,
    input: Vec<String>,
    mode: BatchMode,
    root: Option<String>,
    options: ProcessOptions,
) -> Result<ProcessSummary, String> {
    let input_paths: Vec<PathBuf> = input.into_iter().map(PathBuf::from).collect();
    let root_path: Option<PathBuf> = root.map(PathBuf::from);

    tauri::async_runtime::spawn_blocking(move || {
        let app_handle = app.clone();
        processor::process_batch(
            input_paths,
            mode,
            root_path,
            options,
            Some(move |update: processor::ProgressUpdate| {
                let _ = app_handle.emit("process-progress", &update);
                let _ = app_handle.emit_to("main", "process-progress", &update);
            }),
        )
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
async fn copy_named_folders(
    app: tauri::AppHandle,
    names: Vec<String>,
    source: String,
    destination: String,
) -> Result<ProcessSummary, String> {
    let src = PathBuf::from(source);
    let dst = PathBuf::from(&destination);

    tauri::async_runtime::spawn_blocking(move || {
        let app_handle = app.clone();
        let lines = processor::copy_named_folders(
            &names,
            &src,
            &dst,
            Some(move |update: processor::ProgressUpdate| {
                let _ = app_handle.emit("process-progress", &update);
                let _ = app_handle.emit_to("main", "process-progress", &update);
            }),
        );
        let completed = lines.iter().filter(|l| l.starts_with("Copied:")).count();
        ProcessSummary {
            failed: lines.len().saturating_sub(completed),
            completed,
            lines,
            items: Vec::new(),
            output_dir: Some(destination),
        }
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
fn stop_process() {
    processor::request_stop();
}

#[tauri::command]
fn open_folder(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("explorer")
            .arg(&path)
            .spawn()
            .map_err(|e| e.to_string())?;
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    {
        tauri_plugin_opener::open_url(&path, None::<&str>).map_err(|e| e.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            pick_files,
            pick_folder,
            resolve_folder_path,
            process_images,
            copy_named_folders,
            stop_process,
            open_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
