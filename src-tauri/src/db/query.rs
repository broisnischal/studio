use super::connection::{require_pool, DbState};
use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{Column, Decode, Postgres, Row, TypeInfo, ValueRef};
use std::collections::HashMap;
use tauri::State;
use uuid::Uuid;

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
    pub primary_key: Vec<String>,
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

    macro_rules! try_get_string {
        ($t:ty) => {
            if let Ok(v) = row.try_get::<Option<$t>, _>(idx) {
                return match v {
                    Some(x) => json!(x.to_string()),
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
    try_get_string!(Decimal);
    try_get_string!(DateTime<Utc>);
    try_get_string!(NaiveDateTime);
    try_get_string!(NaiveDate);
    try_get_string!(NaiveTime);
    try_get_string!(Uuid);
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

    // PostgreSQL enums and other text-compatible custom types (wire format is UTF-8).
    if let Ok(raw) = row.try_get_raw(idx) {
        if raw.is_null() {
            return Value::Null;
        }
        if let Ok(text) = <String as Decode<Postgres>>::decode(raw) {
            return json!(text);
        }
    }

    Value::String(format!("<{type_name}>"))
}

async fn fetch_primary_key(
    pool: &sqlx::PgPool,
    schema: &str,
    table: &str,
) -> Result<Vec<String>, String> {
    let rows = sqlx::query(
        r#"
        SELECT kcu.column_name::text
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
         AND tc.table_schema = kcu.table_schema
         AND tc.table_name = kcu.table_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
          AND tc.table_schema = $1
          AND tc.table_name = $2
        ORDER BY kcu.ordinal_position
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to load primary key: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect())
}

fn normalize_pg_type(data_type: &str) -> String {
    data_type
        .to_lowercase()
        .split('(')
        .next()
        .unwrap_or(data_type)
        .trim()
        .to_string()
}

fn validate_typed_value(data_type: &str, value: &Value) -> Result<(), String> {
    let t = normalize_pg_type(data_type);

    match value {
        Value::Null => return Ok(()),
        Value::Bool(_) if t == "boolean" => return Ok(()),
        Value::Number(n) if t.contains("int") || t == "serial" || t.ends_with("serial") => {
            if !n.is_i64() && !n.is_u64() {
                return Err(format!("Invalid integer for {data_type}"));
            }
            Ok(())
        }
        Value::Number(_) if t.contains("numeric") || t.contains("decimal") || t.contains("real") || t.contains("double") || t == "money" => Ok(()),
        Value::String(s) if t.contains("int") || t == "serial" || t.ends_with("serial") => {
            if s.parse::<i64>().is_err() {
                Err(format!("Invalid integer for {data_type}: \"{s}\""))
            } else {
                Ok(())
            }
        }
        Value::String(_) => Ok(()),
        Value::Object(_) | Value::Array(_) if t == "json" || t == "jsonb" => Ok(()),
        Value::Object(_) | Value::Array(_) => Err(format!("Expected scalar for {data_type}")),
        _ => Ok(()),
    }
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

    let primary_key = fetch_primary_key(&pool, &schema, &table).await?;

    Ok(TableRows {
        columns,
        rows: data,
        total,
        query_ms: started.elapsed().as_millis() as u64,
        primary_key,
    })
}

pub async fn update_table_cell(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_key: HashMap<String, Value>,
    column: String,
    value: Value,
) -> Result<(), String> {
    let pool = require_pool(&state)?;

    if primary_key.is_empty() {
        return Err("Cannot update row: table has no primary key".into());
    }

    let pk_columns = fetch_primary_key(&pool, &schema, &table).await?;
    if pk_columns.is_empty() {
        return Err("Cannot update row: table has no primary key".into());
    }

    for pk_col in &pk_columns {
        if !primary_key.contains_key(pk_col) {
            return Err(format!("Missing primary key column: {pk_col}"));
        }
    }

    let meta_rows = sqlx::query(
        r#"
        SELECT column_name::text, data_type::text
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        "#,
    ) 
    .bind(&schema)
    .bind(&table)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to load column metadata: {e}"))?;

    let mut column_types: HashMap<String, String> = HashMap::new();
    for row in &meta_rows {
        if let (Ok(name), Ok(dt)) = (
            row.try_get::<String, _>(0),
            row.try_get::<String, _>(1),
        ) {
            column_types.insert(name, dt);
        }
    }

    let data_type = column_types
        .get(&column)
        .ok_or_else(|| format!("Unknown column: {column}"))?;

    if normalize_pg_type(data_type).contains("bytea") {
        return Err("Cannot edit bytea columns".into());
    }

    validate_typed_value(data_type, &value)?;

    let mut where_parts = Vec::new();
    let mut bind_idx = 2_u32;

    for pk_col in &pk_columns {
        where_parts.push(format!(r#""{pk_col}" = ${bind_idx}"#));
        bind_idx += 1;
    }

    let sql = format!(
        r#"UPDATE "{schema}"."{table}" SET "{column}" = $1 WHERE {}"#,
        where_parts.join(" AND ")
    );

    let mut q = sqlx::query(&sql);
    q = bind_typed_value(q, data_type, &value)?;
    for pk_col in &pk_columns {
        let pk_val = primary_key
            .get(pk_col)
            .ok_or_else(|| format!("Missing primary key: {pk_col}"))?;
        let pk_type = column_types
            .get(pk_col)
            .ok_or_else(|| format!("Missing PK metadata: {pk_col}"))?;
        q = bind_typed_value(q, pk_type, pk_val)?;
    }

    q.execute(&pool)
        .await
        .map_err(|e| format!("Update failed: {e}"))?;

    Ok(())
}

pub async fn delete_table_row(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_key: HashMap<String, Value>,
) -> Result<(), String> {
    let deleted = delete_table_rows(state, schema, table, vec![primary_key]).await?;
    if deleted == 0 {
        return Err("No row deleted (row may have changed)".into());
    }
    Ok(())
}

pub async fn delete_table_rows(
    state: State<'_, DbState>,
    schema: String,
    table: String,
    primary_keys: Vec<HashMap<String, Value>>,
) -> Result<u64, String> {
    let pool = require_pool(&state)?;

    if primary_keys.is_empty() {
        return Ok(0);
    }

    let pk_columns = fetch_primary_key(&pool, &schema, &table).await?;
    if pk_columns.is_empty() {
        return Err("Cannot delete rows: table has no primary key".into());
    }

    for (i, primary_key) in primary_keys.iter().enumerate() {
        if primary_key.is_empty() {
            return Err(format!("Row {i} has empty primary key"));
        }
        for pk_col in &pk_columns {
            if !primary_key.contains_key(pk_col) {
                return Err(format!("Row {i} is missing primary key column: {pk_col}"));
            }
        }
    }

    let meta_rows = sqlx::query(
        r#"
        SELECT column_name::text, data_type::text
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        "#,
    )
    .bind(&schema)
    .bind(&table)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to load column metadata: {e}"))?;

    let mut column_types: HashMap<String, String> = HashMap::new();
    for row in &meta_rows {
        if let (Ok(name), Ok(dt)) = (
            row.try_get::<String, _>(0),
            row.try_get::<String, _>(1),
        ) {
            column_types.insert(name, dt);
        }
    }

    let sql = if pk_columns.len() == 1 {
        let pk_col = &pk_columns[0];
        let placeholders: Vec<String> = (1..=primary_keys.len()).map(|i| format!("${i}")).collect();
        format!(
            r#"DELETE FROM "{schema}"."{table}" WHERE "{pk_col}" IN ({})"#,
            placeholders.join(", ")
        )
    } else {
        let quoted_cols: Vec<String> = pk_columns
            .iter()
            .map(|c| format!(r#""{c}""#))
            .collect();
        let value_rows: Vec<String> = primary_keys
            .iter()
            .enumerate()
            .map(|(row_i, _)| {
                let start = row_i * pk_columns.len() + 1;
                let placeholders: Vec<String> = (0..pk_columns.len())
                    .map(|j| format!("${}", start + j))
                    .collect();
                format!("({})", placeholders.join(", "))
            })
            .collect();
        let match_cols: Vec<String> = pk_columns
            .iter()
            .map(|c| format!(r#"t."{c}" = v."{c}""#))
            .collect();
        format!(
            r#"DELETE FROM "{schema}"."{table}" AS t
USING (VALUES {value_rows}) AS v({quoted_cols})
WHERE {match_cols}"#,
            value_rows = value_rows.join(", "),
            quoted_cols = quoted_cols.join(", "),
            match_cols = match_cols.join(" AND ")
        )
    };

    let mut q = sqlx::query(&sql);
    if pk_columns.len() == 1 {
        let pk_col = &pk_columns[0];
        let pk_type = column_types
            .get(pk_col)
            .ok_or_else(|| format!("Missing PK metadata: {pk_col}"))?;
        for primary_key in &primary_keys {
            let pk_val = primary_key
                .get(pk_col)
                .ok_or_else(|| format!("Missing primary key: {pk_col}"))?;
            q = bind_typed_value(q, pk_type, pk_val)?;
        }
    } else {
        for primary_key in &primary_keys {
            for pk_col in &pk_columns {
                let pk_val = primary_key
                    .get(pk_col)
                    .ok_or_else(|| format!("Missing primary key: {pk_col}"))?;
                let pk_type = column_types
                    .get(pk_col)
                    .ok_or_else(|| format!("Missing PK metadata: {pk_col}"))?;
                q = bind_typed_value(q, pk_type, pk_val)?;
            }
        }
    }

    let result = q
        .execute(&pool)
        .await
        .map_err(|e| format!("Delete failed: {e}"))?;

    Ok(result.rows_affected())
}

fn bind_typed_value<'a>(
    q: sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments>,
    data_type: &str,
    value: &Value,
) -> Result<sqlx::query::Query<'a, sqlx::Postgres, sqlx::postgres::PgArguments>, String> {
    let t = normalize_pg_type(data_type);

    if value.is_null() {
        return Ok(q.bind(None::<String>));
    }

    match value {
        Value::Bool(b) => Ok(q.bind(*b)),
        Value::Number(n) if n.is_i64() => Ok(q.bind(n.as_i64().unwrap())),
        Value::Number(n) if n.is_u64() => Ok(q.bind(n.as_u64().unwrap() as i64)),
        Value::Number(n) if n.is_f64() => Ok(q.bind(n.as_f64().unwrap())),
        Value::String(s) if t.contains("int") || t == "serial" || t.ends_with("serial") => {
            let parsed = s
                .parse::<i64>()
                .map_err(|_| format!("Invalid integer: {s}"))?;
            Ok(q.bind(parsed))
        }
        Value::String(s) if t.contains("numeric") || t.contains("decimal") || t.contains("real") || t.contains("double") => {
            Ok(q.bind(s.clone()))
        }
        Value::String(s) => Ok(q.bind(s.clone())),
        Value::Object(_) | Value::Array(_) if t == "json" || t == "jsonb" => {
            let json_str =
                serde_json::to_string(value).map_err(|e| format!("Invalid JSON value: {e}"))?;
            Ok(q.bind(json_str))
        }
        Value::Number(n) => Ok(q.bind(
            n.as_f64()
                .or_else(|| n.as_i64().map(|v| v as f64))
                .ok_or_else(|| "Invalid number".to_string())?,
        )),
        _ => Err(format!("Unsupported value for {data_type}")),
    }
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
