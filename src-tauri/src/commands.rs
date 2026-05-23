/// Restart the application — called after an update is installed.
#[tauri::command]
pub fn restart_app(app: tauri::AppHandle) {
    app.restart();
}

/// Toggle the WebView developer tools. Only functional in debug builds;
/// in release builds this is a no-op so the command stays safe to expose.
#[tauri::command]
pub fn toggle_devtools(window: tauri::WebviewWindow) {
    #[cfg(debug_assertions)]
    {
        if window.is_devtools_open() {
            window.close_devtools();
        } else {
            window.open_devtools();
        }
    }
    #[cfg(not(debug_assertions))]
    let _ = window;
}

use crate::db::{
    connect, connect_d1, connect_sqlite, disconnect,
    delete_table_row, delete_table_rows, execute_sql, get_table_rows,
    list_schemas, list_tables, test_connection, test_d1_connection, test_sqlite_connection,
    update_table_cell, ConnectionConfig, D1Config, DbState, SqlResult, SqliteConfig, TableInfo,
    TableRows,
};
use serde_json::Value;
use std::collections::HashMap;
use tauri::State;

// ── PostgreSQL ────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_postgres_connection(config: ConnectionConfig) -> Result<(), String> {
    test_connection(config).await
}

#[tauri::command]
pub async fn connect_postgres(
    state: State<'_, DbState>,
    config: ConnectionConfig,
) -> Result<(), String> {
    connect(state, config).await
}

// ── SQLite ────────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_sqlite(config: SqliteConfig) -> Result<(), String> {
    test_sqlite_connection(config).await
}

#[tauri::command]
pub async fn connect_sqlite_db(
    state: State<'_, DbState>,
    config: SqliteConfig,
) -> Result<(), String> {
    connect_sqlite(state, config).await
}

// ── Cloudflare D1 ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn test_d1(config: D1Config) -> Result<(), String> {
    test_d1_connection(config).await
}

#[tauri::command]
pub async fn connect_d1_db(
    state: State<'_, DbState>,
    config: D1Config,
) -> Result<(), String> {
    connect_d1(state, config).await
}

// ── Shared disconnect ────────────────────────────────────────────────────────

#[tauri::command]
pub async fn disconnect_postgres(state: State<'_, DbState>) -> Result<(), String> {
    disconnect(state).await
}

// ── DB-agnostic query commands ────────────────────────────────────────────────

#[tauri::command]
pub async fn pg_list_schemas(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    list_schemas(state).await
}

#[tauri::command]
pub async fn pg_list_tables(
    state: State<'_, DbState>,
    schema: String,
) -> Result<Vec<TableInfo>, String> {
    list_tables(state, schema).await
}

#[tauri::command]
pub async fn pg_get_table_rows(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    limit: i64,
    offset: i64,
    search: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    filters: Option<Vec<crate::db::RowFilter>>,
) -> Result<TableRows, String> {
    get_table_rows(
        state,
        schema,
        table,
        limit,
        offset,
        search,
        sort_column,
        sort_direction,
        filters,
    )
    .await
}

#[tauri::command]
pub async fn pg_execute_sql(state: State<'_, DbState>, sql: String) -> Result<SqlResult, String> {
    execute_sql(state, sql).await
}

#[tauri::command]
pub async fn pg_update_table_cell(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_key: HashMap<String, Value>,
    column: String,
    value: Value,
) -> Result<(), String> {
    update_table_cell(state, schema, table, primary_key, column, value).await
}

#[tauri::command]
pub async fn pg_delete_table_row(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_key: HashMap<String, Value>,
) -> Result<(), String> {
    delete_table_row(state, schema, table, primary_key).await
}

#[tauri::command]
pub async fn pg_delete_table_rows(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_keys: Vec<HashMap<String, Value>>,
) -> Result<u64, String> {
    delete_table_rows(state, schema, table, primary_keys).await
}
