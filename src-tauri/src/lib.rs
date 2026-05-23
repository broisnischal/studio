mod commands;
mod db;

use db::DbState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_opener::init())
        .manage(DbState::default())
        .setup(|app| {
            let window = tauri::WebviewWindowBuilder::new(
                app,
                "main",
                tauri::WebviewUrl::App("/".into()),
            )
            .title("DB Studio")
            .inner_size(1280.0, 800.0)
            .min_inner_size(960.0, 600.0)
            .resizable(true)
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
            commands::pg_get_table_rows,
            commands::pg_execute_sql,
            commands::pg_update_table_cell,
            commands::pg_delete_table_row,
            commands::pg_delete_table_rows,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
