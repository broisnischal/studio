/**
 * @param {number | string | null | undefined} count
 */
export function formatTableRowCount(count) {
  const n = Number(count)
  if (!Number.isFinite(n) || n < 0) return '—'
  return n.toLocaleString()
}

/**
 * @param {number | string | null | undefined} count
 */
export function normalizeTableRowCount(count) {
  const n = Number(count)
  if (!Number.isFinite(n) || n < 0) return 0
  return n
}
