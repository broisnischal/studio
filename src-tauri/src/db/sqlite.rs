use super::query::{ColumnInfo, ForeignKeyInfo, SqlResult, TableRows};
use serde_json::{json, Value};
use sqlx::{Column, Row, SqlitePool, TypeInfo};
use std::time::Instant;

// ── Cell conversion ───────────────────────────────────────────────────────────

pub fn cell_to_json(row: &sqlx::sqlite::SqliteRow, idx: usize) -> Value {
    // Try types in order matching SQLite's type affinity rules
    if let Ok(v) = row.try_get::<Option<i64>, _>(idx) {
        return v.map(|n| json!(n)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<f64>, _>(idx) {
        return v.map(|n| json!(n)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<String>, _>(idx) {
        return v.map(|s| json!(s)).unwrap_or(Value::Null);
    }
    if let Ok(v) = row.try_get::<Option<Vec<u8>>, _>(idx) {
        return v
            .map(|b| Value::String(b.iter().map(|x| format!("{x:02x}")).collect()))
            .unwrap_or(Value::Null);
    }
    Value::Null
}

#[allow(dead_code)]
fn col_type(row: &sqlx::sqlite::SqliteRow, idx: usize) -> String {
    row.column(idx).type_info().name().to_lowercase()
}

// ── Primary-key helpers ───────────────────────────────────────────────────────

/// Returns PK column names in key-sequence order using PRAGMA table_info.
pub async fn fetch_primary_key(pool: &SqlitePool, table: &str) -> Result<Vec<String>, String> {
    let sql = format!("PRAGMA table_info(\"{}\")", table.replace('"', "\"\""));
    let rows = sqlx::query(&sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("PRAGMA table_info failed: {e}"))?;

    let mut pk: Vec<(i64, String)> = rows
        .iter()
        .filter_map(|r| {
            let pk_pos: i64 = r.try_get::<Option<i64>, _>(5).ok().flatten().unwrap_or(0);
            if pk_pos == 0 {
                return None;
            }
            let name: String = r.try_get::<Option<String>, _>(1).ok().flatten()?;
            Some((pk_pos, name))
        })
        .collect();

    pk.sort_by_key(|(pos, _)| *pos);
    Ok(pk.into_iter().map(|(_, n)| n).collect())
}

/// Returns FK info using PRAGMA foreign_key_list.
pub async fn fetch_foreign_keys(pool: &SqlitePool, table: &str) -> Result<Vec<ForeignKeyInfo>, String> {
    let sql = format!("PRAGMA foreign_key_list(\"{}\")", table.replace('"', "\"\""));
    let rows = sqlx::query(&sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("PRAGMA foreign_key_list failed: {e}"))?;

    // Group by FK id (first column)
    let mut map: std::collections::BTreeMap<i64, ForeignKeyInfo> = Default::default();
    for r in &rows {
        let id: i64 = r.try_get::<Option<i64>, _>(0).ok().flatten().unwrap_or(0);
        let ref_table: String = r.try_get::<Option<String>, _>(2).ok().flatten().unwrap_or_default();
        let from_col: String = r.try_get::<Option<String>, _>(3).ok().flatten().unwrap_or_default();
        let to_col: String = r.try_get::<Option<String>, _>(4).ok().flatten().unwrap_or_default();

        let entry = map.entry(id).or_insert(ForeignKeyInfo {
            columns: vec![],
            referenced_schema: "main".to_string(),
            referenced_table: ref_table,
            referenced_columns: vec![],
        });
        entry.columns.push(from_col);
        entry.referenced_columns.push(to_col);
    }
    Ok(map.into_values().collect())
}

// ── execute_sql ───────────────────────────────────────────────────────────────

pub async fn execute_sql(pool: &SqlitePool, sql: &str) -> Result<SqlResult, String> {
    let t0 = Instant::now();
    let sql = sql.trim();

    let head = sql
        .split_whitespace()
        .next()
        .unwrap_or("")
        .to_ascii_lowercase();

    if matches!(head.as_str(), "select" | "with" | "pragma" | "explain" | "values") {
        let rows = sqlx::query(sql)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("{e}"))?;

        let columns: Vec<ColumnInfo> = rows
            .first()
            .map(|r| {
                r.columns()
                    .iter()
                    .map(|c| ColumnInfo {
                        name: c.name().to_string(),
                        data_type: c.type_info().name().to_lowercase(),
                    })
                    .collect()
            })
            .unwrap_or_default();

        let data: Vec<Vec<Value>> = rows
            .iter()
            .map(|r| (0..columns.len()).map(|i| cell_to_json(r, i)).collect())
            .collect();

        let n = data.len() as i64;
        Ok(SqlResult {
            columns,
            rows: data,
            row_count: Some(n),
            message: None,
            query_ms: t0.elapsed().as_millis() as u64,
        })
    } else {
        let res = sqlx::query(sql)
            .execute(pool)
            .await
            .map_err(|e| format!("{e}"))?;

        let affected = res.rows_affected() as i64;
        Ok(SqlResult {
            columns: vec![],
            rows: vec![],
            row_count: Some(affected),
            message: Some(format!("{affected} row(s) affected")),
            query_ms: t0.elapsed().as_millis() as u64,
        })
    }
}

// ── get_table_rows ────────────────────────────────────────────────────────────

pub async fn get_table_rows(
    pool: &SqlitePool,
    table: &str,
    limit: i64,
    offset: i64,
    search: Option<String>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    filters: Option<Vec<crate::db::RowFilter>>,
) -> Result<TableRows, String> {
    let t0 = Instant::now();
    let tq = format!("\"{}\"", table.replace('"', "\"\""));

    // Column info from PRAGMA
    let pragma_sql = format!("PRAGMA table_info({tq})");
    let pragma_rows = sqlx::query(&pragma_sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("PRAGMA table_info: {e}"))?;

    let col_names: Vec<String> = pragma_rows
        .iter()
        .filter_map(|r| r.try_get::<Option<String>, _>(1).ok().flatten())
        .collect();

    // Build WHERE clause (using ? placeholders)
    let mut conditions: Vec<String> = vec![];
    let mut binds: Vec<String> = vec![];

    if let Some(ref s) = search {
        if !s.is_empty() && !col_names.is_empty() {
            let parts: Vec<String> = col_names
                .iter()
                .map(|c| format!("LOWER(CAST(\"{}\" AS TEXT)) LIKE LOWER(?)", c.replace('"', "\"\"")))
                .collect();
            conditions.push(format!("({})", parts.join(" OR ")));
            let pattern = format!("%{s}%");
            for _ in &col_names {
                binds.push(pattern.clone());
            }
        }
    }

    if let Some(ref fs) = filters {
        for f in fs {
            let qcol = format!("\"{}\"", f.column.replace('"', "\"\""));
            match f.op.as_str() {
                "is_null" => conditions.push(format!("{qcol} IS NULL")),
                "is_not_null" => conditions.push(format!("{qcol} IS NOT NULL")),
                _ => {
                    if let Some(ref v) = f.value {
                        let (cond, extra_binds) = build_filter_condition(&qcol, &f.op, v);
                        conditions.push(cond);
                        binds.extend(extra_binds);
                    }
                }
            }
        }
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    // ORDER BY
    let order_clause = if let Some(col) = sort_column {
        let dir = sort_direction.as_deref().unwrap_or("asc").to_ascii_uppercase();
        let dir = if dir == "DESC" { "DESC" } else { "ASC" };
        format!("ORDER BY \"{}\" {dir}", col.replace('"', "\"\""))
    } else {
        String::new()
    };

    // COUNT
    let count_sql = format!("SELECT COUNT(*) FROM {tq} {where_clause}");
    let mut count_q = sqlx::query(&count_sql);
    for b in &binds {
        count_q = count_q.bind(b.clone());
    }
    let count_row = count_q
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Count failed: {e}"))?;
    let total: i64 = count_row.try_get::<Option<i64>, _>(0).ok().flatten().unwrap_or(0);

    // ROWS
    let rows_sql = format!("SELECT * FROM {tq} {where_clause} {order_clause} LIMIT ? OFFSET ?");
    let mut rows_q = sqlx::query(&rows_sql);
    for b in &binds {
        rows_q = rows_q.bind(b.clone());
    }
    rows_q = rows_q.bind(limit).bind(offset);

    let fetched = rows_q
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;

    let columns: Vec<ColumnInfo> = fetched
        .first()
        .map(|r| {
            r.columns()
                .iter()
                .map(|c| ColumnInfo {
                    name: c.name().to_string(),
                    data_type: c.type_info().name().to_lowercase(),
                })
                .collect()
        })
        .unwrap_or_else(|| {
            col_names
                .iter()
                .map(|n| ColumnInfo { name: n.clone(), data_type: "text".to_string() })
                .collect()
        });

    let rows: Vec<Vec<Value>> = fetched
        .iter()
        .map(|r| (0..columns.len()).map(|i| cell_to_json(r, i)).collect())
        .collect();

    let primary_key = fetch_primary_key(pool, table).await.unwrap_or_default();
    let foreign_keys = fetch_foreign_keys(pool, table).await.unwrap_or_default();

    Ok(TableRows {
        columns,
        rows,
        total,
        query_ms: t0.elapsed().as_millis() as u64,
        primary_key,
        foreign_keys,
    })
}

/// Same logic as build_filter_condition but returns JSON Values for D1 HTTP params.
pub fn build_d1_filter(qcol: &str, op: &str, val: &str) -> (String, Vec<serde_json::Value>) {
    let (cond, binds) = build_filter_condition(qcol, op, val);
    (cond, binds.into_iter().map(serde_json::Value::String).collect())
}

fn build_filter_condition(qcol: &str, op: &str, val: &str) -> (String, Vec<String>) {
    match op {
        "eq" => (format!("{qcol} = ?"), vec![val.to_string()]),
        "neq" => (format!("{qcol} != ?"), vec![val.to_string()]),
        "gt" => (format!("{qcol} > ?"), vec![val.to_string()]),
        "gte" => (format!("{qcol} >= ?"), vec![val.to_string()]),
        "lt" => (format!("{qcol} < ?"), vec![val.to_string()]),
        "lte" => (format!("{qcol} <= ?"), vec![val.to_string()]),
        "contains" => (format!("LOWER(CAST({qcol} AS TEXT)) LIKE LOWER(?)"), vec![format!("%{val}%")]),
        "not_contains" => (format!("LOWER(CAST({qcol} AS TEXT)) NOT LIKE LOWER(?)"), vec![format!("%{val}%")]),
        "starts_with" => (format!("LOWER(CAST({qcol} AS TEXT)) LIKE LOWER(?)"), vec![format!("{val}%")]),
        "ends_with" => (format!("LOWER(CAST({qcol} AS TEXT)) LIKE LOWER(?)"), vec![format!("%{val}")]),
        _ => (format!("{qcol} = ?"), vec![val.to_string()]),
    }
}

// ── update_table_cell ─────────────────────────────────────────────────────────

pub async fn update_table_cell(
    pool: &SqlitePool,
    table: &str,
    primary_key: std::collections::HashMap<String, Value>,
    column: &str,
    value: &Value,
) -> Result<(), String> {
    let pk_columns = fetch_primary_key(pool, table).await?;
    if pk_columns.is_empty() {
        return Err("Cannot update row: table has no primary key".into());
    }

    let tq = format!("\"{}\"", table.replace('"', "\"\""));
    let set_col = format!("\"{}\"", column.replace('"', "\"\""));

    let where_parts: Vec<String> = pk_columns
        .iter()
        .map(|c| format!("\"{}\" = ?", c.replace('"', "\"\"")))
        .collect();

    let sql = format!("UPDATE {tq} SET {set_col} = ? WHERE {}", where_parts.join(" AND "));
    let mut q = sqlx::query(&sql);
    q = bind_value(q, value);
    for pk_col in &pk_columns {
        let v = primary_key.get(pk_col).ok_or_else(|| format!("Missing PK: {pk_col}"))?;
        q = bind_value(q, v);
    }

    q.execute(pool)
        .await
        .map_err(|e| format!("Update failed: {e}"))?;
    Ok(())
}

// ── delete_table_rows ─────────────────────────────────────────────────────────

pub async fn delete_table_rows(
    pool: &SqlitePool,
    table: &str,
    primary_keys: Vec<std::collections::HashMap<String, Value>>,
) -> Result<u64, String> {
    if primary_keys.is_empty() {
        return Ok(0);
    }
    let pk_columns = fetch_primary_key(pool, table).await?;
    if pk_columns.is_empty() {
        return Err("Cannot delete rows: table has no primary key".into());
    }

    let tq = format!("\"{}\"", table.replace('"', "\"\""));
    let mut total: u64 = 0;

    for pk_map in primary_keys {
        let where_parts: Vec<String> = pk_columns
            .iter()
            .map(|c| format!("\"{}\" = ?", c.replace('"', "\"\"")))
            .collect();
        let sql = format!("DELETE FROM {tq} WHERE {}", where_parts.join(" AND "));
        let mut q = sqlx::query(&sql);
        for col in &pk_columns {
            let v = pk_map.get(col).ok_or_else(|| format!("Missing PK: {col}"))?;
            q = bind_value(q, v);
        }
        let res = q.execute(pool).await.map_err(|e| format!("Delete failed: {e}"))?;
        total += res.rows_affected();
    }
    Ok(total)
}

// ── value binding ─────────────────────────────────────────────────────────────

fn bind_value<'a>(
    q: sqlx::query::Query<'a, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'a>>,
    value: &Value,
) -> sqlx::query::Query<'a, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'a>> {
    match value {
        Value::Null => q.bind(None::<String>),
        Value::Bool(b) => q.bind(*b as i64),
        Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                q.bind(i)
            } else if let Some(f) = n.as_f64() {
                q.bind(f)
            } else {
                q.bind(n.to_string())
            }
        }
        Value::String(s) => q.bind(s.clone()),
        other => q.bind(other.to_string()),
    }
}
