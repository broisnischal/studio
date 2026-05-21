use super::connection::{require_pool, DbState};
use serde::Serialize;
use sqlx::Row;
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    pub row_count: i64,
}

pub async fn list_schemas(state: State<'_, DbState>) -> Result<Vec<String>, String> {
    let pool = require_pool(&state)?;
    let rows = sqlx::query(
        r#"
        SELECT n.nspname::text AS schema_name
        FROM pg_catalog.pg_namespace n
        WHERE n.nspname NOT IN ('pg_catalog', 'information_schema', 'pg_toast')
          AND n.nspname NOT LIKE 'pg_temp_%'
          AND n.nspname NOT LIKE 'pg_toast_%'
        ORDER BY n.nspname
        "#,
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to list schemas: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| r.try_get::<String, _>(0).ok())
        .collect())
}

pub async fn list_tables(state: State<'_, DbState>, schema: String) -> Result<Vec<TableInfo>, String> {
    let pool = require_pool(&state)?;

    // Primary: information_schema (reliable for permissions). Fallback: pg_catalog.
    let rows = sqlx::query(
        r#"
        SELECT
            t.table_name::text AS table_name,
            COALESCE(
                (
                    SELECT c.reltuples::bigint
                    FROM pg_catalog.pg_class c
                    INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
                    WHERE n.nspname = t.table_schema
                      AND c.relname = t.table_name
                      AND c.relkind IN ('r', 'p', 'v', 'f', 'm')
                    LIMIT 1
                ),
                0
            ) AS row_count
        FROM information_schema.tables t
        WHERE t.table_schema = $1
          AND t.table_type IN ('BASE TABLE', 'VIEW', 'FOREIGN TABLE', 'MATERIALIZED VIEW')
        ORDER BY t.table_name
        "#,
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to list tables: {e}"))?;

    let tables: Vec<TableInfo> = rows
        .iter()
        .filter_map(|r| {
            Some(TableInfo {
                name: r.try_get(0).ok()?,
                row_count: r.try_get(1).ok()?,
            })
        })
        .collect();

    if !tables.is_empty() {
        return Ok(tables);
    }

    // Fallback when information_schema returns nothing (edge permissions)
    let rows = sqlx::query(
        r#"
        SELECT
            c.relname::text AS table_name,
            COALESCE(c.reltuples, 0)::bigint AS row_count
        FROM pg_catalog.pg_class c
        INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = $1
          AND c.relkind IN ('r', 'p', 'v', 'f', 'm')
          AND NOT c.relispartition
        ORDER BY c.relname
        "#,
    )
    .bind(&schema)
    .fetch_all(&pool)
    .await
    .map_err(|e| format!("Failed to list tables: {e}"))?;

    Ok(rows
        .iter()
        .filter_map(|r| {
            Some(TableInfo {
                name: r.try_get(0).ok()?,
                row_count: r.try_get(1).ok()?,
            })
        })
        .collect())
}
