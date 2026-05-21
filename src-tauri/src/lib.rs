mod commands;
mod db;

use db::DbState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(DbState::default())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::test_postgres_connection,
            commands::connect_postgres,
            commands::disconnect_postgres,
            commands::pg_list_schemas,
            commands::pg_list_tables,
            commands::pg_get_table_rows,
            commands::pg_execute_sql,
            commands::pg_update_table_cell,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
