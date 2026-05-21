use serde::{Deserialize, Serialize};
use sqlx::postgres::PgPoolOptions;
use sqlx::PgPool;
use std::sync::Mutex;
use tauri::State;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionConfig {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub ssl: bool,
}

impl ConnectionConfig {
    pub fn connection_url(&self) -> String {
        let ssl = if self.ssl { "?sslmode=require" } else { "" };
        format!(
            "postgres://{}:{}@{}:{}/{}{}",
            urlencoding::encode(&self.user),
            urlencoding::encode(&self.password),
            self.host,
            self.port,
            self.database,
            ssl
        )
    }
}

pub struct DbState {
    pub pool: Mutex<Option<PgPool>>,
    pub config: Mutex<Option<ConnectionConfig>>,
}

impl Default for DbState {
    fn default() -> Self {
        Self {
            pool: Mutex::new(None),
            config: Mutex::new(None),
        }
    }
}

async fn open_pool(config: &ConnectionConfig) -> Result<PgPool, String> {
    PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(std::time::Duration::from_secs(10))
        .connect(&config.connection_url())
        .await
        .map_err(|e| format!("Connection failed: {e}"))
}

pub async fn test_connection(config: ConnectionConfig) -> Result<(), String> {
    let pool = open_pool(&config).await?;
    sqlx::query("SELECT 1")
        .execute(&pool)
        .await
        .map_err(|e| format!("Query failed: {e}"))?;
    pool.close().await;
    Ok(())
}

pub async fn connect(state: State<'_, DbState>, config: ConnectionConfig) -> Result<(), String> {
    let pool = open_pool(&config).await?;
    let old = {
        let mut pool_guard = state.pool.lock().map_err(|e| e.to_string())?;
        pool_guard.take()
    };
    if let Some(old) = old {
        old.close().await;
    }
    *state.pool.lock().map_err(|e| e.to_string())? = Some(pool);
    *state.config.lock().map_err(|e| e.to_string())? = Some(config);
    Ok(())
}

pub async fn disconnect(state: State<'_, DbState>) -> Result<(), String> {
    let pool = {
        let mut pool_guard = state.pool.lock().map_err(|e| e.to_string())?;
        pool_guard.take()
    };
    if let Some(pool) = pool {
        pool.close().await;
    }
    *state.config.lock().map_err(|e| e.to_string())? = None;
    Ok(())
}

pub fn require_pool(state: &State<'_, DbState>) -> Result<PgPool, String> {
    state
        .pool
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "Not connected to a database".to_string())
}
