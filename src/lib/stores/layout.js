const STORAGE_KEY = 'db-studio:layout'

/** @typedef {'normal' | 'json'} InspectorView */

/** @typedef {{ navSidebarWidth: number, navSidebarOpen: boolean, inspectorWidth: number, inspectorView: InspectorView, sqlEditorHeight: number }} PanelLayout */

export const DEFAULT_LAYOUT = {
  navSidebarWidth: 220,
  navSidebarOpen: true,
  inspectorWidth: 300,
  inspectorView: 'normal',
  sqlEditorHeight: 320,
}

export const NAV_SIDEBAR_MIN = 180
export const NAV_SIDEBAR_MAX = 420
export const INSPECTOR_MIN = 220
export const INSPECTOR_MAX = 640
export const SQL_EDITOR_MIN = 120
export const SQL_EDITOR_RESULTS_MIN = 120

/** @param {number} width */
export function clampNavSidebarWidth(width) {
  return Math.round(Math.min(NAV_SIDEBAR_MAX, Math.max(NAV_SIDEBAR_MIN, width)))
}

/** @param {number} width */
export function clampInspectorWidth(width) {
  return Math.round(Math.min(INSPECTOR_MAX, Math.max(INSPECTOR_MIN, width)))
}

/** @param {number} height @param {number} [containerHeight] */
export function clampSqlEditorHeight(height, containerHeight = 0) {
  const max =
    containerHeight > 0
      ? Math.max(SQL_EDITOR_MIN, containerHeight - SQL_EDITOR_RESULTS_MIN)
      : 720
  return Math.round(Math.min(max, Math.max(SQL_EDITOR_MIN, height)))
}

/** @returns {PanelLayout} */
export function loadLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_LAYOUT }
    const parsed = JSON.parse(raw)
    let navSidebarWidth = Number(parsed.navSidebarWidth)
    let inspectorWidth = Number(parsed.inspectorWidth)
    let sqlEditorHeight = Number(parsed.sqlEditorHeight)
    if (!Number.isFinite(navSidebarWidth)) navSidebarWidth = DEFAULT_LAYOUT.navSidebarWidth
    if (!Number.isFinite(inspectorWidth)) inspectorWidth = DEFAULT_LAYOUT.inspectorWidth
    if (!Number.isFinite(sqlEditorHeight)) sqlEditorHeight = DEFAULT_LAYOUT.sqlEditorHeight
    const inspectorView = parsed.inspectorView === 'json' ? 'json' : 'normal'
    const navSidebarOpen = parsed.navSidebarOpen !== false
    return {
      navSidebarWidth: clampNavSidebarWidth(navSidebarWidth),
      navSidebarOpen,
      inspectorWidth: clampInspectorWidth(inspectorWidth),
      inspectorView,
      sqlEditorHeight: clampSqlEditorHeight(sqlEditorHeight),
    }
  } catch {
    return { ...DEFAULT_LAYOUT }
  }
}

/** @param {Partial<PanelLayout>} patch */
export function saveLayout(patch) {
  const next = { ...loadLayout(), ...patch }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  return next
}
