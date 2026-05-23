const STORAGE_KEY = 'db-studio:column-widths'

/** @returns {Record<string, Record<string, number>>} */
function loadAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** @param {Record<string, Record<string, number>>} all */
function saveAll(all) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
}

/** @param {string} tableKey @returns {Record<string, number>} */
export function loadColumnWidths(tableKey) {
  if (!tableKey) return {}
  const all = loadAll()
  const widths = all[tableKey]
  if (!widths || typeof widths !== 'object') return {}
  /** @type {Record<string, number>} */
  const out = {}
  for (const [name, w] of Object.entries(widths)) {
    const n = Number(w)
    if (Number.isFinite(n) && n > 0) out[name] = n
  }
  return out
}

/** @param {string} tableKey @param {Record<string, number>} widths */
export function saveColumnWidths(tableKey, widths) {
  if (!tableKey) return
  const all = loadAll()
  all[tableKey] = { ...widths }
  saveAll(all)
}
