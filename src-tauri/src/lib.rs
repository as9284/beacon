mod commands;

use commands::{
    chat::{list_gemini_models, stream_chat},
    keychain::{delete_api_key, get_api_key, save_api_key},
    project::{fetch_github_repo, index_local_project, pick_project_folder, read_file_content},
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            save_api_key,
            get_api_key,
            delete_api_key,
            list_gemini_models,
            stream_chat,
            pick_project_folder,
            index_local_project,
            read_file_content,
            fetch_github_repo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Beacon");
}
