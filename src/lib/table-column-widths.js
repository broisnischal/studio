export const COL_WIDTH_MIN = 72
export const COL_WIDTH_MAX = 720

/** @param {string} dataType */
export function defaultColumnWidth(dataType) {
  const t = String(dataType ?? '')
    .toLowerCase()
    .replace(/\(.+\)$/, '')
    .trim()
  if (t.includes('json') || t === 'jsonb') return 280
  if (t.includes('text') || t.includes('char') || t.includes('uuid')) return 200
  return 160
}

/** @param {number} width */
export function clampColumnWidth(width) {
  return Math.round(Math.min(COL_WIDTH_MAX, Math.max(COL_WIDTH_MIN, width)))
}
