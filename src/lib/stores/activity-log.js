/**
 * @typedef {'connect' | 'disconnect' | 'table_open' | 'row_fetch' | 'row_save' | 'row_delete' | 'row_insert' | 'sql_exec' | 'export' | 'schema_change' | 'filter' | 'error'} ActivityType
 */

/**
 * @typedef {{
 *   id: string
 *   type: ActivityType
 *   title: string
 *   detail?: string
 *   schema?: string
 *   table?: string
 *   rowCount?: number
 *   success: boolean
 *   durationMs?: number
 *   error?: string
 *   timestamp: number
 * }} ActivityEntry
 */

const MAX_ENTRIES = 300

/** @type {ActivityEntry[]} */
const _log = []
/** @type {((entries: ActivityEntry[]) => void)[]} */
let _listeners = []
let _rafId = 0

/** Coalesce rapid bursts into a single rAF-batched notification. */
function scheduleNotify() {
  if (_rafId) return
  _rafId = requestAnimationFrame(() => {
    _rafId = 0
    // Pass a stable reference — listeners should not mutate it
    for (const fn of _listeners) fn(_log)
  })
}

/**
 * @param {Omit<ActivityEntry, 'id' | 'timestamp'>} entry
 * @returns {ActivityEntry}
 */
export function recordActivity(entry) {
  const full = /** @type {ActivityEntry} */ ({
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    ...entry,
  })
  _log.unshift(full)
  if (_log.length > MAX_ENTRIES) _log.length = MAX_ENTRIES
  scheduleNotify()
  return full
}

/** @returns {ActivityEntry[]} */
export function getActivityLog() {
  return _log
}

export function clearActivityLog() {
  _log.length = 0
  scheduleNotify()
}

/**
 * Subscribe to log updates. The callback receives the same array reference
 * every time — do not mutate it. Returns an unsubscribe function.
 * @param {(entries: ActivityEntry[]) => void} fn
 * @returns {() => void}
 */
export function subscribeActivityLog(fn) {
  _listeners = [..._listeners, fn]
  fn(_log)
  return () => {
    _listeners = _listeners.filter((l) => l !== fn)
  }
}
