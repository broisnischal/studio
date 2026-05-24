pub mod server;
pub mod tools;

use std::sync::{Arc, Mutex};
use tokio::sync::oneshot;
use crate::db::ActiveConnection;
use tauri::State;

pub struct McpState {
    pub conn: Arc<Mutex<Option<ActiveConnection>>>,
    shutdown_tx: Mutex<Option<oneshot::Sender<()>>>,
    pub port: Mutex<u16>,
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

    let port = find_free_port(39847).await?;
    let token = generate_token();
    let conn = Arc::clone(&mcp.conn);
    let (shutdown_tx, shutdown_rx) = oneshot::channel::<()>();
    let token_clone = token.clone();
    tokio::spawn(async move {
        server::run(port, token_clone, conn, shutdown_rx).await;
    });

    *mcp.port.lock().map_err(|e| e.to_string())? = port;
    *mcp.token.lock().map_err(|e| e.to_string())? = token.clone();
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
    *mcp.port.lock().map_err(|e| e.to_string())? = 0;
    *mcp.token.lock().map_err(|e| e.to_string())? = String::new();
    Ok(())
}

#[tauri::command]
pub fn mcp_status(mcp: State<'_, McpState>) -> Result<McpStatus, String> {
    let running = mcp.shutdown_tx.lock().map_err(|e| e.to_string())?.is_some();
    let port = *mcp.port.lock().map_err(|e| e.to_string())?;
    let token = mcp.token.lock().map_err(|e| e.to_string())?.clone();
    Ok(McpStatus {
        running,
        port,
        url: if running {
            format!("http://127.0.0.1:{port}")
        } else {
            String::new()
        },
        token,
    })
}

async fn find_free_port(start: u16) -> Result<u16, String> {
    for port in start..start + 20 {
        if tokio::net::TcpListener::bind(format!("127.0.0.1:{port}"))
            .await
            .is_ok()
        {
            return Ok(port);
        }
    }
    Err(format!("No free port in range {start}–{}", start + 20))
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
