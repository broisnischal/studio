use crate::db::connection::ActiveConnection;
use serde_json::{json, Value};
use sqlx::{Column, Row, TypeInfo};

// ── Tool manifest ─────────────────────────────────────────────────────────────

pub fn tool_list() -> Value {
    json!([
        {
            "name": "execute_sql",
            "description": "Execute a SQL query and return the results as JSON. Use this for any data retrieval or DML.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "sql": { "type": "string", "description": "SQL query to execute" },
                    "max_rows": { "type": "number", "description": "Maximum rows to return (default 200, max 1000)" }
                },
                "required": ["sql"]
            }
        },
        {
            "name": "list_tables",
            "description": "List all tables in the database with row counts and types.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "schema": { "type": "string", "description": "Schema name (default: public for Postgres)" }
                }
            }
        },
        {
            "name": "describe_table",
            "description": "Show full column definitions, primary key, foreign keys and indexes for a table.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "table": { "type": "string", "description": "Table name" },
                    "schema": { "type": "string", "description": "Schema name (default: public)" }
                },
                "required": ["table"]
            }
        },
        {
            "name": "check_migrations",
            "description": "Detect migration tables (Prisma, Drizzle, Rails, Flyway, Knex, Alembic, Goose) and report their current state. Essential for checking what migrations have been applied.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "schema": { "type": "string", "description": "Schema to search (default: public)" }
                }
            }
        }
    ])
}

// ── Tool dispatcher ───────────────────────────────────────────────────────────

pub async fn call_tool(
    conn: &ActiveConnection,
    name: &str,
    args: &Value,
) -> Result<String, String> {
    match name {
        "execute_sql" => {
            let sql = args["sql"].as_str().ok_or("Missing sql argument")?;
            let max_rows = args["max_rows"].as_u64().unwrap_or(200).min(1000) as usize;
            execute_sql(conn, sql, max_rows).await
        }
        "list_tables" => {
            let schema = args["schema"].as_str().unwrap_or("public");
            list_tables(conn, schema).await
        }
        "describe_table" => {
            let table = args["table"].as_str().ok_or("Missing table argument")?;
            let schema = args["schema"].as_str().unwrap_or("public");
            describe_table(conn, schema, table).await
        }
        "check_migrations" => {
            let schema = args["schema"].as_str().unwrap_or("public");
            check_migrations(conn, schema).await
        }
        _ => Err(format!("Unknown tool: {name}")),
    }
}

// ── execute_sql ───────────────────────────────────────────────────────────────

async fn execute_sql(
    conn: &ActiveConnection,
    sql: &str,
    max_rows: usize,
) -> Result<String, String> {
    match conn {
        ActiveConnection::Postgres(pool) => execute_sql_pg(pool, sql, max_rows).await,
        ActiveConnection::Sqlite(pool) => execute_sql_sqlite(pool, sql, max_rows).await,
        ActiveConnection::D1(cfg) => execute_sql_d1(cfg, sql, max_rows).await,
    }
}

async fn execute_sql_pg(
    pool: &sqlx::PgPool,
    sql: &str,
    max_rows: usize,
) -> Result<String, String> {
    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("SQL error: {e}"))?;

    if rows.is_empty() {
        return Ok(json!({ "columns": [], "rows": [], "row_count": 0 }).to_string());
    }

    let columns: Vec<String> = rows[0]
        .columns()
        .iter()
        .map(|c| c.name().to_string())
        .collect();
    let data: Vec<Vec<Value>> = rows
        .iter()
        .take(max_rows)
        .map(|row| (0..columns.len()).map(|i| pg_cell(row, i)).collect())
        .collect();
    let truncated = rows.len() > max_rows;

    Ok(json!({
        "columns": columns,
        "rows": data,
        "row_count": rows.len(),
        "truncated": truncated
    })
    .to_string())
}

async fn execute_sql_sqlite(
    pool: &sqlx::SqlitePool,
    sql: &str,
    max_rows: usize,
) -> Result<String, String> {
    let rows = sqlx::query(sql)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("SQL error: {e}"))?;

    if rows.is_empty() {
        return Ok(json!({ "columns": [], "rows": [], "row_count": 0 }).to_string());
    }

    let columns: Vec<String> = rows[0]
        .columns()
        .iter()
        .map(|c| c.name().to_string())
        .collect();
    let data: Vec<Vec<Value>> = rows
        .iter()
        .take(max_rows)
        .map(|row| {
            (0..columns.len())
                .map(|i| crate::db::sqlite::cell_to_json(row, i))
                .collect()
        })
        .collect();

    Ok(json!({
        "columns": columns,
        "rows": data,
        "row_count": rows.len(),
        "truncated": rows.len() > max_rows
    })
    .to_string())
}

async fn execute_sql_d1(
    cfg: &crate::db::D1Config,
    sql: &str,
    max_rows: usize,
) -> Result<String, String> {
    let result = crate::db::d1::query(cfg, sql, vec![]).await?;
    Ok(json!({
        "columns": result.columns.iter().map(|c| &c.name).collect::<Vec<_>>(),
        "rows": &result.rows,
        "row_count": result.rows.len(),
        "truncated": result.rows.len() >= max_rows
    })
    .to_string())
}

// ── list_tables ───────────────────────────────────────────────────────────────

async fn list_tables(conn: &ActiveConnection, schema: &str) -> Result<String, String> {
    match conn {
        ActiveConnection::Postgres(pool) => list_tables_pg(pool, schema).await,
        ActiveConnection::Sqlite(pool) => list_tables_sqlite(pool).await,
        ActiveConnection::D1(cfg) => list_tables_d1(cfg).await,
    }
}

async fn list_tables_pg(pool: &sqlx::PgPool, schema: &str) -> Result<String, String> {
    let rows = sqlx::query(
        r#"
        SELECT t.table_name, t.table_type,
               s.n_live_tup AS row_estimate
        FROM information_schema.tables t
        LEFT JOIN pg_stat_user_tables s
          ON s.schemaname = t.table_schema AND s.relname = t.table_name
        WHERE t.table_schema = $1
        ORDER BY t.table_name
        "#,
    )
    .bind(schema)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list tables: {e}"))?;

    let tables: Vec<Value> = rows
        .iter()
        .map(|r| {
            let name: String = r.try_get(0).unwrap_or_default();
            let kind: String = r.try_get(1).unwrap_or_default();
            let row_count: i64 = r.try_get(2).unwrap_or(-1);
            json!({ "name": name, "type": kind, "row_estimate": row_count })
        })
        .collect();

    Ok(json!({ "schema": schema, "tables": tables }).to_string())
}

async fn list_tables_sqlite(pool: &sqlx::SqlitePool) -> Result<String, String> {
    let rows = sqlx::query(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to list tables: {e}"))?;

    let tables: Vec<Value> = rows
        .iter()
        .map(|r| {
            let name: String = r.try_get(0).unwrap_or_default();
            let kind: String = r.try_get(1).unwrap_or_default();
            json!({ "name": name, "type": kind })
        })
        .collect();

    Ok(json!({ "tables": tables }).to_string())
}

async fn list_tables_d1(cfg: &crate::db::D1Config) -> Result<String, String> {
    let result = crate::db::d1::query(
        cfg,
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') ORDER BY name",
        vec![],
    )
    .await?;
    Ok(json!({ "tables": result.rows }).to_string())
}

// ── describe_table ────────────────────────────────────────────────────────────

async fn describe_table(
    conn: &ActiveConnection,
    schema: &str,
    table: &str,
) -> Result<String, String> {
    match conn {
        ActiveConnection::Postgres(pool) => describe_table_pg(pool, schema, table).await,
        ActiveConnection::Sqlite(pool) => describe_table_sqlite(pool, table).await,
        ActiveConnection::D1(cfg) => describe_table_sqlite_compat(cfg, table).await,
    }
}

async fn describe_table_pg(
    pool: &sqlx::PgPool,
    schema: &str,
    table: &str,
) -> Result<String, String> {
    // Columns
    let col_rows = sqlx::query(
        r#"
        SELECT c.column_name, c.data_type, c.is_nullable, c.column_default,
               c.character_maximum_length, c.is_identity,
               COALESCE(
                   (SELECT string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder)
                    FROM pg_type t
                    JOIN pg_namespace n ON n.oid = t.typnamespace
                    JOIN pg_enum e ON e.enumtypid = t.oid
                    WHERE t.typname = c.udt_name AND n.nspname = c.udt_schema),
                   ''
               ) AS enum_values
        FROM information_schema.columns c
        WHERE c.table_schema = $1 AND c.table_name = $2
        ORDER BY c.ordinal_position
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Column query failed: {e}"))?;

    let columns: Vec<Value> = col_rows
        .iter()
        .map(|r| {
            let name: String = r.try_get(0).unwrap_or_default();
            let data_type: String = r.try_get(1).unwrap_or_default();
            let nullable: String = r.try_get(2).unwrap_or_else(|_| "YES".into());
            let default: Option<String> = r.try_get(3).ok().flatten();
            let max_len: Option<i32> = r.try_get(4).ok().flatten();
            let is_identity: String = r.try_get(5).unwrap_or_else(|_| "NO".into());
            let enum_vals: String = r.try_get(6).unwrap_or_default();
            let mut col = json!({
                "name": name,
                "type": if let Some(len) = max_len {
                    format!("{data_type}({len})")
                } else {
                    data_type
                },
                "nullable": nullable == "YES",
                "default": default,
                "identity": is_identity == "YES",
            });
            if !enum_vals.is_empty() {
                col["enum_values"] =
                    json!(enum_vals.split(',').collect::<Vec<_>>());
            }
            col
        })
        .collect();

    // Primary key
    let pk_rows = sqlx::query(
        r#"
        SELECT a.attname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE c.contype = 'p' AND n.nspname = $1 AND t.relname = $2
        ORDER BY array_position(c.conkey, a.attnum)
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("PK query failed: {e}"))?;
    let primary_key: Vec<String> = pk_rows
        .iter()
        .filter_map(|r| r.try_get(0).ok())
        .collect();

    // Foreign keys
    let fk_rows = sqlx::query(
        r#"
        SELECT c.conname, a.attname, fn.nspname, f.relname, fa.attname
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        JOIN pg_class f ON f.oid = c.confrelid
        JOIN pg_namespace fn ON fn.oid = f.relnamespace
        JOIN LATERAL unnest(c.conkey) WITH ORDINALITY AS pos(attnum, ord) ON true
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = pos.attnum
        JOIN LATERAL unnest(c.confkey) WITH ORDINALITY AS fpos(attnum, ord) ON pos.ord = fpos.ord
        JOIN pg_attribute fa ON fa.attrelid = f.oid AND fa.attnum = fpos.attnum
        WHERE c.contype = 'f' AND n.nspname = $1 AND t.relname = $2
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let foreign_keys: Vec<Value> = fk_rows
        .iter()
        .map(|r| {
            json!({
                "name": r.try_get::<String,_>(0).unwrap_or_default(),
                "column": r.try_get::<String,_>(1).unwrap_or_default(),
                "references": format!(
                    "{}.{}.{}",
                    r.try_get::<String,_>(2).unwrap_or_default(),
                    r.try_get::<String,_>(3).unwrap_or_default(),
                    r.try_get::<String,_>(4).unwrap_or_default(),
                )
            })
        })
        .collect();

    // Indexes
    let idx_rows = sqlx::query(
        r#"
        SELECT i.relname, ix.indisunique, ix.indisprimary,
               array_to_string(ARRAY(
                   SELECT a.attname
                   FROM pg_attribute a
                   WHERE a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
                   ORDER BY array_position(ix.indkey, a.attnum)
               ), ', ')
        FROM pg_index ix
        JOIN pg_class t ON t.oid = ix.indrelid
        JOIN pg_class i ON i.oid = ix.indexrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = $1 AND t.relname = $2
        ORDER BY i.relname
        "#,
    )
    .bind(schema)
    .bind(table)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let indexes: Vec<Value> = idx_rows
        .iter()
        .map(|r| {
            json!({
                "name": r.try_get::<String,_>(0).unwrap_or_default(),
                "unique": r.try_get::<bool,_>(1).unwrap_or(false),
                "primary": r.try_get::<bool,_>(2).unwrap_or(false),
                "columns": r.try_get::<String,_>(3).unwrap_or_default(),
            })
        })
        .collect();

    Ok(json!({
        "schema": schema,
        "table": table,
        "columns": columns,
        "primary_key": primary_key,
        "foreign_keys": foreign_keys,
        "indexes": indexes,
    })
    .to_string())
}

async fn describe_table_sqlite(
    pool: &sqlx::SqlitePool,
    table: &str,
) -> Result<String, String> {
    let tq = format!("\"{}\"", table.replace('"', "\"\""));
    let rows = sqlx::query(&format!("PRAGMA table_info({tq})"))
        .fetch_all(pool)
        .await
        .map_err(|e| format!("PRAGMA failed: {e}"))?;

    let columns: Vec<Value> = rows
        .iter()
        .map(|r| {
            json!({
                "name": r.try_get::<String,_>(1).unwrap_or_default(),
                "type": r.try_get::<String,_>(2).unwrap_or_else(|_| "text".into()),
                "nullable": r.try_get::<i64,_>(3).unwrap_or(0) == 0,
                "default": r.try_get::<Option<String>,_>(4).ok().flatten(),
                "primary_key": r.try_get::<i64,_>(5).unwrap_or(0) > 0,
            })
        })
        .collect();

    let pk: Vec<String> = rows
        .iter()
        .filter(|r| r.try_get::<i64, _>(5).unwrap_or(0) > 0)
        .filter_map(|r| r.try_get(1).ok())
        .collect();

    Ok(json!({ "table": table, "columns": columns, "primary_key": pk }).to_string())
}

async fn describe_table_sqlite_compat(
    cfg: &crate::db::D1Config,
    table: &str,
) -> Result<String, String> {
    let tq = format!("\"{}\"", table.replace('"', "\"\""));
    let result =
        crate::db::d1::query(cfg, &format!("PRAGMA table_info({tq})"), vec![]).await?;
    Ok(json!({ "table": table, "pragma_info": result.rows }).to_string())
}

// ── check_migrations ──────────────────────────────────────────────────────────

async fn check_migrations(conn: &ActiveConnection, schema: &str) -> Result<String, String> {
    match conn {
        ActiveConnection::Postgres(pool) => check_migrations_pg(pool, schema).await,
        ActiveConnection::Sqlite(pool) => check_migrations_sqlite(pool).await,
        ActiveConnection::D1(cfg) => check_migrations_d1(cfg).await,
    }
}

/// Well-known migration tracking tables. Tuple: (table, framework, name_col, timestamp_col)
const MIGRATION_TABLES: &[(&str, &str, &str, &str)] = &[
    ("_prisma_migrations", "Prisma", "migration_name", "finished_at"),
    ("__drizzle_migrations", "Drizzle ORM", "hash", "created_at"),
    ("schema_migrations", "Rails / Goose", "version", ""),
    ("migrations", "Generic", "name", "executed_at"),
    ("flyway_schema_history", "Flyway", "script", "installed_on"),
    ("knex_migrations", "Knex.js", "name", "migration_time"),
    ("alembic_version", "Alembic", "version_num", ""),
    ("goose_db_version", "Goose", "version_id", "tstamp"),
];

async fn check_migrations_pg(pool: &sqlx::PgPool, schema: &str) -> Result<String, String> {
    let existing: Vec<String> = sqlx::query_scalar(
        "SELECT table_name::text FROM information_schema.tables WHERE table_schema = $1",
    )
    .bind(schema)
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let mut found = Vec::new();
    let mut not_found = Vec::new();

    for (tbl, framework, name_col, ts_col) in MIGRATION_TABLES {
        if !existing.iter().any(|t| t.as_str() == *tbl) {
            not_found.push(json!({ "table": tbl, "framework": framework, "found": false }));
            continue;
        }

        let count: i64 =
            sqlx::query_scalar(&format!(r#"SELECT COUNT(*) FROM "{schema}"."{tbl}""#))
                .fetch_one(pool)
                .await
                .unwrap_or(0);

        let order = if ts_col.is_empty() {
            format!("\"{name_col}\" DESC")
        } else {
            format!("\"{ts_col}\" DESC")
        };
        let select_ts = if ts_col.is_empty() {
            String::new()
        } else {
            format!(", \"{ts_col}\" as ts")
        };
        let recent = sqlx::query(&format!(
            r#"SELECT "{name_col}" as name{select_ts} FROM "{schema}"."{tbl}" ORDER BY {order} LIMIT 5"#
        ))
        .fetch_all(pool)
        .await
        .unwrap_or_default();

        let entries: Vec<Value> = recent
            .iter()
            .map(|r| {
                let name: String = r.try_get("name").unwrap_or_default();
                if ts_col.is_empty() {
                    json!({ "name": name })
                } else {
                    let ts = pg_cell(r, 1);
                    json!({ "name": name, "applied_at": ts })
                }
            })
            .collect();

        found.push(json!({
            "table": tbl,
            "framework": framework,
            "found": true,
            "total_migrations": count,
            "recent": entries,
        }));
    }

    let all: Vec<Value> = found.into_iter().chain(not_found).collect();
    Ok(json!({ "schema": schema, "migration_tables": all }).to_string())
}

async fn check_migrations_sqlite(pool: &sqlx::SqlitePool) -> Result<String, String> {
    let existing: Vec<String> =
        sqlx::query_scalar("SELECT name FROM sqlite_master WHERE type = 'table'")
            .fetch_all(pool)
            .await
            .unwrap_or_default();

    let mut results = Vec::new();
    for (tbl, framework, name_col, ts_col) in MIGRATION_TABLES {
        if !existing.iter().any(|t| t.as_str() == *tbl) {
            results.push(json!({ "table": tbl, "framework": framework, "found": false }));
            continue;
        }
        let count: i64 =
            sqlx::query_scalar(&format!("SELECT COUNT(*) FROM \"{tbl}\""))
                .fetch_one(pool)
                .await
                .unwrap_or(0);
        let order = if ts_col.is_empty() {
            format!("\"{name_col}\" DESC")
        } else {
            format!("\"{ts_col}\" DESC")
        };
        let recent = sqlx::query(&format!(
            "SELECT \"{name_col}\" as name FROM \"{tbl}\" ORDER BY {order} LIMIT 5"
        ))
        .fetch_all(pool)
        .await
        .unwrap_or_default();
        let entries: Vec<Value> = recent
            .iter()
            .map(|r| {
                json!({ "name": r.try_get::<String,_>("name").unwrap_or_default() })
            })
            .collect();
        results.push(json!({
            "table": tbl,
            "framework": framework,
            "found": true,
            "total_migrations": count,
            "recent": entries
        }));
    }
    Ok(json!({ "migration_tables": results }).to_string())
}

async fn check_migrations_d1(cfg: &crate::db::D1Config) -> Result<String, String> {
    // Fetch all table names first
    let result =
        crate::db::d1::query(cfg, "SELECT name FROM sqlite_master WHERE type = 'table'", vec![])
            .await?;

    let name_idx = result
        .columns
        .iter()
        .position(|c| c.name == "name")
        .unwrap_or(0);

    let existing: Vec<String> = result
        .rows
        .iter()
        .filter_map(|r| r.get(name_idx)?.as_str().map(String::from))
        .collect();

    let mut results = Vec::new();
    for (tbl, framework, _, _) in MIGRATION_TABLES {
        let found = existing.iter().any(|n| n.as_str() == *tbl);
        results.push(json!({ "table": tbl, "framework": framework, "found": found }));
    }
    Ok(json!({ "migration_tables": results }).to_string())
}

// ── Postgres cell → JSON ──────────────────────────────────────────────────────

fn pg_cell(row: &sqlx::postgres::PgRow, idx: usize) -> Value {
    use chrono::{DateTime, NaiveDate, NaiveDateTime, NaiveTime, Utc};
    use rust_decimal::Decimal;
    use sqlx::{Decode, Postgres, ValueRef};
    use uuid::Uuid;

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
    macro_rules! try_str {
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
    try_str!(Decimal);
    try_str!(DateTime<Utc>);
    try_str!(NaiveDateTime);
    try_str!(NaiveDate);
    try_str!(NaiveTime);
    try_str!(Uuid);
    try_get!(String);

    let col = row.column(idx);
    if col.type_info().name() == "JSON" || col.type_info().name() == "JSONB" {
        if let Ok(v) = row.try_get::<Option<Value>, _>(idx) {
            return v.unwrap_or(Value::Null);
        }
    }
    if let Ok(raw) = row.try_get_raw(idx) {
        if raw.is_null() {
            return Value::Null;
        }
        if let Ok(text) = <String as Decode<Postgres>>::decode(raw) {
            return json!(text);
        }
    }
    Value::Null
}
