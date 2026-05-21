use super::connection::{require_pool, DbState};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{Column, Row, TypeInfo};
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ColumnInfo {
    pub name: String,
    pub data_type: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableRows {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<Value>>,
    pub total: i64,
    pub query_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlResult {
    pub columns: Vec<ColumnInfo>,
    pub rows: Vec<Vec<Value>>,
    pub row_count: Option<i64>,
    pub message: Option<String>,
    pub query_ms: u64,
}

fn pg_type_label(type_name: &str) -> String {
    let name = type_name;
    match name {
        "VARCHAR" | "CHAR" | "BPCHAR" => {
            format!("{}(...)", name.to_lowercase())
        }
        _ => name.to_lowercase(),
    }
}

fn cell_to_json(row: &sqlx::postgres::PgRow, idx: usize) -> Value {
    let col = row.column(idx);
    let type_name = col.type_info().name();

    macro_rules! try_get {
        ($t:ty) => {
            if let Ok(v) = row.try_get::<Option<$t>, _>(idx) {
                return match v {
                    Some(x) => json!(x),
                    None => Value::Null,
                };
            }
        };
    }

    try_get!(bool);
    try_get!(i16);
    try_get!(i32);
    try_get!(i64);
    try_get!(f32);
    try_get!(f64);
    try_get!(String);

    if type_name == "JSON" || type_name == "JSONB" {
        if let Ok(v) = row.try_get::<Option<serde_json::Value>, _>(idx) {
            return v.unwrap_or(Value::Null);
        }
    }

    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return match v {
            Some(bytes) => json!(format!("[{} bytes]", bytes.len())),
            None => Value::Null,
        };
    }

    Value::String(format!("<{type_name}>"))
}

pub async fn get_table_rows(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    limit: i64,
    offset: i64,
) -> Result<TableRows, String> {
    let pool = require_pool(&state)?;
    let started = std::time::Instant::now();

    let count_sql = format!(
        r#"SELECT COUNT(*)::bigint FROM "{schema}"."{table}""#
    );
    let total: i64 = sqlx::query_scalar(&count_sql)
        .fetch_one(&pool)
        .await
        .map_err(|e| format!("Failed to count rows: {e}"))?;

    let data_sql = format!(
        r#"SELECT * FROM "{schema}"."{table}" LIMIT $1 OFFSET $2"#
    );
    let rows = sqlx::query(&data_sql)
        .bind(limit)
        .bind(offset)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to fetch rows: {e}"))?;

    let columns = if let Some(first) = rows.first() {
        first
            .columns()
            .iter()
            .map(|c| ColumnInfo {
                name: c.name().to_string(),
                data_type: pg_type_label(c.type_info().name()),
            })
            .collect()
    } else {
        let meta = sqlx::query(&format!(
            r#"
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = $1 AND table_name = $2
            ORDER BY ordinal_position
            "#
        ))
        .bind(&schema)
        .bind(&table)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to load columns: {e}"))?;

        meta.iter()
            .filter_map(|r| {
                Some(ColumnInfo {
                    name: r.try_get(0).ok()?,
                    data_type: r.try_get::<String, _>(1).ok()?.to_lowercase(),
                })
            })
            .collect()
    };

    let data: Vec<Vec<Value>> = rows
        .iter()
        .map(|row| (0..row.len()).map(|i| cell_to_json(row, i)).collect())
        .collect();

    Ok(TableRows {
        columns,
        rows: data,
        total,
        query_ms: started.elapsed().as_millis() as u64,
    })
}

fn is_row_returning_sql(sql: &str) -> bool {
    let head = sql
        .trim_start()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();
    matches!(
        head.as_str(),
        "select" | "with" | "show" | "explain" | "values" | "table"
    )
}

pub async fn execute_sql(state: State<'_, DbState>, sql: String) -> Result<SqlResult, String> {
    let pool = require_pool(&state)?;
    let sql = sql.trim();
    if sql.is_empty() {
        return Err("Query is empty".into());
    }

    let started = std::time::Instant::now();
    let query_ms = || started.elapsed().as_millis() as u64;

    if is_row_returning_sql(sql) {
        let rows = sqlx::query(sql)
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Query failed: {e}"))?;

        let columns = if let Some(first) = rows.first() {
            first
                .columns()
                .iter()
                .map(|c| ColumnInfo {
                    name: c.name().to_string(),
                    data_type: pg_type_label(c.type_info().name()),
                })
                .collect()
        } else {
            vec![]
        };

        let data: Vec<Vec<Value>> = rows
            .iter()
            .map(|row| (0..row.len()).map(|i| cell_to_json(row, i)).collect())
            .collect();

        let row_count = data.len() as i64;
        return Ok(SqlResult {
            columns,
            rows: data,
            row_count: Some(row_count),
            message: None,
            query_ms: query_ms(),
        });
    }

    let result = sqlx::query(sql)
        .execute(&pool)
        .await
        .map_err(|e| format!("Statement failed: {e}"))?;

    let affected = result.rows_affected() as i64;
    Ok(SqlResult {
        columns: vec![],
        rows: vec![],
        row_count: Some(affected),
        message: Some(format!("{affected} row(s) affected")),
        query_ms: query_ms(),
    })
}
