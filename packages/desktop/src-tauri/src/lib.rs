// packages/desktop/src-tauri/src/lib.rs
// Basalt desktop entry. Tauri 2 with the system WebView. Custom commands
// expose vault picking + walking + Ollama status to the React frontend.

use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;
use walkdir::WalkDir;

#[derive(Serialize)]
struct VaultEntry {
    path: String,
    mtime_ms: i64,
}

#[tauri::command]
fn walk_vault(root: String) -> Result<Vec<VaultEntry>, String> {
    let path = PathBuf::from(&root);
    if !path.is_dir() {
        return Err(format!("not a directory: {}", root));
    }
    let mut out = Vec::new();
    let skip: &[&str] = &[
        ".git",
        ".obsidian",
        ".stversions",
        ".stfolder",
        ".trash",
        "node_modules",
        ".claude",
        ".basalt",
    ];
    for entry in WalkDir::new(&path)
        .into_iter()
        .filter_entry(|e| {
            !e.file_name()
                .to_str()
                .map(|n| skip.contains(&n))
                .unwrap_or(false)
        })
        .flatten()
    {
        if !entry.file_type().is_file() {
            continue;
        }
        let p = entry.path();
        if p.extension().and_then(|e| e.to_str()) != Some("md") {
            continue;
        }
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let mtime_ms = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);
        out.push(VaultEntry {
            path: p.to_string_lossy().replace('\\', "/"),
            mtime_ms,
        });
    }
    out.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(out)
}

// Ollama status probing happens via the frontend's window.fetch() — keeps
// our Rust crate dependency-light and avoids bundling reqwest. The
// frontend hits ${ollama_url}/api/tags directly.

#[tauri::command]
fn open_external(url: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;
    app.shell()
        .open(&url, None)
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![walk_vault, open_external])
        .setup(|app| {
            // Center the main window on first run.
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.center();
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
