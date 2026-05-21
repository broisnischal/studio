use super::connection::{require_pool, DbState};
use serde::Serialize;
use sqlx::{PgPool, Row};
use tauri::State;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TableInfo {
    pub name: String,
    pub row_count: i64,
}

pub(crate) fn validate_ident(name: &str) -> Result<(), String> {
    if name.is_empty()
        || !name
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '_')
    {
        return Err(format!("Invalid identifier: {name}"));
    }
    Ok(())
}

fn quoted_table_ref(schema: &str, table: &str) -> Result<String, String> {
    validate_ident(schema)?;
    validate_ident(table)?;
    Ok(format!(r#""{schema}"."{table}""#))
}

async fn exact_row_count(pool: &PgPool, schema: &str, table: &str) -> Result<i64, String> {
    let ref_name = quoted_table_ref(schema, table)?;
    let sql = format!("SELECT COUNT(*)::bigint FROM {ref_name}");
    sqlx::query_scalar(&sql)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to count rows for {table}: {e}"))
}

async fn resolve_unknown_row_counts(
    pool: &PgPool,
    schema: &str,
    tables: &mut [TableInfo],
) {
    for table in tables.iter_mut() {
        if table.row_count >= 0 {
            continue;
        }
        table.row_count = exact_row_count(pool, schema, &table.name)
            .await
            .unwrap_or(0);
    }
}

const LIST_TABLES_SQL: &str = r#"
        SELECT
            t.table_name::text AS table_name,
            CASE
                WHEN s.n_live_tup IS NOT NULL THEN GREATEST(s.n_live_tup::bigint, 0)
                WHEN c.reltuples >= 0 THEN c.reltuples::bigint
                ELSE -1
            END AS row_count
        FROM information_schema.tables t
        LEFT JOIN pg_catalog.pg_namespace n
            ON n.nspname = t.table_schema
        LEFT JOIN pg_catalog.pg_class c
            ON c.relnamespace = n.oid
            AND c.relname = t.table_name
            AND c.relkind IN ('r', 'p', 'v', 'f', 'm')
        LEFT JOIN pg_stat_user_tables s
            ON s.schemaname = t.table_schema
            AND s.relname = t.table_name
        WHERE t.table_schema = $1
          AND t.table_type IN ('BASE TABLE', 'VIEW', 'FOREIGN TABLE', 'MATERIALIZED VIEW')
        ORDER BY t.table_name
        "#;

const LIST_TABLES_FALLBACK_SQL: &str = r#"
        SELECT
            c.relname::text AS table_name,
            CASE
                WHEN s.n_live_tup IS NOT NULL THEN GREATEST(s.n_live_tup::bigint, 0)
                WHEN c.reltuples >= 0 THEN c.reltuples::bigint
                ELSE -1
            END AS row_count
        FROM pg_catalog.pg_class c
        INNER JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
        LEFT JOIN pg_stat_user_tables s
            ON s.schemaname = n.nspname
            AND s.relname = c.relname
        WHERE n.nspname = $1
          AND c.relkind IN ('r', 'p', 'v', 'f', 'm')
          AND NOT c.relispartition
        ORDER BY c.relname
        "#;

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
    validate_ident(&schema)?;

    let pool = require_pool(&state)?;

    let rows = sqlx::query(LIST_TABLES_SQL)
        .bind(&schema)
        .fetch_all(&pool)
        .await
        .map_err(|e| format!("Failed to list tables: {e}"))?;

    let mut tables: Vec<TableInfo> = rows
        .iter()
        .filter_map(|r| {
            Some(TableInfo {
                name: r.try_get(0).ok()?,
                row_count: r.try_get::<i64, _>(1).unwrap_or(-1),
            })
        })
        .collect();

    if tables.is_empty() {
        let rows = sqlx::query(LIST_TABLES_FALLBACK_SQL)
            .bind(&schema)
            .fetch_all(&pool)
            .await
            .map_err(|e| format!("Failed to list tables: {e}"))?;

        tables = rows
            .iter()
            .filter_map(|r| {
                Some(TableInfo {
                    name: r.try_get(0).ok()?,
                    row_count: r.try_get::<i64, _>(1).unwrap_or(-1),
                })
            })
            .collect();
    }

    resolve_unknown_row_counts(&pool, &schema, &mut tables).await;

    Ok(tables)
}
