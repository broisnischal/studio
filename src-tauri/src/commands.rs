use crate::db::{
    connect, disconnect, execute_sql, get_table_rows, list_schemas, list_tables, test_connection,
    update_table_cell, ConnectionConfig, SqlResult, TableInfo, TableRows,
};
use serde_json::Value;
use std::collections::HashMap;
use crate::db::DbState;
use tauri::State;

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

#[tauri::command]
pub async fn disconnect_postgres(state: State<'_, DbState>) -> Result<(), String> {
    disconnect(state).await
}

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
) -> Result<TableRows, String> {
    get_table_rows(state, schema, table, limit, offset).await
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
