import { invoke } from '@tauri-apps/api/core'

/** @typedef {{ name: string, host: string, port: number, database: string, user: string, password: string, ssl: boolean }} PgConnectionConfig */
/** @typedef {{ name: string, filePath: string }} SqliteConnectionConfig */
/** @typedef {{ name: string, accountId: string, databaseId: string, apiToken: string }} D1ConnectionConfig */
/** @typedef {PgConnectionConfig} ConnectionConfig */

/** @param {Record<string, unknown>} raw */
export function normalizeConnectionConfig(raw) {
  return {
    name: String(raw.name ?? '').trim() || 'Connection',
    host: String(raw.host ?? '127.0.0.1').trim(),
    port: Math.min(65535, Math.max(1, Number(raw.port) || 5432)),
    database: String(raw.database ?? 'postgres').trim(),
    user: String(raw.user ?? 'postgres').trim(),
    password: String(raw.password ?? ''),
    ssl: Boolean(raw.ssl),
  }
}

/** @param {unknown} err */
function formatInvokeError(err) {
  const msg = String(err)
  if (msg.includes('invoke') || msg.includes('Tauri')) {
    return 'Database API unavailable. Run the app with: npm run tauri dev'
  }
  return msg
}

async function inv(command, args = {}) {
  try {
    return await invoke(command, args)
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

// ── PostgreSQL ────────────────────────────────────────────────────────────────

export async function testPostgresConnection(config) {
  return inv('test_postgres_connection', { config: normalizeConnectionConfig(config) })
}

export async function connectPostgres(config) {
  return inv('connect_postgres', { config: normalizeConnectionConfig(config) })
}

/** Toggle the WebView DevTools (no-op in release builds). */
export async function toggleDevtools() {
  return inv('toggle_devtools')
}

// ── SQLite ────────────────────────────────────────────────────────────────────

/** @param {{ name: string, filePath: string }} config */
export async function testSqliteConnection(config) {
  return inv('test_sqlite', { config: { name: String(config.name || 'SQLite'), filePath: String(config.filePath || '') } })
}

/** @param {{ name: string, filePath: string }} config */
export async function connectSqlite(config) {
  return inv('connect_sqlite_db', { config: { name: String(config.name || 'SQLite'), filePath: String(config.filePath || '') } })
}

// ── Cloudflare D1 ─────────────────────────────────────────────────────────────

/** @param {{ name: string, accountId: string, databaseId: string, apiToken: string }} config */
export async function testD1Connection(config) {
  return inv('test_d1', { config })
}

/** @param {{ name: string, accountId: string, databaseId: string, apiToken: string }} config */
export async function connectD1(config) {
  return inv('connect_d1_db', { config })
}

// ── Shared disconnect ─────────────────────────────────────────────────────────

export async function disconnectPostgres() {
  return inv('disconnect_postgres')
}

export async function listSchemas() {
  try {
    return await invoke('pg_list_schemas')
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** @param {string} schema */
export async function listTables(schema) {
  try {
    return await invoke('pg_list_tables', { schema })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** @param {string} schema */
export async function listIndexes(schema) {
  try {
    return await invoke('pg_list_indexes', { schema })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** @param {string} schema */
export async function listEnums(schema) {
  try {
    return await invoke('pg_list_enums', { schema })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {number} limit
 * @param {number} offset
 * @param {{
 *   search?: string
 *   sortColumn?: string
 *   sortDirection?: 'asc' | 'desc'
 *   filters?: { column: string, op: string, value?: string }[]
 * }} [query]
 */
export async function getTableRows(schema, table, limit, offset, query = {}) {
  try {
    return await invoke('pg_get_table_rows', {
      schema,
      table,
      limit,
      offset,
      search: query.search?.trim() || null,
      sortColumn: query.sortColumn || null,
      sortDirection: query.sortDirection || null,
      filters: query.filters?.length ? query.filters : null,
    })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/** @param {string} sql */
export async function executeSql(sql) {
  try {
    return await invoke('pg_execute_sql', { sql })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {Record<string, unknown>} primaryKey
 * @param {string} column
 * @param {unknown} value
 */
export async function updateTableCell(schema, table, primaryKey, column, value) {
  try {
    return await invoke('pg_update_table_cell', {
      schema,
      table,
      primaryKey,
      column,
      value,
    })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {Record<string, unknown>} primaryKey
 */
export async function deleteTableRow(schema, table, primaryKey) {
  try {
    return await invoke('pg_delete_table_row', {
      schema,
      table,
      primaryKey,
    })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {Record<string, unknown>[]} primaryKeys
 */
export async function deleteTableRows(schema, table, primaryKeys) {
  try {
    return await invoke('pg_delete_table_rows', {
      schema,
      table,
      primaryKeys,
    })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

/**
 * @param {string} schema
 * @param {string} table
 * @param {Record<string, unknown>} values
 * @returns {Promise<{ row: unknown[] }>}
 */
export async function insertTableRow(schema, table, values) {
  try {
    return await invoke('pg_insert_table_row', {
      schema,
      table,
      values,
    })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

// ── MCP Server ────────────────────────────────────────────────────────────────

/** @returns {Promise<{ running: boolean, port: number, url: string, token: string }>} */
export async function mcpStart() {
  return inv('mcp_start')
}

export async function mcpStop() {
  return inv('mcp_stop')
}

/** @returns {Promise<{ running: boolean, port: number, url: string, token: string }>} */
export async function mcpStatus() {
  return inv('mcp_status')
}
