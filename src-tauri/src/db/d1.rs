use super::connection::D1Config;
use super::query::{ColumnInfo, SqlResult};
use serde::Deserialize;
use serde_json::Value;
use std::time::Instant;

#[derive(Deserialize)]
struct D1Response {
    result: Vec<D1QueryResult>,
    success: bool,
    errors: Vec<Value>,
}

#[derive(Deserialize)]
struct D1QueryResult {
    /// Row results as array of objects (key = column name, value = cell).
    /// serde_json with preserve_order keeps insertion order, so column order is stable.
    #[serde(default)]
    results: Vec<serde_json::Map<String, Value>>,
    success: bool,
    meta: D1Meta,
}

#[derive(Deserialize)]
struct D1Meta {
    #[serde(default)]
    #[allow(dead_code)]
    duration: f64,
    #[serde(default)]
    changes: i64,
    #[serde(default)]
    rows_read: i64,
    #[serde(default)]
    rows_written: i64,
}

/// Execute a single SQL statement against a D1 database via the Cloudflare REST API.
/// `params` are bound as positional `?` parameters.
pub async fn query(config: &D1Config, sql: &str, params: Vec<Value>) -> Result<SqlResult, String> {
    let url = format!(
        "https://api.cloudflare.com/client/v4/accounts/{}/d1/database/{}/query",
        config.account_id, config.database_id
    );

    let client = reqwest::Client::new();
    let t0 = Instant::now();

    let res = client
        .post(&url)
        .header("Authorization", format!("Bearer {}", config.api_token))
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "sql": sql, "params": params }))
        .send()
        .await
        .map_err(|e| format!("D1 request failed: {e}"))?;

    let status = res.status();
    let elapsed = t0.elapsed().as_millis() as u64;

    if !status.is_success() {
        let body = res.text().await.unwrap_or_default();
        return Err(format!("D1 API error {status}: {}", body.chars().take(400).collect::<String>()));
    }

    let d1: D1Response = res
        .json()
        .await
        .map_err(|e| format!("Failed to parse D1 response: {e}"))?;

    if !d1.success {
        let errs: Vec<String> = d1.errors.iter().map(|e| e.to_string()).collect();
        return Err(format!("D1 error: {}", errs.join("; ")));
    }

    let result = d1.result.into_iter().next().ok_or("Empty D1 result")?;

    if !result.success {
        return Err("D1 query returned success=false".to_string());
    }

    // Build columns from the keys of the first row (order preserved by IndexMap)
    let columns: Vec<ColumnInfo> = result
        .results
        .first()
        .map(|row| {
            row.keys()
                .map(|k| ColumnInfo::new(k.clone(), "text"))
                .collect()
        })
        .unwrap_or_default();

    let rows: Vec<Vec<Value>> = result
        .results
        .iter()
        .map(|row| {
            columns
                .iter()
                .map(|c| row.get(&c.name).cloned().unwrap_or(Value::Null))
                .collect()
        })
        .collect();

    let row_count = if result.meta.rows_written > 0 || result.meta.changes > 0 {
        Some(result.meta.changes)
    } else if !rows.is_empty() {
        Some(result.meta.rows_read)
    } else {
        Some(0)
    };

    let message = if result.meta.changes > 0 {
        Some(format!("{} row(s) affected", result.meta.changes))
    } else {
        None
    };

    Ok(SqlResult {
        columns,
        rows,
        row_count,
        message,
        query_ms: elapsed,
    })
}
