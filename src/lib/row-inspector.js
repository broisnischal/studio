/**
 * @param {unknown} value
 * @returns {unknown}
 */
export function normalizeCellValue(value) {
  if (value === undefined) return null
  return value
}

/**
 * @param {unknown} value
 */
export function formatNormalValue(value) {
  const v = normalizeCellValue(value)
  if (v === null) return 'NULL'
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (typeof v === 'object') {
    try {
      return JSON.stringify(v, null, 2)
    } catch {
      return String(v)
    }
  }
  return String(v)
}

/**
 * @param {unknown} value
 */
export function formatJsonValue(value) {
  try {
    return JSON.stringify(normalizeCellValue(value), null, 2)
  } catch {
    return 'null'
  }
}

/**
 * @param {Record<string, unknown>} record
 */
export function formatNormalRecord(record) {
  return Object.entries(record)
    .map(([key, value]) => `${key}: ${formatNormalValue(value)}`)
    .join('\n')
}

/**
 * @param {Record<string, unknown>[]} records
 */
export function formatNormalRecords(records) {
  return records.map((r) => formatNormalRecord(r)).join('\n\n')
}

/**
 * @param {{ name: string, dataType?: string, data_type?: string }[]} columns
 * @param {unknown[][]} row
 */
export function rowToRecord(columns, row) {
  /** @type {Record<string, unknown>} */
  const record = {}
  columns.forEach((col, i) => {
    record[col.name] = normalizeCellValue(row[i])
  })
  return record
}

/**
 * @param {{ name: string }[]} columns
 * @param {unknown[][]} rows
 * @param {number[]} indices
 */
export function rowsToJsonPayload(columns, rows, indices) {
  if (indices.length === 1) {
    return rowToRecord(columns, rows[indices[0]])
  }
  return indices.map((idx) => rowToRecord(columns, rows[idx]))
}
