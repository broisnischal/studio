/** @typedef {'table' | 'sql' | 'welcome'} StudioTabKind */

/** @typedef {object} TableTabState
 * @property {string} schema
 * @property {string | null} table
 * @property {number} page
 * @property {Array<{ name: string, dataType?: string }>} columns
 * @property {string[]} primaryKey
 * @property {unknown[][]} rows
 * @property {number} total
 * @property {number} queryMs
 * @property {boolean} loadingRows
 * @property {string} error
 * @property {Set<number>} selected
 * @property {number | null} focusedRow
 * @property {number | null} inspectorRow
 * @property {{ rowIdx: number, colIdx: number, draft: string, original: string } | null} editingCell
 * @property {boolean} savingCell
 */

/** @typedef {object} SqlTabState
 * @property {string} sqlText
 * @property {Array<{ name: string, dataType?: string }>} sqlColumns
 * @property {unknown[][]} sqlRows
 * @property {number} sqlQueryMs
 * @property {string} sqlMessage
 * @property {boolean} sqlLoading
 * @property {string} sqlError
 */

/** @typedef {object} StudioTab
 * @property {string} id
 * @property {StudioTabKind} kind
 * @property {string} title
 * @property {TableTabState | SqlTabState | null} state
 */

let tabSeq = 0

export function nextTabId() {
  tabSeq += 1
  return `tab-${tabSeq}`
}

/** @param {TableTabState} state */
export function cloneTableTabState(state) {
  return {
    ...state,
    columns: [...state.columns],
    primaryKey: [...state.primaryKey],
    rows: state.rows.map((r) => [...r]),
    selected: new Set(state.selected),
    editingCell: state.editingCell ? { ...state.editingCell } : null,
  }
}

/** @param {SqlTabState} state */
export function cloneSqlTabState(state) {
  return {
    ...state,
    sqlColumns: [...state.sqlColumns],
    sqlRows: state.sqlRows.map((r) => [...r]),
  }
}

/** @returns {TableTabState} */
export function createTableTabState(schema = 'public', table = null) {
  return {
    schema,
    table,
    page: 1,
    columns: [],
    primaryKey: [],
    rows: [],
    total: 0,
    queryMs: 0,
    loadingRows: false,
    error: '',
    selected: new Set(),
    focusedRow: null,
    inspectorRow: null,
    editingCell: null,
    savingCell: false,
  }
}

/** @returns {SqlTabState} */
export function createSqlTabState(sqlText = 'SELECT 1;') {
  return {
    sqlText,
    sqlColumns: [],
    sqlRows: [],
    sqlQueryMs: 0,
    sqlMessage: '',
    sqlLoading: false,
    sqlError: '',
  }
}

/** @param {string} [schema] @param {string | null} [table] */
export function createTableTab(schema = 'public', table = null) {
  const state = createTableTabState(schema, table)
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'table',
    title: tableTabTitle(state),
    state,
  })
}

/** @param {string} [sqlText] */
export function createSqlTab(sqlText) {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'sql',
    title: 'SQL',
    state: createSqlTabState(sqlText),
  })
}

export function createWelcomeTab() {
  return /** @type {StudioTab} */ ({
    id: nextTabId(),
    kind: 'welcome',
    title: 'New tab',
    state: null,
  })
}

/** @param {TableTabState} state */
export function tableTabTitle(state) {
  if (!state.table) return 'Table'
  return state.schema ? `${state.schema}.${state.table}` : state.table
}

/** @param {StudioTab} tab */
export function tabDisplayTitle(tab) {
  if (tab.kind === 'table' && tab.state) return tableTabTitle(/** @type {TableTabState} */ (tab.state))
  if (tab.kind === 'sql') return 'SQL'
  return tab.title
}

/** @param {StudioTab[]} tabs @param {string} schema @param {string} table */
export function findTableTab(tabs, schema, table) {
  return tabs.find(
    (t) =>
      t.kind === 'table' &&
      t.state &&
      /** @type {TableTabState} */ (t.state).schema === schema &&
      /** @type {TableTabState} */ (t.state).table === table,
  )
}

/** @param {StudioTab[]} tabs */
export function findSqlTab(tabs) {
  return tabs.find((t) => t.kind === 'sql') ?? null
}

/** @param {StudioTab[]} tabs */
export function findLastTableTab(tabs) {
  for (let i = tabs.length - 1; i >= 0; i -= 1) {
    if (tabs[i].kind === 'table') return tabs[i]
  }
  return null
}

/** @param {StudioTab[]} tabs @param {number} fromIndex @param {1 | -1} direction */
export function cycleTabIndex(tabs, fromIndex, direction) {
  if (tabs.length === 0) return -1
  return (fromIndex + direction + tabs.length) % tabs.length
}
