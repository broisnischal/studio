/** @typedef {{ ok: true, value: unknown } | { ok: false, message: string }} ParseResult */

/**
 * @param {unknown} value
 */
export function valueToEditString(value) {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * @param {string} dataType
 */
function normalizedType(dataType) {
  return String(dataType ?? '')
    .toLowerCase()
    .replace(/\(.+\)$/, '')
    .trim()
}

/**
 * @param {string} dataType
 */
export function isEditableType(dataType) {
  const t = normalizedType(dataType)
  if (!t || t.includes('bytea')) return false
  return true
}

/**
 * @param {string} raw
 * @param {string} dataType
 * @returns {ParseResult}
 */
export function parseCellInput(raw, dataType) {
  const trimmed = raw.trim()
  const t = normalizedType(dataType)

  if (trimmed === '' || trimmed.toUpperCase() === 'NULL') {
    return { ok: true, value: null }
  }

  if (
    t.includes('int') ||
    t === 'serial' ||
    t === 'bigserial' ||
    t === 'smallserial' ||
    t === 'oid'
  ) {
    if (!/^-?\d+$/.test(trimmed)) {
      return {
        ok: false,
        message: `Invalid integer for ${dataType}: "${raw}"`,
      }
    }
    const n = Number(trimmed)
    if (!Number.isSafeInteger(n)) {
      return { ok: false, message: 'Integer is out of range' }
    }
    return { ok: true, value: n }
  }

  if (
    t.includes('numeric') ||
    t.includes('decimal') ||
    t.includes('real') ||
    t.includes('double') ||
    t.includes('float') ||
    t === 'money'
  ) {
    if (!/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(trimmed)) {
      return {
        ok: false,
        message: `Invalid number for ${dataType}: "${raw}"`,
      }
    }
    const n = Number(trimmed)
    if (!Number.isFinite(n)) {
      return { ok: false, message: 'Number is not finite' }
    }
    return { ok: true, value: n }
  }

  if (t === 'boolean' || t === 'bool') {
    const lower = trimmed.toLowerCase()
    if (['true', 't', '1', 'yes', 'y'].includes(lower)) return { ok: true, value: true }
    if (['false', 'f', '0', 'no', 'n'].includes(lower)) return { ok: true, value: false }
    return {
      ok: false,
      message: `Invalid boolean: "${raw}" (use true/false)`,
    }
  }

  if (t === 'json' || t === 'jsonb') {
    try {
      return { ok: true, value: JSON.parse(trimmed) }
    } catch {
      return { ok: false, message: 'Invalid JSON' }
    }
  }

  if (t === 'uuid') {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        trimmed,
      )
    ) {
      return { ok: false, message: `Invalid UUID: "${raw}"` }
    }
    return { ok: true, value: trimmed }
  }

  return { ok: true, value: trimmed }
}
