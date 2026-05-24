pub mod server;
pub mod tools;

use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use crate::db::ActiveConnection;
use tauri::{AppHandle, Manager, State};

/// Port we always try first — stable so AI clients don't need reconfiguration.
const PREFERRED_PORT: u16 = 39847;

pub struct McpState {
    pub conn: Arc<Mutex<Option<ActiveConnection>>>,
    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
    /// Actual bound port (0 = not yet started).
    pub port: Mutex<u16>,
    /// Persistent token — loaded from disk once in `init_token`, never regenerated.
    token: Mutex<String>,
}

impl McpState {
    pub fn new(conn: Arc<Mutex<Option<ActiveConnection>>>) -> Self {
        Self {
            conn,
            shutdown_tx: Mutex::new(None),
            port: Mutex::new(0),
            token: Mutex::new(String::new()),
        }
    }

    /// Called once from `setup()` — loads or generates a stable token from disk.
    pub fn init_token(&self, app: &AppHandle) {
        let mut tok = self.token.lock().unwrap_or_else(|e| e.into_inner());
        if !tok.is_empty() {
            return;
        }
        *tok = load_or_persist_token(app);
    }
}

/// Load token from `{app_data_dir}/mcp-token.txt` or generate + save a new one.
fn load_or_persist_token(app: &AppHandle) -> String {
    let path = app
        .path()
        .app_data_dir()
        .ok()
        .map(|d| d.join("mcp-token.txt"));

    if let Some(ref p) = path {
        if let Ok(raw) = std::fs::read_to_string(p) {
            let t = raw.trim().to_string();
            if !t.is_empty() {
                return t;
            }
        }
    }

    let tok = generate_token();
    if let Some(p) = path {
        if let Some(parent) = p.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let _ = std::fs::write(&p, &tok);
    }
    tok
}

#[derive(serde::Serialize, Clone)]
pub struct McpStatus {
    pub running: bool,
    pub port: u16,
    pub url: String,
    pub token: String,
}

#[tauri::command]
pub async fn mcp_start(mcp: State<'_, McpState>) -> Result<McpStatus, String> {
    // Already running — return current status.
    {
        let running = mcp.shutdown_tx.lock().map_err(|e| e.to_string())?.is_some();
        if running {
            let port = *mcp.port.lock().map_err(|e| e.to_string())?;
            let token = mcp.token.lock().map_err(|e| e.to_string())?.clone();
            return Ok(McpStatus {
                running: true,
                port,
                url: format!("http://127.0.0.1:{port}"),
                token,
            });
        }
    }

    // Always try the preferred port first — fall back only if it's taken by another process.
    let preferred = {
        let p = *mcp.port.lock().map_err(|e| e.to_string())?;
        if p > 0 { p } else { PREFERRED_PORT }
    };
    let port = find_free_port(preferred).await?;
    let token = mcp.token.lock().map_err(|e| e.to_string())?.clone();

    let conn = Arc::clone(&mcp.conn);
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let token_clone = token.clone();
    tokio::spawn(async move {
        server::run(port, token_clone, conn, shutdown_rx).await;
    });

    *mcp.port.lock().map_err(|e| e.to_string())? = port;
    *mcp.shutdown_tx.lock().map_err(|e| e.to_string())? = Some(shutdown_tx);

    Ok(McpStatus {
        running: true,
        port,
        url: format!("http://127.0.0.1:{port}"),
        token,
    })
}

#[tauri::command]
pub async fn mcp_stop(mcp: State<'_, McpState>) -> Result<(), String> {
    if let Some(tx) = mcp.shutdown_tx.lock().map_err(|e| e.to_string())?.take() {
        let _ = tx.send(());
    }
    // Intentionally keep port and token stable — AI clients stay configured.
    Ok(())
}

#[tauri::command]
pub fn mcp_status(mcp: State<'_, McpState>) -> Result<McpStatus, String> {
    let running = mcp.shutdown_tx.lock().map_err(|e| e.to_string())?.is_some();
    let raw_port = *mcp.port.lock().map_err(|e| e.to_string())?;
    // Return PREFERRED_PORT when not yet started so install links are valid immediately.
    let port = if raw_port > 0 { raw_port } else { PREFERRED_PORT };
    let token = mcp.token.lock().map_err(|e| e.to_string())?.clone();
    Ok(McpStatus {
        running,
        port,
        url: format!("http://127.0.0.1:{port}"),
        token,
    })
}

async fn find_free_port(preferred: u16) -> Result<u16, String> {
    for port in preferred..preferred + 20 {
        if tokio::net::TcpListener::bind(format!("127.0.0.1:{port}"))
            .await
            .is_ok()
        {
            return Ok(port);
        }
    }
    Err(format!("No free port found starting at {preferred}"))
}

fn generate_token() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    let pid = std::process::id();
    format!("{pid:08x}{nanos:08x}")
}
