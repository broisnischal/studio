<script>
  import Database from '@lucide/svelte/icons/database'
  import { createHotkey } from '@tanstack/svelte-hotkeys'
  import Sidebar from './Sidebar.svelte'
  import TableToolbar from './TableToolbar.svelte'
  import DataTable from './DataTable.svelte'
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
  } from '$lib/api.js'

  let connection = $state(null)
  let showConnectionModal = $state(true)
  let showSettingsModal = $state(false)
  let commandOpen = $state(false)
  /** @type {'table' | 'sql'} */
  let activeView = $state('table')

  let schemas = $state([])
  let activeSchema = $state('public')
  let tables = $state([])
  let activeTable = $state(null)
  let tableFilter = $state('')
  let loadingTables = $state(false)

  let columns = $state([])
  let rows = $state([])
  let total = $state(0)
  let queryMs = $state(0)
  let loadingRows = $state(false)
  let page = $state(1)
  const pageSize = 50

  let selected = $state(new Set())
  let error = $state('')

  let sqlText = $state('SELECT 1;')
  let sqlColumns = $state([])
  let sqlRows = $state([])
  let sqlQueryMs = $state(0)
  let sqlMessage = $state('')
  let sqlLoading = $state(false)
  let sqlError = $state('')

  createHotkey('Mod+K', (e) => {
    e.preventDefault()
    commandOpen = true
  })

  createHotkey('Mod+Enter', (e) => {
    if (activeView !== 'sql' || !connection) return
    e.preventDefault()
    runSql()
  })

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
          rowCount: Number(t.rowCount ?? t.row_count ?? 0),
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
    error = ''
    try {
      const offset = (page - 1) * pageSize
      const data = await getTableRows(activeSchema, activeTable, pageSize, offset)
      columns = data.columns
      rows = data.rows
      total = data.total
      queryMs = data.queryMs
    } catch (e) {
      error = String(e)
    } finally {
      loadingRows = false
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
      sqlQueryMs = data.queryMs ?? 0
      sqlMessage = data.message ?? ''
      if (!sqlMessage && data.rowCount != null && sqlColumns.length === 0) {
        sqlMessage = `${data.rowCount} row(s) affected`
      }
    } catch (e) {
      sqlError = String(e)
    } finally {
      sqlLoading = false
    }
  }

  async function onConnected(conn) {
    connection = conn
    showConnectionModal = false
    page = 1
    tableFilter = ''
    error = ''
    activeTable = null
    tables = []
    schemas = []
    activeSchema = 'public'
    activeView = 'table'
    await loadSchemas()
    await loadTables()
    if (tables.length) {
      activeTable = tables[0].name
      await loadRows()
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
    if (tables.length) {
      activeTable = tables[0].name
      await loadRows()
    }
  }

  async function handleTableSelect(name) {
    activeView = 'table'
    activeTable = name
    page = 1
    await loadRows()
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
    columns = []
    rows = []
    error = ''
    sqlError = ''
    sqlColumns = []
    sqlRows = []
    activeView = 'table'
    showConnectionModal = true
  }

  async function handleRefresh() {
    await loadTables()
    if (activeView === 'table' && activeTable) {
      await loadRows()
    }
  }

  function openTableFromSql() {
    if (activeTable) {
      activeView = 'table'
      loadRows()
    }
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
  onopensql={() => {
    activeView = 'sql'
  }}
  onopentable={openTableFromSql}
  onopensettings={() => (showSettingsModal = true)}
  onopenconnection={() => (showConnectionModal = true)}
  ondisconnect={handleDisconnect}
  onrefresh={handleRefresh}
/>

<div class="flex h-full min-h-0 w-full overflow-hidden bg-background">
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
    onviewchange={(v) => (activeView = v)}
    onrefresh={loadTables}
    ondisconnect={handleDisconnect}
    onopensettings={() => (showSettingsModal = true)}
    onopencommand={() => (commandOpen = true)}
  />

  <main class="flex min-h-0 min-w-0 flex-1 flex-col bg-panel">
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
    {:else if activeView === 'sql'}
      <SqlConsole
        bind:sql={sqlText}
        columns={sqlColumns}
        rows={sqlRows}
        queryMs={sqlQueryMs}
        message={sqlMessage}
        loading={sqlLoading}
        error={sqlError}
        onrun={runSql}
      />
    {:else if !activeTable}
      <div class="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <p class="font-mono text-[13px] text-muted-foreground">
          Select a table from the sidebar or press
          <kbd class="rounded border border-border px-1 font-mono text-[11px]">⌘K</kbd>
        </p>
      </div>
    {:else}
      {#if error}
        <Alert.Root variant="destructive" class="mx-3 mt-2 shrink-0">
          <Alert.Description class="text-[12px]">{error}</Alert.Description>
        </Alert.Root>
      {/if}

      <TableToolbar
        {queryMs}
        {page}
        {pageSize}
        {total}
        loading={loadingRows}
        onrefresh={loadRows}
        onprev={async () => {
          page -= 1
          await loadRows()
        }}
        onnext={async () => {
          page += 1
          await loadRows()
        }}
      />

      <DataTable {columns} {rows} loading={loadingRows} bind:selected />
    {/if}
  </main>
</div>
