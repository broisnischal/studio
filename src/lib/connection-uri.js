/** @typedef {{ host: string, port: string, database: string, user: string, password: string, ssl: boolean }} ParsedPostgresUri */
/** @typedef {{ filePath: string }} ParsedSqliteUri */

/**
 * @param {string} uri
 * @returns {ParsedPostgresUri | { error: string } | null}
 */
export function parsePostgresUri(uri) {
  const trimmed = uri.trim()
  if (!trimmed) return null

  let normalized = trimmed
  if (/^postgres:\/\//i.test(normalized)) {
    normalized = `postgresql://${normalized.slice(11)}`
  } else if (!/^postgresql:\/\//i.test(normalized)) {
    if (trimmed.includes('@') || /^[^/]+:\d+\//.test(trimmed)) {
      normalized = `postgresql://${trimmed}`
    } else {
      return { error: 'Expected a postgresql:// connection URI' }
    }
  }

  try {
    const url = new URL(normalized)
    const sslmode = url.searchParams.get('sslmode')?.toLowerCase()
    const ssl =
      sslmode === 'require' ||
      sslmode === 'verify-ca' ||
      sslmode === 'verify-full' ||
      url.searchParams.get('ssl') === 'true'

    return {
      host: url.hostname || '127.0.0.1',
      port: url.port || '5432',
      database: decodeURIComponent(url.pathname.replace(/^\//, '')) || 'postgres',
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl,
    }
  } catch {
    return { error: 'Could not parse connection URI' }
  }
}

/**
 * @param {string} uri
 * @returns {ParsedSqliteUri | { error: string } | null}
 */
export function parseSqliteUri(uri) {
  const trimmed = uri.trim()
  if (!trimmed) return null
  if (trimmed === ':memory:') return { filePath: ':memory:' }

  if (/^sqlite:/i.test(trimmed)) {
    let path = trimmed.replace(/^sqlite:\/\/?/i, '').replace(/^sqlite:/i, '')
    path = decodeURIComponent(path)
    if (!path) return { error: 'SQLite URI is missing a file path' }
    return { filePath: path }
  }

  if (/^file:\/\//i.test(trimmed)) {
    return { filePath: decodeURIComponent(trimmed.slice(7)) }
  }

  return null
}

/**
 * @param {'postgres'|'sqlite'} type
 * @param {string} uri
 * @returns {ParsedPostgresUri | ParsedSqliteUri | { error: string } | null}
 */
export function parseConnectionUri(type, uri) {
  return type === 'sqlite' ? parseSqliteUri(uri) : parsePostgresUri(uri)
}
