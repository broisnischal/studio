import { invoke } from '@tauri-apps/api/core'

/** @typedef {{ name: string, host: string, port: number, database: string, user: string, password: string, ssl: boolean }} ConnectionConfig */

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

/** @param {Record<string, unknown>} config */
async function invokeConfig(command, config) {
  try {
    return await invoke(command, { config: normalizeConnectionConfig(config) })
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
}

export async function testPostgresConnection(config) {
  return invokeConfig('test_postgres_connection', config)
}

export async function connectPostgres(config) {
  return invokeConfig('connect_postgres', config)
}

export async function disconnectPostgres() {
  try {
    return await invoke('disconnect_postgres')
  } catch (err) {
    throw new Error(formatInvokeError(err))
  }
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

/**
 * @param {string} schema
 * @param {string} table
 * @param {number} limit
 * @param {number} offset
 */
export async function getTableRows(schema, table, limit, offset) {
  try {
    return await invoke('pg_get_table_rows', { schema, table, limit, offset })
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
