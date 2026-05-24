<script>
  import { onMount, onDestroy, untrack } from 'svelte'
  import Database from '@lucide/svelte/icons/database'
  import { createHotkey } from '@tanstack/svelte-hotkeys'
  import { cycleTheme, restorePreviousTheme } from '$lib/stores/settings.js'
  import { toast } from 'svelte-sonner'
  import Sidebar from './Sidebar.svelte'
  import TabBar from './TabBar.svelte'
  import TableToolbar from './TableToolbar.svelte'
  import DataTable from './DataTable.svelte'
  import RowDetailPanel from './RowDetailPanel.svelte'
  import SqlConsole from './SqlConsole.svelte'
  import CommandPalette from './CommandPalette.svelte'
  import AiChat from './AiChat.svelte'
  import ConnectionModal from './ConnectionModal.svelte'
  import SettingsDialog from './SettingsDialog.svelte'
  import KeyboardShortcutsDialog from './KeyboardShortcutsDialog.svelte'
  import InsiderDialog from './InsiderDialog.svelte'
  import UpdateDialog from './UpdateDialog.svelte'
  import InsertRowDialog from './InsertRowDialog.svelte'
  import McpPanel from './McpPanel.svelte'
  import OrmRunner from './OrmRunner.svelte'
  import SchemaPage from './SchemaPage.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Alert from '$lib/components/ui/alert/index.js'
  import {
    disconnectPostgres,
    listSchemas,
    listTables,
    getTableRows,
    executeSql,
    updateTableCell,
    deleteTableRows,
    insertTableRow,
    toggleDevtools,
    mcpStart,
    mcpStop,
  } from '$lib/api.js'
  import {
    createTableTab,
    createSqlTab,
    createWelcomeTab,
    createAiTab,
    createSchemaTab,
    createOrmTab,
    findTableTab,
    findSqlTab,
    findAiTab,
    findSchemaTab,
    findOrmTab,
    findLastTableTab,
    tableTabTitle,
    cycleTabIndex,
    cloneTableTabState,
    cloneSqlTabState,
  } from '$lib/studio-tabs.js'
  import { formatCompactCount, normalizeTableRowCount } from '$lib/table-list.js'
  import {
    DEFAULT_PAGE_SIZE,
    MAX_PAGE_SIZE,
    activeFilters,
    filtersApiSignature,
    filtersForApi,
    sortForApi,
  } from '$lib/table-query.js'
  import {
    buildForeignKeyFilters,
    findForeignKeyForColumn,
    normalizeForeignKeys,
  } from '$lib/foreign-key-nav.js'
  import { loadLayout, saveLayout } from '$lib/stores/layout.js'
  import {
    getLastConnection,
    loadSavedConnections,
    setLastConnectionId,
    upsertConnection,
  } from '$lib/stores/connections.js'
  import {
    connectPostgres,
    connectSqlite,
    connectD1,
    listIndexes,
    listEnums,
  } from '$lib/api.js'
  import {
    remapNullableRowIndex,
    remapRowIndexSet,
  } from '$lib/table-row-indices.js'
  import { rowsToCsv, rowsToJson, saveExportFile, buildExportFilename } from '$lib/export.js'
  import {
    recordQueryExecution,
    listQueryHistory,
    listSavedQueries,
    createSavedQuery,
  } from '$lib/stores/query-history.js'

  /** @typedef {import('$lib/studio-tabs.js').StudioTab} StudioTab */
  /** @typedef {import('$lib/studio-tabs.js').TableTabState} TableTabState */
  /** @typedef {import('$lib/studio-tabs.js').SqlTabState} SqlTabState */
  /** @typedef {import('$lib/table-query.js').TableSort} TableSort */
  /** @typedef {import('$lib/table-query.js').TableFilter} TableFilter */
  /** @typedef {import('$lib/foreign-key-nav.js').ForeignKeyInfo} ForeignKeyInfo */

  const SEARCH_DEBOUNCE_MS = 300
  const COLUMNS_CACHE_MAX = 60

  /** @param {Map<string, unknown>} map @param {string} key @param {unknown} value */
  function lruSet(map, key, value) {
    if (map.has(key)) map.delete(key)
    map.set(key, value)
    if (map.size > COLUMNS_CACHE_MAX) map.delete(/** @type {string} */ (map.keys().next().value))
  }

  let connection = $state(null)
  let autoConnecting = $state(false)
  let showConnectionModal = $state(false)
  let savedConnections = $state(loadSavedConnections())
  let showSettingsModal = $state(false)
  let showShortcutsModal = $state(false)
  let showInsiderModal = $state(false)
  let commandOpen = $state(false)
  /** @type {import('./UpdateDialog.svelte').default | null} */
  let updateDialog = $state(null)
  let sidebarOpen = $state(loadLayout().navSidebarOpen)

  /** @type {StudioTab[]} */
  let tabs = $state([])
  let activeTabId = $state(/** @type {string | null} */ (null))

  let schemas = $state([])
  let activeSchema = $state('public')
  let tables = $state([])
  let indexes = $state([])
  /** @type {{ name: string, values: string[] }[]} */
  let enums = $state([])
  let activeTable = $state(/** @type {string | null} */ (null))
  let tableFilter = $state('')
  let loadingTables = $state(false)

  let columns = $state([])
  /** @type {Set<string>} */
  let hiddenColumns = $state(new Set())
  /** @type {Map<string, typeof columns>} */
  let tableColumnsCache = $state(new Map())
  let primaryKey = $state([])
  /** @type {ForeignKeyInfo[]} */
  let foreignKeys = $state([])
  let rows = $state([])
  let savingCell = $state(false)
  let deletingRows = $state(false)
  let insertRowOpen = $state(false)
  let insertingRow = $state(false)
  let showMcpPanel = $state(false)
  let mcpRunning = $state(false)
  /** @type {{ rowIdx: number, colIdx: number, draft: string } | null} */
  let editingCell = $state(null)
  let total = $state(0)
  let queryMs = $state(0)
  let loadingRows = $state(false)
  let page = $state(1)
  let pageSize = $state(DEFAULT_PAGE_SIZE)
  let rawOffset = $state(/** @type {number | null} */ (null))
  const currentOffset = $derived(rawOffset ?? (page - 1) * pageSize)
  let rowSearch = $state('')
  let rowSort = $state(/** @type {TableSort | null} */ (null))
  let rowFilters = $state(/** @type {TableFilter[]} */ ([]))
  /** @type {{ focusRowSearch?: () => void } | null} */
  let tableToolbar = $state(null)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let filterDebounceTimer = null
  onDestroy(() => {
    if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
  })


  /** Tracks which tab IDs currently have an in-flight background fetch. */
  const fetchingTabIds = new Set()
  let error = $state('')
  let selected = $state(new Set())
  /** @type {number | null} */
  let focusedRow = $state(null)
  /** @type {number | null} */
  let inspectorRow = $state(null)

  let sqlText = $state('SELECT 1;')
  let sqlColumns = $state([])
  let sqlRows = $state([])
  let sqlQueryMs = $state(0)
  let sqlMessage = $state('')
  let sqlLoading = $state(false)
  let sqlError = $state('')

  let ormCode = $state('')
  let ormMode = $state(/** @type {'drizzle' | 'prisma'} */ ('drizzle'))
  let ormColumns = $state([])
  let ormRows = $state([])
  let ormQueryMs = $state(0)
  let ormLoading = $state(false)
  let ormError = $state('')

  const activeTab = $derived(tabs.find((t) => t.id === activeTabId) ?? null)

  const activeView = $derived(activeTab?.kind === 'sql' ? 'sql' : 'table')

  const sqlSchemaHints = $derived.by(() => {
    /** @type {Record<string, string[]>} */
    const columnsByTable = {}
    // Include all browsed tables so completion works across the whole schema
    for (const [key, cols] of tableColumnsCache) {
      columnsByTable[key] = cols.map((c) => c.name)
    }
    // Active table columns always override the cache with the freshest data
    if (activeTable && columns.length) {
      const cols = columns.map((c) => c.name)
      columnsByTable[activeTable] = cols
      columnsByTable[`${activeSchema}.${activeTable}`] = cols
    }
    if (sqlColumns.length) {
      columnsByTable.__result__ = sqlColumns.map((c) => c.name)
    }
    return {
      schemas: [...schemas],
      activeSchema,
      tables: tables.map((t) => t.name),
      columnsByTable,
    }
  })

  const connectionId = $derived(
    connection
      ? `${connection.host}:${connection.port}/${connection.database}@${connection.user}`
      : '',
  )

  // ID of the currently-active saved connection (for highlighting in the palette)
  const activeConnectionId = $derived(
    connection
      ? (savedConnections.find((c) => {
          if (c.type === 'sqlite') return c.filePath === connection.filePath
          if (c.type === 'd1') return c.databaseId === connection.databaseId && c.accountId === connection.accountId
          return c.host === connection.host && c.database === connection.database && c.user === connection.user
        })?.id ?? '')
      : '',
  )

  const persistConnectionId = $derived(activeConnectionId || connectionId)

  const QUERY_HISTORY_OPEN_KEY = 'db-studio:query-history-open'
  function loadQueryHistoryPref() {
    try {
      return localStorage.getItem(QUERY_HISTORY_OPEN_KEY) === '1'
    } catch {
      return false
    }
  }

  /** @type {import('$lib/stores/query-history.js').QueryHistoryEntry[]} */
  let queryHistory = $state([])
  /** @type {import('$lib/stores/query-history.js').SavedQuery[]} */
  let savedQueries = $state([])
  let queryHistoryVisible = $state(loadQueryHistoryPref())

  async function refreshQueryStores() {
    if (!persistConnectionId) {
      queryHistory = []
      savedQueries = []
      return
    }
    const [history, saved] = await Promise.all([
      listQueryHistory(persistConnectionId),
      listSavedQueries(persistConnectionId),
    ])
    queryHistory = history
    savedQueries = saved
  }

  $effect(() => {
    queryHistoryVisible
    try {
      localStorage.setItem(QUERY_HISTORY_OPEN_KEY, queryHistoryVisible ? '1' : '0')
    } catch {
      /* ignore */
    }
  })

  $effect(() => {
    if (commandOpen && persistConnectionId) void refreshQueryStores()
  })

  const aiSchemaContext = $derived.by(() => ({
    schemas: [...schemas],
    activeSchema,
    tables: tables.map((t) => ({ name: t.name, rowCount: t.rowCount })),
    activeTable,
    columns: columns.map((c) => ({
      name: c.name,
      dataType: c.dataType ?? c.data_type ?? '',
      nullable: c.nullable ?? true,
      enumValues: c.enumValues ?? c.enum_values ?? undefined,
    })),
    primaryKey: [...primaryKey],
    foreignKeys: foreignKeys.map((fk) => ({ ...fk })),
    /** @type {Record<string, { name: string, dataType: string, nullable: boolean, enumValues?: string[] }[]>} */
    allTableColumns: Object.fromEntries(
      untrack(() => [...tableColumnsCache.entries()]).map(([key, cols]) => [
        key,
        cols.map((c) => ({
          name: c.name,
          dataType: c.dataType ?? c.data_type ?? '',
          nullable: c.nullable ?? true,
          enumValues: c.enumValues ?? c.enum_values ?? undefined,
        })),
      ]),
    ),
    /** @type {'postgres' | 'sqlite' | 'd1'} */
    dbType: /** @type {any} */ (connection)?.type ?? 'postgres',
  }))

  const inspectorTarget = $derived.by(() => {
    if (activeTab?.kind !== 'table') return null
    if (inspectorRow !== null) {
      return { kind: 'row', rowIdx: inspectorRow }
    }
    return null
  })

  const activeTabIndex = $derived(
    activeTabId ? tabs.findIndex((t) => t.id === activeTabId) : -1,
  )

  /** @returns {TableTabState} */
  function captureTableSnapshot() {
    return {
      schema: activeSchema,
      table: activeTable,
      page,
      pageSize,
      rowSearch,
      rowSort: rowSort ? { ...rowSort } : null,
      rowFilters: rowFilters.map((f) => ({ ...f })),
      columns,
      primaryKey,
      foreignKeys,
      rows,
      total,
      queryMs,
      loadingRows: false,
      error,
      selected: new Set(selected),
      focusedRow,
      inspectorRow,
      editingCell: editingCell ? { ...editingCell } : null,
      savingCell: false,
      hiddenColumns: new Set(hiddenColumns),
    }
  }

  /** @param {TableTabState} s */
  function applyTableSnapshot(s) {
    page = s.page
    pageSize = s.pageSize ?? DEFAULT_PAGE_SIZE
    rowSearch = s.rowSearch ?? ''
    rowSort = s.rowSort ? { ...s.rowSort } : null
    rowFilters = (s.rowFilters ?? []).map((f) => ({ ...f }))
    columns = s.columns
    primaryKey = s.primaryKey
    foreignKeys = s.foreignKeys ?? []
    rows = s.rows
    total = s.total
    queryMs = s.queryMs
    loadingRows = s.loadingRows ?? false
    error = s.error
    selected = new Set(s.selected)
    focusedRow = s.focusedRow
    inspectorRow = s.inspectorRow ?? null
    editingCell = s.editingCell ? { ...s.editingCell } : null
    savingCell = false
    activeTable = s.table
    hiddenColumns = new Set(s.hiddenColumns)
  }

  /** @returns {SqlTabState} */
  function captureSqlSnapshot() {
    return {
      sqlText,
      sqlColumns,
      sqlRows,
      sqlQueryMs,
      sqlMessage,
      sqlLoading: false,
      sqlError,
    }
  }

  /** @param {SqlTabState} s */
  function applySqlSnapshot(s) {
    sqlText = s.sqlText
    sqlColumns = s.sqlColumns
    sqlRows = s.sqlRows
    sqlQueryMs = s.sqlQueryMs
    sqlMessage = s.sqlMessage
    sqlLoading = false
    sqlError = s.sqlError
  }

  function clearTableEditor() {
    activeTable = null
    page = 1
    pageSize = DEFAULT_PAGE_SIZE
    rowSearch = ''
    rowSort = null
    rowFilters = []
    columns = []
    primaryKey = []
    foreignKeys = []
    rows = []
    total = 0
    queryMs = 0
    loadingRows = false
    error = ''
    selected = new Set()
    focusedRow = null
    inspectorRow = null
    editingCell = null
    savingCell = false
  }

  function saveActiveTabState() {
    if (!activeTabId) return
    tabs = tabs.map((t) => {
      if (t.id !== activeTabId) return t
      if (t.kind === 'table') {
        const state = cloneTableTabState(captureTableSnapshot())
        return { ...t, state, title: tableTabTitle(state) }
      }
      if (t.kind === 'sql') {
        return { ...t, state: cloneSqlTabState(captureSqlSnapshot()) }
      }
      return t
    })
  }

  /** @param {StudioTab} tab */
  async function applyTabToEditor(tab) {
    if (tab.kind === 'welcome' || tab.kind === 'ai' || tab.kind === 'schema' || tab.kind === 'orm') {
      clearTableEditor()
      return
    }
    if (tab.kind === 'sql' && tab.state) {
      clearTableEditor()
      applySqlSnapshot(cloneSqlTabState(/** @type {SqlTabState} */ (tab.state)))
      return
    }
    if (tab.kind === 'table' && tab.state) {
      const s = cloneTableTabState(/** @type {TableTabState} */ (tab.state))
      if (s.schema && s.schema !== activeSchema) {
        activeSchema = s.schema
        await loadTables()
      }
      applyTableSnapshot(s)
      if (s.table && !fetchingTabIds.has(tab.id) && s.columns.length === 0) {
        // No background fetch in flight and no cached data — kick one off
        void fetchRowsForTab(tab.id)
      }
    }
  }

  // F12 or Ctrl/Cmd+Shift+I → toggle DevTools (no-op in release builds)
  createHotkey('F12', (e) => { e.preventDefault(); void toggleDevtools() })
  createHotkey('Mod+Shift+I', (e) => { e.preventDefault(); void toggleDevtools() })

  createHotkey('Mod+K', (e) => {
    e.preventDefault()
    commandOpen = true
  })

  createHotkey('Mod+Shift+A', (e) => {
    if (!connection) return
    e.preventDefault()
    openAiTab()
  })

  createHotkey('Mod+F', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal) return
    if (activeTab?.kind !== 'table' || !activeTable) return
    e.preventDefault()
    tableToolbar?.focusRowSearch?.()
  })

  createHotkey('Mod+Enter', (e) => {
    if (activeTab?.kind !== 'sql' || !connection) return
    e.preventDefault()
    runSql()
  })

  createHotkey('Mod+W', (e) => {
    if (!connection || !activeTabId) return
    e.preventDefault()
    closeTab(activeTabId)
  })

  createHotkey('Mod+T', (e) => {
    if (!connection) return
    e.preventDefault()
    openWelcomeTab()
  })

  createHotkey('Mod+Tab', (e) => {
    if (!connection || tabs.length < 2) return
    e.preventDefault()
    cycleTab(1)
  })

  createHotkey('Mod+Shift+Tab', (e) => {
    if (!connection || tabs.length < 2) return
    e.preventDefault()
    cycleTab(-1)
  })

  createHotkey('Alt+Tab', (e) => {
    if (!connection || tabs.length < 2) return
    e.preventDefault()
    cycleTab(1)
  })

  createHotkey('Alt+Shift+Tab', (e) => {
    if (!connection || tabs.length < 2) return
    e.preventDefault()
    cycleTab(-1)
  })

  createHotkey('Mod+B', (e) => {
    e.preventDefault()
    toggleSidebar()
  })

  createHotkey('Mod+M', (e) => {
    e.preventDefault()
    cycleTheme()
  })

  createHotkey('Mod+Shift+M', (e) => {
    e.preventDefault()
    restorePreviousTheme()
  })

  createHotkey('Mod+Shift+D', (e) => {
    if (!connection) return
    e.preventDefault()
    void focusDataView()
  })

  createHotkey('Mod+Shift+S', (e) => {
    if (!connection) return
    e.preventDefault()
    void focusSqlView()
  })

  createHotkey('Mod+Shift+O', (e) => {
    if (!connection) return
    e.preventDefault()
    openOrmTab()
  })

  createHotkey('Mod+Shift+E', (e) => {
    if (!connection) return
    e.preventDefault()
    openSchemaTab()
  })

  createHotkey('Mod+Shift+F', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal) return
    e.preventDefault()
    const el = document.querySelector('[data-sidebar-filter]')
    if (el instanceof HTMLElement) {
      if (!sidebarOpen) toggleSidebar()
      el.focus()
    }
  })

  createHotkey('Escape', (e) => {
    if (commandOpen) {
      e.preventDefault()
      commandOpen = false
      return
    }
    if (showShortcutsModal) {
      e.preventDefault()
      showShortcutsModal = false
      return
    }
    if (showConnectionModal || showSettingsModal) return
    if (editingCell) {
      e.preventDefault()
      editingCell = null
      return
    }
    if (!inspectorTarget) return
    e.preventDefault()
    closeInspector()
  })

  createHotkey('Mod+Backspace', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal) return
    // Ctrl+Backspace is the word-delete shortcut in inputs/textareas — don't steal it
    const el = document.activeElement
    if (
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      (el instanceof HTMLElement && el.isContentEditable)
    ) return
    if (activeTab?.kind !== 'table' || !activeTable || selected.size === 0) return
    e.preventDefault()
    void deleteSelectedRows()
  })

  createHotkey('Mod+R', (e) => {
    if (!connection) return
    if (commandOpen || showConnectionModal || showSettingsModal) return
    e.preventDefault()
    void handleModRefresh()
  })

  // Ctrl+Arrow (Windows/Linux) or Cmd+Arrow (Mac) for pagination.
  // Uses a raw listener instead of createHotkey because:
  //   1. macOS intercepts Ctrl+Arrow at the OS level for Mission Control.
  //   2. Raw listeners read current reactive signal values at call time.
  $effect(() => {
    /** @param {KeyboardEvent} e */
    function onPaginationKey(e) {
      const mod = e.ctrlKey || e.metaKey
      if (!mod || e.shiftKey || e.altKey) return
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
      if (commandOpen || showConnectionModal || showSettingsModal) return
      if (activeTab?.kind !== 'table' || !activeTable) return
      const el = document.activeElement
      if (
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLElement && el.isContentEditable)
      ) return
      if (e.key === 'ArrowLeft') {
        if (page <= 1) return
        e.preventDefault()
        void handlePageChange(page - 1)
      } else {
        if (page * pageSize >= total) return
        e.preventDefault()
        void handlePageChange(page + 1)
      }
    }
    document.addEventListener('keydown', onPaginationKey)
    return () => document.removeEventListener('keydown', onPaginationKey)
  })

  // F11 (all platforms) and Cmd+Ctrl+F (macOS standard) for fullscreen toggle.
  $effect(() => {
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    if (!isTauri) return
    /** @param {KeyboardEvent} e */
    async function onFullscreenKey(e) {
      const isF11 = e.key === 'F11' && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey
      const isMacFullscreen = e.key === 'f' && e.metaKey && e.ctrlKey && !e.shiftKey && !e.altKey
      if (!isF11 && !isMacFullscreen) return
      e.preventDefault()
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window')
        const win = getCurrentWindow()
        const current = await win.isFullscreen()
        await win.setFullscreen(!current)
      } catch { /* ignore */ }
    }
    document.addEventListener('keydown', onFullscreenKey)
    return () => document.removeEventListener('keydown', onFullscreenKey)
  })

  createHotkey('?', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal || showShortcutsModal) return
    const tag = document.activeElement?.tagName ?? ''
    if (tag === 'INPUT' || tag === 'TEXTAREA') return
    e.preventDefault()
    showShortcutsModal = true
  })

  createHotkey('Mod+I', (e) => {
    if (commandOpen || showConnectionModal || showSettingsModal) return
    e.preventDefault()
    showInsiderModal = !showInsiderModal
  })

  /** @returns {boolean} */
  function isFocusInRegion(region) {
    const el = document.activeElement
    if (!el || !(el instanceof HTMLElement)) return false
    return !!el.closest(`[data-studio-region="${region}"]`)
  }

  async function handleModRefresh() {
    if (isFocusInRegion('sidebar')) {
      await loadTables()
      return
    }
    if (activeTab?.kind === 'sql') {
      await runSql()
      return
    }
    if (activeTab?.kind === 'table' && activeTable) {
      await loadRows()
      return
    }
    await loadTables()
  }

  function closeInspector() {
    focusedRow = null
    inspectorRow = null
    selected = new Set()
    editingCell = null
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen
    saveLayout({ navSidebarOpen: sidebarOpen })
  }

  /** @param {1 | -1} direction */
  function cycleTab(direction) {
    const idx = cycleTabIndex(tabs, activeTabIndex, direction)
    if (idx < 0) return
    void activateTab(tabs[idx].id)
  }

  function resetTabs() {
    tabs = []
    activeTabId = null
    clearTableEditor()
    sqlText = 'SELECT 1;'
    sqlColumns = []
    sqlRows = []
    sqlQueryMs = 0
    sqlMessage = ''
    sqlLoading = false
    sqlError = ''
  }

  function openWelcomeTab() {
    saveActiveTabState()
    const tab = createWelcomeTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function dropWelcomeTabs() {
    tabs = tabs.filter((t) => t.kind !== 'welcome')
  }

  function openSqlTab() {
    saveActiveTabState()
    dropWelcomeTabs()
    const existing = findSqlTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    const tab = createSqlTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
    applySqlSnapshot(cloneSqlTabState(/** @type {SqlTabState} */ (tab.state)))
  }

  function openAiTab() {
    const existing = findAiTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createAiTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openSchemaTab() {
    const existing = findSchemaTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createSchemaTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  function openOrmTab() {
    const existing = findOrmTab(tabs)
    if (existing) {
      void activateTab(existing.id)
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createOrmTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
  }

  /** @param {{ sql: string, mode: string }} detail */
  async function runOrm(detail) {
    if (!connection || !detail.sql.trim()) return
    ormLoading = true
    ormError = ''
    ormColumns = []
    ormRows = []
    try {
      const data = await executeSql(detail.sql)
      ormColumns = data.columns ?? []
      ormRows = data.rows ?? []
      ormQueryMs = data.queryMs ?? data.query_ms ?? 0
    } catch (e) {
      ormError = String(e)
    } finally {
      ormLoading = false
    }
  }

  /** @param {string} id */
  async function activateTab(id) {
    if (id === activeTabId) return
    saveActiveTabState()
    activeTabId = id
    const tab = tabs.find((t) => t.id === id)
    if (tab) await applyTabToEditor(tab)
  }

  /** @param {string} id */
  async function closeTab(id) {
    const idx = tabs.findIndex((t) => t.id === id)
    if (idx < 0) return
    const nextTabs = tabs.filter((t) => t.id !== id)
    if (nextTabs.length === 0) {
      tabs = [createWelcomeTab()]
      activeTabId = tabs[0].id
      clearTableEditor()
      return
    }
    tabs = nextTabs
    if (activeTabId === id) {
      const nextIdx = Math.min(idx, nextTabs.length - 1)
      await activateTab(nextTabs[nextIdx].id)
    }
  }

  /** @param {string} id — keep only this tab, close everything else */
  async function closeOtherTabs(id) {
    const keep = tabs.find((t) => t.id === id)
    if (!keep) return
    tabs = [keep]
    await activateTab(keep.id)
  }

  async function closeAllTabs() {
    tabs = [createWelcomeTab()]
    activeTabId = tabs[0].id
    clearTableEditor()
  }

  /**
   * @param {string} schema
   * @param {string} table
   * @param {{ filters?: TableFilter[], resetQuery?: boolean }} [options]
   */
  async function openTableTab(schema, table, options = {}) {
    const { filters = null, resetQuery = false } = options
    const existing = findTableTab(tabs, schema, table)
    if (existing) {
      await activateTab(existing.id)
      if (filters) {
        if (resetQuery) {
          rowSearch = ''
          rowSort = null
        }
        rowFilters = filters.map((f) => ({ ...f }))
        page = 1
        await loadRows()
      } else if (activeTable === table && columns.length === 0) {
        await loadRows()
      }
      return
    }
    saveActiveTabState()
    dropWelcomeTabs()
    const tab = createTableTab(schema, table)
    // Pre-bake any filters/search into the tab state before fetching
    if (tab.state && filters) {
      /** @type {TableTabState} */ (tab.state).rowFilters = filters.map((f) => ({ ...f }))
    }
    tabs = [...tabs, tab]
    activeTabId = tab.id
    activeTable = table
    page = 1
    pageSize = DEFAULT_PAGE_SIZE
    rowSearch = ''
    rowSort = null
    rowFilters = filters ? filters.map((f) => ({ ...f })) : []
    columns = []
    primaryKey = []
    foreignKeys = []
    rows = []
    total = 0
    queryMs = 0
    error = ''
    selected = new Set()
    focusedRow = null
    inspectorRow = null
    editingCell = null
    if (schema !== activeSchema) {
      activeSchema = schema
      await loadTables()
    }
    // Fire the fetch in background — caller can open more tabs without waiting
    void fetchRowsForTab(tab.id)
  }

  /** @param {{ rowIdx: number, colIdx: number }} detail */
  async function handleFollowForeignKey({ rowIdx, colIdx }) {
    const col = columns[colIdx]
    if (!col) return
    const fk = findForeignKeyForColumn(foreignKeys, col.name)
    if (!fk) return
    const row = rows[rowIdx]
    if (!row) return
    const filters = buildForeignKeyFilters(fk, columns, row)
    if (!filters) {
      toast.error('Cannot open reference', {
        description: 'Foreign key value is NULL or incomplete.',
      })
      return
    }
    const refSchema = fk.referencedSchema || activeSchema
    await openTableTab(refSchema, fk.referencedTable, { filters, resetQuery: true })
  }

  async function loadSchemas() {
    const list = await listSchemas()
    schemas = list
    if (list.length === 0) {
      activeSchema = ''
      return
    }
    if (!list.includes(activeSchema)) {
      activeSchema = list.includes('public') ? 'public' : list[0]
    }
  }

  async function loadIndexes() {
    if (!activeSchema) { indexes = []; return }
    try {
      const list = await listIndexes(activeSchema)
      indexes = list
        .map((i) => ({
          name: i.name ?? '',
          tableName: i.tableName ?? i.table_name ?? '',
          columns: i.columns ?? '',
          indexType: i.indexType ?? i.index_type ?? 'btree',
          isUnique: i.isUnique ?? i.is_unique ?? false,
          isPrimary: i.isPrimary ?? i.is_primary ?? false,
        }))
        .filter((i) => i.name)
    } catch {
      indexes = []
    }
  }

  async function loadEnums() {
    if (!activeSchema) { enums = []; return }
    try {
      const list = await listEnums(activeSchema)
      enums = list.map((e) => ({ name: e.name ?? '', values: e.values ?? [] }))
    } catch {
      enums = []
    }
  }

  async function loadTables() {
    if (!activeSchema) {
      tables = []
      return
    }
    loadingTables = true
    error = ''
    try {
      const list = await listTables(activeSchema)
      tables = list
        .map((t) => ({
          name: t.name ?? t.table_name ?? '',
          rowCount: normalizeTableRowCount(t.rowCount ?? t.row_count),
          kind: t.kind ?? 'table',
        }))
        .filter((t) => t.name)
      if (activeTable && !tables.find((t) => t.name === activeTable)) {
        activeTable = tables[0]?.name ?? null
      }
    } catch (e) {
      error = String(e)
      tables = []
    } finally {
      loadingTables = false
    }
    void loadIndexes()
    void loadEnums()
  }

  async function reloadTableFromQuery(resetPage = true) {
    if (resetPage) { page = 1; rawOffset = null }
    await loadRows()
  }

  /** @param {string} value */
  function handleRowSearchChange(value) {
    rowSearch = value
    page = 1
    rawOffset = null
    void loadRows()
  }

  /** @param {TableFilter[]} filters */
  function handleRowFiltersChange(filters) {
    const prevSig = filtersApiSignature(rowFilters)
    rowFilters = filters
    const nextSig = filtersApiSignature(filters)
    if (prevSig === nextSig) return

    page = 1
    if (filterDebounceTimer) clearTimeout(filterDebounceTimer)
    filterDebounceTimer = setTimeout(() => {
      filterDebounceTimer = null
      void loadRows()
    }, SEARCH_DEBOUNCE_MS)
  }

  /** @param {TableSort | null} sort */
  async function handleRowSortChange(sort) {
    rowSort = sort
    await reloadTableFromQuery(true)
  }

  /** @param {number} size */
  async function handlePageSizeChange(size) {
    if (!Number.isFinite(size) || size <= 0) return
    pageSize = Math.min(size, MAX_PAGE_SIZE)
    await reloadTableFromQuery(true)
  }

  /** @param {number} nextPage */
  async function handlePageChange(nextPage) {
    rawOffset = null
    page = nextPage
    await loadRows()
  }

  /** @param {number} limit @param {number} offset */
  async function handleLimitOffsetChange(limit, offset) {
    const clampedLimit = Math.min(Math.max(1, limit), MAX_PAGE_SIZE)
    pageSize = clampedLimit
    rawOffset = offset
    page = Math.max(1, Math.floor(offset / clampedLimit) + 1)
    await loadRows()
  }

  /**
   * Fetch rows for any tab in the background.
   * Writes results into that tab's state; if the tab is still active when the
   * fetch resolves, also syncs to the global editor state so the UI updates.
   * @param {string} tabId
   */
  async function fetchRowsForTab(tabId) {
    if (fetchingTabIds.has(tabId)) return
    fetchingTabIds.add(tabId)

    const getTab = () => tabs.find((t) => t.id === tabId)
    const tab = getTab()
    if (!tab || tab.kind !== 'table' || !tab.state) {
      fetchingTabIds.delete(tabId)
      return
    }
    const s = /** @type {TableTabState} */ (tab.state)
    if (!s.table) {
      fetchingTabIds.delete(tabId)
      return
    }

    // Mark the tab itself as loading so switching to it shows a spinner
    tabs = tabs.map((t) =>
      t.id === tabId && t.kind === 'table'
        ? { ...t, state: { .../** @type {TableTabState} */ (t.state), loadingRows: true, error: '' } }
        : t,
    )
    if (tabId === activeTabId) { loadingRows = true; error = '' }

    try {
      const offset = (s.page - 1) * s.pageSize
      const { sortColumn, sortDirection } = sortForApi(s.rowSort)
      const data = await getTableRows(s.schema, s.table, s.pageSize, offset, {
        search: s.rowSearch,
        sortColumn,
        sortDirection,
        filters: filtersForApi(s.rowFilters),
      })

      const result = {
        columns: data.columns ?? [],
        primaryKey: data.primaryKey ?? data.primary_key ?? [],
        foreignKeys: normalizeForeignKeys(data.foreignKeys ?? data.foreign_keys),
        rows: data.rows ?? [],
        total: Number(data.total ?? 0),
        queryMs: Number(data.queryMs ?? data.query_ms ?? 0),
        loadingRows: false,
        error: '',
        selected: new Set(),
        focusedRow: null,
        inspectorRow: null,
        editingCell: null,
      }

      // Always persist to the tab's own state
      tabs = tabs.map((t) =>
        t.id === tabId && t.kind === 'table'
          ? { ...t, state: { .../** @type {TableTabState} */ (t.state), ...result } }
          : t,
      )

      // Update AI schema cache (LRU, capped)
      lruSet(tableColumnsCache, `${s.schema}.${s.table}`, result.columns)

      // Sync to global state only if this tab is still active
      if (tabId === activeTabId) {
        columns = result.columns
        primaryKey = result.primaryKey
        foreignKeys = result.foreignKeys
        rows = result.rows
        total = result.total
        queryMs = result.queryMs
        loadingRows = false
        error = ''
      }
    } catch (e) {
      const errStr = String(e)
      tabs = tabs.map((t) =>
        t.id === tabId && t.kind === 'table'
          ? {
              ...t,
              state: {
                .../** @type {TableTabState} */ (t.state),
                loadingRows: false,
                error: errStr,
                columns: [],
                rows: [],
                total: 0,
              },
            }
          : t,
      )
      if (tabId === activeTabId) {
        loadingRows = false
        error = errStr
        columns = []
        primaryKey = []
        foreignKeys = []
        rows = []
        total = 0
      }
    } finally {
      fetchingTabIds.delete(tabId)
    }
  }

  async function loadRows() {
    if (!activeTable) {
      columns = []
      rows = []
      total = 0
      return
    }
    loadingRows = true
    selected = new Set()
    focusedRow = null
    inspectorRow = null
    editingCell = null
    error = ''
    try {
      const offset = currentOffset
      const { sortColumn, sortDirection } = sortForApi(rowSort)
      const data = await getTableRows(activeSchema, activeTable, pageSize, offset, {
        search: rowSearch,
        sortColumn,
        sortDirection,
        filters: filtersForApi(rowFilters),
      })
      columns = data.columns ?? []
      if (activeTable) {
        lruSet(tableColumnsCache, `${activeSchema}.${activeTable}`, columns)
      }
      primaryKey = data.primaryKey ?? data.primary_key ?? []
      foreignKeys = normalizeForeignKeys(data.foreignKeys ?? data.foreign_keys)
      rows = data.rows ?? []
      total = Number(data.total ?? 0)
      queryMs = Number(data.queryMs ?? data.query_ms ?? 0)
      const maxPage = Math.max(1, Math.ceil(total / pageSize) || 1)
      if (page > maxPage) {
        page = maxPage
      }
    } catch (e) {
      error = String(e)
      columns = []
      primaryKey = []
      foreignKeys = []
      rows = []
      total = 0
    } finally {
      loadingRows = false
    }
  }

  /** @param {'csv' | 'json'} format */
  async function handleExport(format) {
    const exportRows = selected.size > 0
      ? [...selected].sort((a, b) => a - b).map((i) => rows[i]).filter(Boolean)
      : rows
    const content = format === 'csv' ? rowsToCsv(columns, exportRows) : rowsToJson(columns, exportRows)
    const filename = buildExportFilename(activeTable, format)
    await saveExportFile(content, filename, format)
  }

  async function runSql() {
    if (!connection || !sqlText.trim()) return
    sqlLoading = true
    sqlError = ''
    sqlMessage = ''
    sqlColumns = []
    sqlRows = []
    const sqlRan = sqlText
    try {
      const data = await executeSql(sqlRan)
      sqlColumns = data.columns ?? []
      sqlRows = data.rows ?? []
      sqlQueryMs = data.queryMs ?? data.query_ms ?? 0
      sqlMessage = data.message ?? ''
      if (!sqlMessage && data.rowCount != null && sqlColumns.length === 0) {
        sqlMessage = `${formatCompactCount(data.rowCount)} row(s) affected`
      }
    } catch (e) {
      sqlError = String(e)
    } finally {
      sqlLoading = false
      if (persistConnectionId) {
        await recordQueryExecution(persistConnectionId, sqlRan, {
          success: !sqlError,
          queryMs: sqlQueryMs,
          error: sqlError ? sqlError.slice(0, 200) : undefined,
        })
        await refreshQueryStores()
      }
    }
  }

  async function onConnected(conn, savedId) {
    connection = conn
    savedConnections = loadSavedConnections()
    // Persist last-used ID and bump timestamp
    if (savedId) {
      setLastConnectionId(savedId)
      upsertConnection({ ...conn, id: savedId, lastConnectedAt: Date.now() })
    }
    tableFilter = ''
    error = ''
    activeTable = null
    tables = []
    schemas = []
    activeSchema = 'public'
    await loadSchemas()
    await loadTables()
    tabs = []
    if (tables.length) {
      await openTableTab(activeSchema, tables[0].name)
    } else {
      openWelcomeTab()
    }
    await refreshQueryStores()
    try {
      const { loadSettings } = await import('$lib/stores/settings.js')
      if (loadSettings().mcpAutoStart) {
        const s = await mcpStart()
        mcpRunning = s.running
      }
    } catch { /* ignore */ }
  }

  onMount(async () => {
    const last = getLastConnection()
    if (!last) { showConnectionModal = true; return }
    autoConnecting = true
    try {
      if (last.type === 'sqlite') await connectSqlite(last)
      else if (last.type === 'd1') await connectD1(last)
      else await connectPostgres(last)
      await onConnected(last, last.id)
      await refreshQueryStores()
    } catch {
      showConnectionModal = true
    } finally {
      autoConnecting = false
    }
  })

  async function handleSchemaChange(schema) {
    if (!schema || schema === activeSchema) return
    activeSchema = schema
    activeTable = null
    page = 1
    tableFilter = ''
    columns = []
    rows = []
    await loadTables()
    if (activeTab?.kind === 'table') {
      if (tables.length) {
        activeTable = tables[0].name
        await loadRows()
      } else {
        saveActiveTabState()
      }
    }
  }

  async function handleTableSelect(name) {
    await openTableTab(activeSchema, name)
  }

  async function handleDisconnect() {
    try {
      await disconnectPostgres()
    } catch {
      /* ignore */
    }
    try { await mcpStop() } catch { /* ignore */ }
    mcpRunning = false
    connection = null
    schemas = []
    tables = []
    activeSchema = 'public'
    activeTable = null
    tableFilter = ''
    resetTabs()
    showConnectionModal = true
  }

  /** @param {import('$lib/stores/connections.js').SavedConnection} conn */
  async function handleSwitchDatabase(conn) {
    // Disconnect current (best-effort, non-blocking)
    disconnectPostgres().catch(() => {})
    connection = null
    schemas = []; tables = []; indexes = []; enums = []; activeSchema = 'public'; activeTable = null; tableFilter = ''
    resetTabs()
    // Connect to the chosen saved connection
    autoConnecting = true
    try {
      const { connectPostgres, connectSqlite, connectD1 } = await import('$lib/api.js')
      if (conn.type === 'sqlite') await connectSqlite(conn)
      else if (conn.type === 'd1') await connectD1(conn)
      else await connectPostgres(conn)
      await onConnected(conn, conn.id)
    } catch (e) {
      error = String(e)
      showConnectionModal = true
    } finally {
      autoConnecting = false
    }
  }

  async function handleRefresh() {
    await loadTables()
    if (activeTab?.kind === 'table' && activeTable) {
      await loadRows()
    }
  }

  /** @param {number} rowIdx */
  function primaryKeyForRow(rowIdx) {
    const row = rows[rowIdx]
    if (!row) return null

    /** @type {Record<string, unknown>} */
    const pk = {}
    for (const key of primaryKey) {
      const keyIdx = columns.findIndex((c) => c.name === key)
      if (keyIdx < 0) throw new Error(`Primary key column not found: ${key}`)
      pk[key] = row[keyIdx]
    }
    return pk
  }

  /** @param {number[]} rowIndices */
  async function handleDeleteRows(rowIndices) {
    if (!activeTable || !primaryKey.length || rowIndices.length === 0) return

    const removed = [...new Set(rowIndices)].sort((a, b) => a - b)
    const primaryKeys = removed
      .map((idx) => primaryKeyForRow(idx))
      .filter((pk) => pk !== null)

    if (primaryKeys.length === 0) return

    deletingRows = true
    try {
      const deleted = await deleteTableRows(activeSchema, activeTable, primaryKeys)
      if (deleted === 0) {
        throw new Error('No rows deleted (they may have changed)')
      }

      const removedSet = new Set(removed)
      rows = rows.filter((_, i) => !removedSet.has(i))
      total = Math.max(0, total - deleted)

      selected = remapRowIndexSet(selected, removed)
      focusedRow = remapNullableRowIndex(focusedRow, removed)
      inspectorRow = remapNullableRowIndex(inspectorRow, removed)

      if (editingCell && removedSet.has(editingCell.rowIdx)) {
        editingCell = null
      } else if (editingCell) {
        editingCell = {
          ...editingCell,
          rowIdx: remapNullableRowIndex(editingCell.rowIdx, removed) ?? editingCell.rowIdx,
        }
      }

      saveActiveTabState()
    } finally {
      deletingRows = false
    }
  }

  /** @param {{ rowIndices: number[] }} detail */
  async function handleDeleteRow(detail) {
    await handleDeleteRows(detail.rowIndices)
  }

  async function deleteSelectedRows() {
    if (selected.size === 0) return
    const n = selected.size
    try {
      await handleDeleteRows([...selected])
      toast.success(n === 1 ? 'Row deleted' : `${formatCompactCount(n)} rows deleted`)
    } catch (err) {
      toast.error('Delete failed', { description: String(err) })
    }
  }

  /** @param {Record<string, unknown>} values */
  async function handleInsertRow(values) {
    if (!activeTable) return

    insertingRow = true
    try {
      const { row } = await insertTableRow(activeSchema, activeTable, values)
      insertRowOpen = false

      const hasActiveFilters =
        rowSearch.trim() !== '' || activeFilters(rowFilters).length > 0

      if (!hasActiveFilters && page === 1) {
        rows = [row, ...rows]
        if (rows.length > pageSize) {
          rows = rows.slice(0, pageSize)
        }
        total += 1
        saveActiveTabState()
        toast.success('Row inserted')
      } else {
        await loadRows()
        toast.success('Row inserted', {
          description: hasActiveFilters
            ? 'Refresh filters or go to page 1 if the row is not visible'
            : undefined,
        })
      }
    } catch (err) {
      toast.error('Insert failed', { description: String(err) })
    } finally {
      insertingRow = false
    }
  }

  /** @param {{ rowIdx: number, colIdx: number, value: unknown }} detail */
  async function handleSaveCell(detail) {
    if (!activeTable || !primaryKey.length) return

    const col = columns[detail.colIdx]
    if (!col) return

    const row = rows[detail.rowIdx]
    if (!row) return

    /** @type {Record<string, unknown>} */
    const pk = {}
    for (const key of primaryKey) {
      const keyIdx = columns.findIndex((c) => c.name === key)
      if (keyIdx < 0) throw new Error(`Primary key column not found: ${key}`)
      pk[key] = row[keyIdx]
    }

    savingCell = true
    try {
      await updateTableCell(activeSchema, activeTable, pk, col.name, detail.value)
      rows[detail.rowIdx] = rows[detail.rowIdx].map(
        (cell, j) => (j === detail.colIdx ? detail.value : cell),
      )
      saveActiveTabState()
    } finally {
      savingCell = false
    }
  }

  /** Write SQL into the SQL editor and focus it. */
  /** @param {string} sql */
  async function openQueryInEditor(sql) {
    await focusSqlView()
    sqlText = sql
  }

  async function openQueryHistory() {
    await focusSqlView()
    queryHistoryVisible = true
  }

  /** @param {string} name @param {string} sql */
  async function handleSaveQuery(name, sql) {
    if (!persistConnectionId) return
    await createSavedQuery(persistConnectionId, name, sql)
    await refreshQueryStores()
    toast.success('Query saved')
  }

  async function handleAiWriteSql(sql) {
    await openQueryInEditor(sql)
  }

  /** Run SQL from AI chat — writes to editor and executes. */
  async function handleAiRunSql(sql) {
    await focusSqlView()
    sqlText = sql
    await runSql()
  }

  async function focusSqlView() {
    const existing = findSqlTab(tabs)
    if (existing) {
      await activateTab(existing.id)
      return
    }
    openSqlTab()
  }

  async function focusDataView() {
    if (activeTab?.kind === 'table') return
    if (activeTable) {
      const existing = findTableTab(tabs, activeSchema, activeTable)
      if (existing) {
        await activateTab(existing.id)
        return
      }
      await openTableTab(activeSchema, activeTable)
      return
    }
    const tableTab = findLastTableTab(tabs)
    if (tableTab) {
      await activateTab(tableTab.id)
      return
    }
    if (activeTab?.kind === 'sql') {
      openWelcomeTab()
    }
  }

  /** @param {'table' | 'sql'} view */
  async function handleSidebarViewChange(view) {
    if (view === 'sql') {
      await focusSqlView()
      return
    }
    await focusDataView()
  }
</script>

<ConnectionModal bind:open={showConnectionModal} onconnected={(conn, id) => onConnected(conn, id)} />

<InsertRowDialog
  bind:open={insertRowOpen}
  tableLabel={activeTable ? `${activeSchema}.${activeTable}` : ''}
  {columns}
  {primaryKey}
  saving={insertingRow}
  oninsert={handleInsertRow}
/>

<McpPanel bind:open={showMcpPanel} connected={!!connection} />

<SettingsDialog bind:open={showSettingsModal} onopenmcp={() => (showMcpPanel = true)} />

<KeyboardShortcutsDialog bind:open={showShortcutsModal} />

<InsiderDialog bind:open={showInsiderModal} />

<UpdateDialog bind:this={updateDialog} />

<CommandPalette
  bind:open={commandOpen}
  connected={!!connection}
  {schemas}
  {tables}
  {activeSchema}
  {savedConnections}
  {activeConnectionId}
  ontableselect={handleTableSelect}
  onschemachange={handleSchemaChange}
  onopensql={() => void focusSqlView()}
  onopentable={() => void focusDataView()}
  onopensettings={() => (showSettingsModal = true)}
  onopenconnection={() => (showConnectionModal = true)}
  ondisconnect={handleDisconnect}
  onrefresh={handleRefresh}
  onopenai={() => openAiTab()}
  onopenorm={openOrmTab}
  onopenSchema={openSchemaTab}
  onopenshortcuts={() => (showShortcutsModal = true)}
  oncheckupdate={() => void updateDialog?.checkNow()}
  onswitchdatabase={handleSwitchDatabase}
  {queryHistory}
  {savedQueries}
  onqueryselect={(sql) => void openQueryInEditor(sql)}
  onopenqueryhistory={() => void openQueryHistory()}
/>

{#if autoConnecting}
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
    <div class="flex flex-col items-center gap-3 text-muted-foreground">
      <span class="inline-flex gap-1">
        <span class="size-2 animate-bounce rounded-full bg-muted-foreground" style="animation-delay:0ms"></span>
        <span class="size-2 animate-bounce rounded-full bg-muted-foreground" style="animation-delay:150ms"></span>
        <span class="size-2 animate-bounce rounded-full bg-muted-foreground" style="animation-delay:300ms"></span>
      </span>
      <p class="text-sm">Reconnecting…</p>
    </div>
  </div>
{/if}


<div class="flex h-full min-h-0 w-full overflow-hidden bg-background">
  {#if sidebarOpen}
    <Sidebar
      connectionName={connection?.name ?? ''}
      {schemas}
      {tables}
      bind:activeSchema
      {activeTable}
      {activeView}
      {tableFilter}
      {loadingTables}
      onschemachange={handleSchemaChange}
      ontableselect={handleTableSelect}
      ontablefilter={(v) => (tableFilter = v)}
      onviewchange={handleSidebarViewChange}
      onrefresh={loadTables}
      ondisconnect={handleDisconnect}
      onopensettings={() => (showSettingsModal = true)}
      onopencommand={() => (commandOpen = true)}
      onopenSchema={openSchemaTab}
      onopenorm={openOrmTab}
    />
  {/if}

  <main class="flex min-h-0 min-w-0 flex-1 flex-col bg-panel" data-studio-region="main">
    {#if !connection}
      <div class="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
        <div class="flex size-12 items-center justify-center rounded-lg bg-muted">
          <Database class="size-6 text-muted-foreground" />
        </div>
        <div class="flex flex-col gap-1">
          <h1 class="text-base font-medium">DB Studio</h1>
          <p class="max-w-sm text-ui text-muted-foreground">
            Connect to PostgreSQL to browse schemas and table data.
          </p>
        </div>
        <Button type="button" onclick={() => (showConnectionModal = true)}>Add connection</Button>
        <p class="text-ui-xs text-muted-foreground">
          <kbd class="rounded border border-border px-1 font-mono">⌘K</kbd> command menu
        </p>
      </div>
    {:else}
      <TabBar
        {tabs}
        {activeTabId}
        onselect={(id) => activateTab(id)}
        onclose={closeTab}
        oncloseothers={closeOtherTabs}
        oncloseall={closeAllTabs}
        onnew={openWelcomeTab}
      />

      <!-- AI tab: always mounted once it exists so conversation state survives tab switches -->
      {#if tabs.some((t) => t.kind === 'ai')}
        <div
          class={activeTab?.kind === 'ai' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}
          inert={activeTab?.kind !== 'ai'}
        >
          <AiChat
            schemaContext={aiSchemaContext}
            {connectionId}
            isActive={activeTab?.kind === 'ai'}
            onwritesql={(sql) => void handleAiWriteSql(sql)}
          />
        </div>
      {/if}

      {#if activeTab?.kind === 'ai'}
        <!-- handled by the always-mounted block above -->
      {:else if activeTab?.kind === 'schema'}
        <SchemaPage
          {indexes}
          {enums}
          {tables}
          loading={loadingTables}
          onrefresh={async () => { await loadTables() }}
        />
      {:else if activeTab?.kind === 'orm'}
        <OrmRunner
          bind:code={ormCode}
          bind:mode={ormMode}
          columns={ormColumns}
          rows={ormRows}
          loading={ormLoading}
          error={ormError}
          queryMs={ormQueryMs}
          schemaHints={sqlSchemaHints}
          onrun={(d) => void runOrm(d)}
        />
      {:else if activeTab?.kind === 'sql'}
        <SqlConsole
          bind:sql={sqlText}
          bind:queryHistoryVisible
          {queryHistory}
          {savedQueries}
          columns={sqlColumns}
          rows={sqlRows}
          queryMs={sqlQueryMs}
          message={sqlMessage}
          loading={sqlLoading}
          error={sqlError}
          schemaHints={sqlSchemaHints}
          schemaContext={aiSchemaContext}
          onrun={runSql}
          onmodk={() => {
            commandOpen = true
          }}
          onmodenter={() => runSql()}
          onmods={() => saveActiveTabState()}
          onqueryrefresh={refreshQueryStores}
          onhistoryselect={(sql) => void openQueryInEditor(sql)}
          onsavequery={handleSaveQuery}
        />
      {:else if activeTab?.kind === 'table'}
        {#if error}
          <Alert.Root variant="destructive" class="mx-3 mt-2 shrink-0">
            <Alert.Description class="text-ui-sm">{error}</Alert.Description>
          </Alert.Root>
        {/if}

        {#if !activeTable}
          <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p class="font-mono text-ui text-muted-foreground">
              Select a table from the sidebar or press
              <kbd class="rounded border border-border px-1 font-mono text-ui-xs">⌘K</kbd>
            </p>
          </div>
        {:else}
          <TableToolbar
            bind:this={tableToolbar}
            {sidebarOpen}
            {queryMs}
            {page}
            {pageSize}
            offset={currentOffset}
            {total}
            {columns}
            {rowSearch}
            {rowSort}
            {rowFilters}
            loading={loadingRows}
            selectedCount={selected.size}
            hasPrimaryKey={primaryKey.length > 0}
            deleting={deletingRows}
            ontogglesidebar={toggleSidebar}
            onrefresh={loadRows}
            onsearchchange={handleRowSearchChange}
            onfilterschange={(f) => void handleRowFiltersChange(f)}
            onsortchange={(s) => void handleRowSortChange(s)}
            onpagesizechange={(s) => void handlePageSizeChange(s)}
            onpagechange={(p) => void handlePageChange(p)}
            onlimitoffsetchange={(l, o) => void handleLimitOffsetChange(l, o)}
            ondeleteselected={() => void deleteSelectedRows()}
            onexport={handleExport}
            onaddrow={() => (insertRowOpen = true)}
            {hiddenColumns}
            onhiddencolumnschange={(next) => { hiddenColumns = next }}
            onprev={async () => {
              if (page <= 1) return
              await handlePageChange(page - 1)
            }}
            onnext={async () => {
              if (page * pageSize >= total) return
              await handlePageChange(page + 1)
            }}
          />

          <div class="flex min-h-0 min-w-0 flex-1">
            {#key activeTabId}
              <DataTable
                {columns}
                {rows}
                {primaryKey}
                {foreignKeys}
                {hiddenColumns}
                columnWidthsKey={activeTable ? `${activeSchema}.${activeTable}` : undefined}
                loading={loadingRows}
                saving={savingCell || deletingRows || insertingRow}
                bind:selected
                bind:focusedRow
                bind:inspectorRow
                bind:editingCell
                onsave={handleSaveCell}
                ondelete={handleDeleteRow}
                onfollowforeignkey={(d) => void handleFollowForeignKey(d)}
              />
            {/key}
            <RowDetailPanel
              {columns}
              {rows}
              target={inspectorTarget}
              onclose={closeInspector}
            />
          </div>
        {/if}
      {:else}
        <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
          <p class="font-mono text-ui text-muted-foreground">
            Pick a table from the sidebar, open SQL from the sidebar, or press
            <kbd class="rounded border border-border px-1 font-mono text-ui-xs">⌘T</kbd>
            for a new tab
          </p>
          <p class="text-ui-xs text-muted-foreground">
            <kbd class="rounded border border-border px-1 font-mono">⌘B</kbd> sidebar ·
            <kbd class="rounded border border-border px-1 font-mono">⌘⇧D</kbd> data ·
            <kbd class="rounded border border-border px-1 font-mono">⌘⇧S</kbd> SQL ·
            <kbd class="rounded border border-border px-1 font-mono">⌘W</kbd> close tab
          </p>
        </div>
      {/if}
    {/if}
  </main>
</div>
