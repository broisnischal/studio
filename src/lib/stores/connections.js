const STORAGE_KEY = 'db-studio:connections'

/** @typedef {{ id: string, name: string, host: string, port: number, database: string, user: string, password: string, ssl: boolean }} SavedConnection */

export function newConnectionId() {
  return crypto.randomUUID()
}

/** @returns {SavedConnection[]} */
export function loadSavedConnections() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((c) => ({
      ...c,
      id: c.id ?? newConnectionId(),
      port: Number(c.port) || 5432,
    }))
  } catch {
    return []
  }
}

/** @param {SavedConnection[]} connections */
export function saveConnections(connections) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(connections))
}

/** @param {SavedConnection} conn */
export function upsertConnection(conn) {
  const list = loadSavedConnections()
  const idx = list.findIndex((c) => c.id === conn.id)
  if (idx >= 0) list[idx] = conn
  else list.push(conn)
  saveConnections(list)
  return list
}

/** @param {string} id */
export function removeConnection(id) {
  const list = loadSavedConnections().filter((c) => c.id !== id)
  saveConnections(list)
  return list
}

