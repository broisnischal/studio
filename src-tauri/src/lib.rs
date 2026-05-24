mod commands;
mod db;
mod mcp;

use db::{ActiveConnection, DbState};
use mcp::McpState;
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Create the shared connection Arc — both DbState and McpState point to the same lock.
    let db_conn: Arc<Mutex<Option<ActiveConnection>>> = Arc::new(Mutex::new(None));
    let db_state = DbState { conn: Arc::clone(&db_conn) };
    let mcp_state = McpState::new(db_conn);

    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(db_state)
        .manage(mcp_state)
        .setup(|app| {
            // Load or generate a stable MCP token from the app data directory.
            app.state::<McpState>().init_token(app.handle());

            let window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("/".into()),
            )
            .title("DB Studio")
            .inner_size(1280.0, 800.0)
            .min_inner_size(960.0, 600.0)
            .resizable(true)
            .maximized(true)
            .decorations(false)
            .on_navigation(|url| {
                let scheme = url.scheme();
                if matches!(scheme, "tauri" | "ipc") {
                    return true;
                }
                let host = url.host_str().unwrap_or("");
                host == "localhost" || host == "tauri.localhost" || host == "127.0.0.1"
            })
            .build()?;

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            // Suppress unused-variable warning in release builds
            let _ = &window;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_file,
            commands::restart_app,
            commands::toggle_devtools,
            commands::test_postgres_connection,
            commands::connect_postgres,
            commands::disconnect_postgres,
            commands::test_sqlite,
            commands::connect_sqlite_db,
            commands::test_d1,
            commands::connect_d1_db,
            commands::pg_list_schemas,
            commands::pg_list_tables,
            commands::pg_list_indexes,
            commands::pg_get_table_rows,
            commands::pg_execute_sql,
            commands::pg_update_table_cell,
            commands::pg_delete_table_row,
            commands::pg_delete_table_rows,
            commands::pg_insert_table_row,
            mcp::mcp_start,
            mcp::mcp_stop,
            mcp::mcp_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
