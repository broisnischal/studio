<script>
  import Database from '@lucide/svelte/icons/database'
  import { createHotkey } from '@tanstack/svelte-hotkeys'
  import { toast } from 'svelte-sonner'
  import Sidebar from './Sidebar.svelte'
  import TabBar from './TabBar.svelte'
  import TableToolbar from './TableToolbar.svelte'
  import DataTable from './DataTable.svelte'
  import RowDetailPanel from './RowDetailPanel.svelte'
  import SqlConsole from './SqlConsole.svelte'
  import CommandPalette from './CommandPalette.svelte'
  import ConnectionModal from './ConnectionModal.svelte'
  import SettingsDialog from './SettingsDialog.svelte'
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
  } from '$lib/api.js'
  import {
    createTableTab,
    createSqlTab,
    createWelcomeTab,
    findTableTab,
    findSqlTab,
    findLastTableTab,
    tableTabTitle,
    cycleTabIndex,
    cloneTableTabState,
    cloneSqlTabState,
  } from '$lib/studio-tabs.js'
  import { normalizeTableRowCount } from '$lib/table-list.js'
  import { loadLayout, saveLayout } from '$lib/stores/layout.js'
  import {
    remapNullableRowIndex,
    remapRowIndexSet,
  } from '$lib/table-row-indices.js'

  /** @typedef {import('$lib/studio-tabs.js').StudioTab} StudioTab */
  /** @typedef {import('$lib/studio-tabs.js').TableTabState} TableTabState */
  /** @typedef {import('$lib/studio-tabs.js').SqlTabState} SqlTabState */

  const pageSize = 50

  let connection = $state(null)
  let showConnectionModal = $state(true)
  let showSettingsModal = $state(false)
  let commandOpen = $state(false)
  let sidebarOpen = $state(loadLayout().navSidebarOpen)

  /** @type {StudioTab[]} */
  let tabs = $state([])
  let activeTabId = $state(/** @type {string | null} */ (null))

  let schemas = $state([])
  let activeSchema = $state('public')
  let tables = $state([])
  let activeTable = $state(/** @type {string | null} */ (null))
  let tableFilter = $state('')
  let loadingTables = $state(false)

  let columns = $state([])
  let primaryKey = $state([])
  let rows = $state([])
  let savingCell = $state(false)
  let deletingRows = $state(false)
  /** @type {{ rowIdx: number, colIdx: number, draft: string } | null} */
  let editingCell = $state(null)
  let total = $state(0)
  let queryMs = $state(0)
  let loadingRows = $state(false)
  let page = $state(1)
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

  const activeTab = $derived(tabs.find((t) => t.id === activeTabId) ?? null)

  const activeView = $derived(activeTab?.kind === 'sql' ? 'sql' : 'table')

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
      columns,
      primaryKey,
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
    }
  }

  /** @param {TableTabState} s */
  function applyTableSnapshot(s) {
    page = s.page
    columns = s.columns
    primaryKey = s.primaryKey
    rows = s.rows
    total = s.total
    queryMs = s.queryMs
    loadingRows = false
    error = s.error
    selected = new Set(s.selected)
    focusedRow = s.focusedRow
    inspectorRow = s.inspectorRow ?? null
    editingCell = s.editingCell ? { ...s.editingCell } : null
    savingCell = false
    activeTable = s.table
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
    columns = []
    primaryKey = []
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
    if (tab.kind === 'welcome') {
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
      if (s.table && s.columns.length === 0) {
        await loadRows()
      }
    }
  }

  createHotkey('Mod+K', (e) => {
    e.preventDefault()
    commandOpen = true
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

  createHotkey('Escape', (e) => {
    if (commandOpen) {
      e.preventDefault()
      commandOpen = false
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

  function openSqlTab() {
    saveActiveTabState()
    const tab = createSqlTab()
    tabs = [...tabs, tab]
    activeTabId = tab.id
    clearTableEditor()
    applySqlSnapshot(cloneSqlTabState(/** @type {SqlTabState} */ (tab.state)))
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

  /** @param {string} schema @param {string} table */
  async function openTableTab(schema, table) {
    const existing = findTableTab(tabs, schema, table)
    if (existing) {
      await activateTab(existing.id)
      if (activeTable === table && columns.length === 0) {
        await loadRows()
      }
      return
    }
    saveActiveTabState()
    const tab = createTableTab(schema, table)
    tabs = [...tabs, tab]
    activeTabId = tab.id
    activeTable = table
    page = 1
    columns = []
    primaryKey = []
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
    await loadRows()
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
      const offset = (page - 1) * pageSize
      const data = await getTableRows(activeSchema, activeTable, pageSize, offset)
      columns = data.columns ?? []
      primaryKey = data.primaryKey ?? data.primary_key ?? []
      rows = data.rows ?? []
      total = Number(data.total ?? 0)
      queryMs = Number(data.queryMs ?? data.query_ms ?? 0)
    } catch (e) {
      error = String(e)
      columns = []
      rows = []
      total = 0
    } finally {
      loadingRows = false
      saveActiveTabState()
    }
  }

  async function runSql() {
    if (!connection || !sqlText.trim()) return
    sqlLoading = true
    sqlError = ''
    sqlMessage = ''
    sqlColumns = []
    sqlRows = []
    try {
      const data = await executeSql(sqlText)
      sqlColumns = data.columns ?? []
      sqlRows = data.rows ?? []
      sqlQueryMs = data.queryMs ?? data.query_ms ?? 0
      sqlMessage = data.message ?? ''
      if (!sqlMessage && data.rowCount != null && sqlColumns.length === 0) {
        sqlMessage = `${data.rowCount} row(s) affected`
      }
    } catch (e) {
      sqlError = String(e)
    } finally {
      sqlLoading = false
      saveActiveTabState()
    }
  }

  async function onConnected(conn) {
    connection = conn
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
  }

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
    connection = null
    schemas = []
    tables = []
    activeSchema = 'public'
    activeTable = null
    tableFilter = ''
    resetTabs()
    showConnectionModal = true
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
      toast.success(n === 1 ? 'Row deleted' : `${n} rows deleted`)
    } catch (err) {
      toast.error('Delete failed', { description: String(err) })
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
      rows = rows.map((r, i) =>
        i === detail.rowIdx
          ? r.map((cell, j) => (j === detail.colIdx ? detail.value : cell))
          : r,
      )
      saveActiveTabState()
    } finally {
      savingCell = false
    }
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

<ConnectionModal bind:open={showConnectionModal} onconnected={onConnected} />

<SettingsDialog bind:open={showSettingsModal} />

<CommandPalette
  bind:open={commandOpen}
  connected={!!connection}
  {schemas}
  {tables}
  {activeSchema}
  ontableselect={handleTableSelect}
  onschemachange={handleSchemaChange}
  onopensql={() => void focusSqlView()}
  onopentable={() => void focusDataView()}
  onopensettings={() => (showSettingsModal = true)}
  onopenconnection={() => (showConnectionModal = true)}
  ondisconnect={handleDisconnect}
  onrefresh={handleRefresh}
/>

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
          <p class="max-w-sm text-[13px] text-muted-foreground">
            Connect to PostgreSQL to browse schemas and table data.
          </p>
        </div>
        <Button type="button" onclick={() => (showConnectionModal = true)}>Add connection</Button>
        <p class="text-[11px] text-muted-foreground">
          <kbd class="rounded border border-border px-1 font-mono">⌘K</kbd> command menu
        </p>
      </div>
    {:else}
      <TabBar
        {tabs}
        {activeTabId}
        onselect={(id) => activateTab(id)}
        onclose={closeTab}
        onnew={openWelcomeTab}
      />

      {#if activeTab?.kind === 'sql'}
        <SqlConsole
          bind:sql={sqlText}
          columns={sqlColumns}
          rows={sqlRows}
          queryMs={sqlQueryMs}
          message={sqlMessage}
          loading={sqlLoading}
          error={sqlError}
          onrun={runSql}
          onmodk={() => {
            commandOpen = true
          }}
          onmodenter={() => runSql()}
          onmods={() => saveActiveTabState()}
        />
      {:else if activeTab?.kind === 'table'}
        {#if error}
          <Alert.Root variant="destructive" class="mx-3 mt-2 shrink-0">
            <Alert.Description class="text-[12px]">{error}</Alert.Description>
          </Alert.Root>
        {/if}

        {#if !activeTable}
          <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
            <p class="font-mono text-[13px] text-muted-foreground">
              Select a table from the sidebar or press
              <kbd class="rounded border border-border px-1 font-mono text-[11px]">⌘K</kbd>
            </p>
          </div>
        {:else}
          <TableToolbar
            {sidebarOpen}
            {queryMs}
            {page}
            {pageSize}
            {total}
            loading={loadingRows}
            selectedCount={selected.size}
            hasPrimaryKey={primaryKey.length > 0}
            deleting={deletingRows}
            ontogglesidebar={toggleSidebar}
            onrefresh={loadRows}
            ondeleteselected={() => void deleteSelectedRows()}
            onprev={async () => {
              page -= 1
              await loadRows()
            }}
            onnext={async () => {
              page += 1
              await loadRows()
            }}
          />

          <div class="flex min-h-0 min-w-0 flex-1">
            <DataTable
              {columns}
              {rows}
              {primaryKey}
              loading={loadingRows}
              saving={savingCell || deletingRows}
              bind:selected
              bind:focusedRow
              bind:inspectorRow
              bind:editingCell
              onsave={handleSaveCell}
              ondelete={handleDeleteRow}
            />
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
          <p class="font-mono text-[13px] text-muted-foreground">
            Pick a table from the sidebar, open SQL from the sidebar, or press
            <kbd class="rounded border border-border px-1 font-mono text-[11px]">⌘T</kbd>
            for a new tab
          </p>
          <p class="text-[11px] text-muted-foreground">
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
