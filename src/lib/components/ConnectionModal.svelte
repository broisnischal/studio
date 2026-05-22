<script>
  import { untrack } from 'svelte'
  import Database  from '@lucide/svelte/icons/database'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import Cloud     from '@lucide/svelte/icons/cloud'
  import X         from '@lucide/svelte/icons/x'
  import Plus      from '@lucide/svelte/icons/plus'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronUp   from '@lucide/svelte/icons/chevron-up'
  import Loader    from '@lucide/svelte/icons/loader'
  import {
    testPostgresConnection, connectPostgres,
    testSqliteConnection,   connectSqlite,
    testD1Connection,       connectD1,
  } from '$lib/api.js'
  import {
    loadSavedConnections,
    upsertConnection,
    removeConnection,
    newConnectionId,
    getLastConnectionId,
    setLastConnectionId,
  } from '$lib/stores/connections.js'
  import { Button }   from '$lib/components/ui/button/index.js'
  import { Input }    from '$lib/components/ui/input/index.js'
  import { Label }    from '$lib/components/ui/label/index.js'
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import * as Dialog  from '$lib/components/ui/dialog/index.js'

  let {
    open = $bindable(false),
    /** @param {import('$lib/stores/connections.js').SavedConnection} conn @param {string} id */
    onconnected = (conn, id) => {},
  } = $props()

  // ── Driver definitions ────────────────────────────────────────────────────
  const DRIVERS = [
    { id: 'postgres', label: 'PostgreSQL',    icon: Database,  color: 'text-blue-500'  },
    { id: 'sqlite',   label: 'SQLite',        icon: HardDrive, color: 'text-green-500' },
    { id: 'd1',       label: 'Cloudflare D1', icon: Cloud,     color: 'text-orange-500'},
  ]

  // ── State — initialise immediately so first render is never blank ─────────
  /** @type {import('$lib/stores/connections.js').SavedConnection[]} */
  let saved      = $state(loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0)))
  let lastId     = $state(getLastConnectionId())
  let showForm   = $state(saved.length === 0)   // show form straight away when no connections
  let connecting = $state(/** @type {string|null} */ (null))
  let testing    = $state(false)
  let error      = $state('')
  let testOk     = $state(false)

  // Form
  /** @type {'postgres'|'sqlite'|'d1'} */
  let dbType     = $state('postgres')
  let name       = $state('Local PostgreSQL')
  let host       = $state('127.0.0.1')
  let port       = $state('5432')
  let database   = $state('postgres')
  let user       = $state('postgres')
  let password   = $state('')
  let ssl        = $state(false)
  let filePath   = $state('')
  let accountId  = $state('')
  let databaseId = $state('')
  let apiToken   = $state('')

  // ── Helpers ───────────────────────────────────────────────────────────────

  function defaultName(t) {
    return t === 'sqlite' ? 'Local SQLite' : t === 'd1' ? 'Cloudflare D1' : 'Local PostgreSQL'
  }

  // Name auto-update is handled inline in the driver button onclick — no $effect needed.

  function formPayload() {
    if (dbType === 'sqlite') return { type: 'sqlite', name, filePath }
    if (dbType === 'd1')     return { type: 'd1', name, accountId, databaseId, apiToken }
    return { type: 'postgres', name, host, port, database, user, password, ssl }
  }

  function resetForm(conn) {
    if (conn) {
      dbType     = conn.type ?? 'postgres'
      name       = conn.name ?? defaultName(dbType)
      host       = conn.host ?? '127.0.0.1'
      port       = String(conn.port ?? 5432)
      database   = conn.database ?? 'postgres'
      user       = conn.user ?? 'postgres'
      password   = conn.password ?? ''
      ssl        = Boolean(conn.ssl)
      filePath   = conn.filePath ?? ''
      accountId  = conn.accountId ?? ''
      databaseId = conn.databaseId ?? ''
      apiToken   = conn.apiToken ?? ''
    } else {
      dbType = 'postgres'; name = 'Local PostgreSQL'; host = '127.0.0.1'
      port = '5432'; database = 'postgres'; user = 'postgres'
      password = ''; ssl = false; filePath = ''
      accountId = ''; databaseId = ''; apiToken = ''
    }
    error = ''; testOk = false
  }

  function driver(t) { return DRIVERS.find(d => d.id === (t ?? 'postgres')) ?? DRIVERS[0] }

  function connDetail(conn) {
    if (conn.type === 'sqlite') return conn.filePath || '—'
    if (conn.type === 'd1')     return `${conn.accountId?.slice(0,8) ?? ''}… · ${conn.databaseId?.slice(0,8) ?? ''}…`
    return `${conn.user ?? ''}@${conn.host ?? ''}:${conn.port ?? ''}/${conn.database ?? ''}`
  }

  function relativeTime(ts) {
    if (!ts) return ''
    const s = (Date.now() - ts) / 1000
    if (s < 60)      return 'just now'
    if (s < 3600)    return `${Math.floor(s / 60)}m ago`
    if (s < 86400)   return `${Math.floor(s / 3600)}h ago`
    if (s < 604800)  return `${Math.floor(s / 86400)}d ago`
    return new Date(ts).toLocaleDateString()
  }

  function prepareForOpen() {
    saved  = loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    lastId = getLastConnectionId()
    showForm = saved.length === 0
    error = ''; testOk = false
  }

  // Refresh list every time the dialog opens.
  // untrack() prevents the writes inside from being treated as reactive
  // dependencies of this effect — without it, writing `saved` then reading
  // `saved.length` in the same body causes an infinite update loop.
  $effect(() => {
    if (!open) return        // sole tracked dependency
    untrack(() => {
      const list = loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      saved  = list
      lastId = getLastConnectionId()
      if (list.length === 0) showForm = true
      error  = ''
      testOk = false
    })
  })

  function handleDelete(id) {
    saved = removeConnection(id).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    if (id === lastId) { lastId = null; setLastConnectionId(null) }
    if (saved.length === 0) showForm = true
  }

  function openNewForm() { resetForm(null); showForm = true }
  function editSaved(conn) { resetForm(conn); showForm = true }

  async function connectWith(conn) {
    connecting = conn.id; error = ''
    try {
      if (conn.type === 'sqlite') await connectSqlite(conn)
      else if (conn.type === 'd1') await connectD1(conn)
      else await connectPostgres(conn)
      // bump timestamp
      const updated = { ...conn, lastConnectedAt: Date.now() }
      saved = upsertConnection(updated).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      setLastConnectionId(conn.id)
      open = false
      await onconnected(updated, conn.id)
    } catch (e) { error = String(e) }
    finally { connecting = null }
  }

  async function handleTest() {
    testing = true; error = ''; testOk = false
    try {
      const p = formPayload()
      if (p.type === 'sqlite') await testSqliteConnection(p)
      else if (p.type === 'd1') await testD1Connection(p)
      else await testPostgresConnection(p)
      testOk = true
    } catch (e) { error = String(e) }
    finally { testing = false }
  }

  async function handleConnect() {
    connecting = '__new__'; error = ''
    try {
      const payload = formPayload()
      if (payload.type === 'sqlite') await connectSqlite(payload)
      else if (payload.type === 'd1') await connectD1(payload)
      else await connectPostgres(payload)

      const existing = saved.find((s) => {
        if (s.type !== payload.type) return false
        if (payload.type === 'sqlite') return s.filePath === payload.filePath
        if (payload.type === 'd1') return s.databaseId === payload.databaseId && s.accountId === payload.accountId
        return s.host === payload.host && s.database === payload.database
      })
      const id = existing?.id ?? newConnectionId()
      const saved_conn = {
        id,
        ...payload,
        port: payload.type === 'postgres' ? (Number(payload.port) || 5432) : undefined,
        lastConnectedAt: Date.now(),
      }
      saved = upsertConnection(saved_conn).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      setLastConnectionId(id)
      open = false
      await onconnected(saved_conn, id)
    } catch (e) { error = String(e) }
    finally { connecting = null }
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content
    class="flex max-h-[min(92vh,680px)] w-[calc(100%-2rem)] max-w-[480px] flex-col gap-0 overflow-hidden p-0"
    showCloseButton={true}
  >

    <!-- ── Header ───────────────────────────────────────────────────────── -->
    <div class="shrink-0 px-6 py-5">
      <h2 class="text-base font-semibold text-foreground">Connect to database</h2>
      <p class="mt-0.5 text-sm text-muted-foreground">
        {saved.length > 0 ? 'Select a saved connection or create a new one.' : 'Configure a new database connection.'}
      </p>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">

      <!-- ── Saved connections ─────────────────────────────────────────── -->
      {#if saved.length > 0}
        <div class="px-6 pb-2">
          <div class="flex flex-col gap-1.5">
            {#each saved as conn (conn.id)}
              {@const d = driver(conn.type)}
              {@const Icon = d.icon}
              {@const isLast = conn.id === lastId}
              {@const isBusy = connecting === conn.id}
              <div class="flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors
                           {isLast ? 'border-ring/40 bg-accent/30' : 'border-border hover:bg-accent/20'}">
                <!-- Driver icon -->
                <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Icon class="size-4 {d.color}" />
                </div>

                <!-- Info (click to edit) -->
                <button
                  type="button"
                  class="min-w-0 flex-1 text-left"
                  onclick={() => editSaved(conn)}
                  title="Edit"
                >
                  <div class="flex items-center gap-2">
                    <span class="truncate text-sm font-medium text-foreground">{conn.name}</span>
                    {#if isLast}
                      <span class="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">Last used</span>
                    {/if}
                  </div>
                  <div class="flex items-center gap-2">
                    <span class="truncate font-mono text-xs text-muted-foreground">{connDetail(conn)}</span>
                    {#if conn.lastConnectedAt}
                      <span class="shrink-0 text-[10px] text-muted-foreground/60">{relativeTime(conn.lastConnectedAt)}</span>
                    {/if}
                  </div>
                </button>

                <!-- Delete -->
                <button
                  type="button"
                  class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onclick={(e) => { e.stopPropagation(); handleDelete(conn.id) }}
                  aria-label="Delete"
                  title="Delete"
                ><X class="size-3.5" /></button>

                <!-- Connect -->
                <Button
                  type="button"
                  size="sm"
                  class="shrink-0"
                  disabled={!!connecting}
                  onclick={() => connectWith(conn)}
                >
                  {#if isBusy}
                    <Loader class="mr-1.5 size-3 animate-spin" />Connecting…
                  {:else if isLast}
                    Resume
                  {:else}
                    Connect
                  {/if}
                </Button>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- ── Error banner (shown regardless of form state) ───────────────── -->
      {#if error}
        <div class="mx-6 mt-2 rounded-md bg-destructive/8 px-3 py-2 text-xs text-destructive">{error}</div>
      {/if}
      {#if testOk}
        <div class="mx-6 mt-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">✓ Connection test successful</div>
      {/if}

      <!-- ── New connection form ───────────────────────────────────────── -->
      <div class="px-6 pb-6">
        {#if saved.length > 0}
          <button
            type="button"
            class="mt-2 flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-4 py-2.5 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:bg-accent/20 hover:text-foreground"
            onclick={() => { showForm = !showForm; if (showForm) resetForm(null) }}
          >
            <Plus class="size-4" />
            <span class="flex-1 text-left">New connection</span>
            {#if showForm}<ChevronUp class="size-4" />{:else}<ChevronDown class="size-4" />{/if}
          </button>
        {/if}

        {#if showForm}
          <div class="mt-4 flex flex-col gap-4">

            <!-- Driver selector -->
            <div class="grid grid-cols-3 gap-2">
              {#each DRIVERS as d (d.id)}
                {@const Icon = d.icon}
                <button
                  type="button"
                  class="flex flex-col items-center gap-1.5 rounded-lg border py-3 transition-colors
                         {dbType === d.id ? 'border-ring bg-accent/50' : 'border-border hover:bg-accent/30'}"
                  onclick={() => {
                    const AUTO = ['Local PostgreSQL', 'Local SQLite', 'Cloudflare D1']
                    if (AUTO.includes(name)) name = defaultName(d.id)
                    dbType = d.id
                  }}
                >
                  <Icon class="size-4 {dbType === d.id ? d.color : 'text-muted-foreground'}" />
                  <span class="text-xs font-medium {dbType === d.id ? 'text-foreground' : 'text-muted-foreground'}">{d.label}</span>
                </button>
              {/each}
            </div>

            <!-- Connection name -->
            <div class="flex flex-col gap-1.5">
              <Label for="cn-name" class="text-xs font-medium">Connection name</Label>
              <Input id="cn-name" bind:value={name} class="h-8 text-sm" />
            </div>

            <!-- PostgreSQL fields -->
            {#if dbType === 'postgres'}
              <div class="grid grid-cols-[1fr_88px] gap-2">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-host" class="text-xs font-medium">Host</Label>
                  <Input id="cn-host" bind:value={host} class="h-8 text-sm" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-port" class="text-xs font-medium">Port</Label>
                  <Input id="cn-port" type="number" bind:value={port} class="h-8 text-sm" />
                </div>
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="cn-db" class="text-xs font-medium">Database</Label>
                <Input id="cn-db" bind:value={database} class="h-8 text-sm" />
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-user" class="text-xs font-medium">User</Label>
                  <Input id="cn-user" bind:value={user} autocomplete="username" class="h-8 text-sm" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-pass" class="text-xs font-medium">Password</Label>
                  <Input id="cn-pass" type="password" bind:value={password} autocomplete="current-password" class="h-8 text-sm" />
                </div>
              </div>
              <div class="flex items-center gap-2">
                <Checkbox id="cn-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                <Label for="cn-ssl" class="text-xs font-normal text-muted-foreground cursor-pointer">Use SSL (sslmode=require)</Label>
              </div>

            <!-- SQLite fields -->
            {:else if dbType === 'sqlite'}
              <div class="flex flex-col gap-1.5">
                <Label for="cn-path" class="text-xs font-medium">File path</Label>
                <Input id="cn-path" bind:value={filePath} placeholder="/path/to/database.db" class="h-8 font-mono text-sm" />
                <p class="text-xs text-muted-foreground">Absolute path or <code class="font-mono">:memory:</code></p>
              </div>

            <!-- D1 fields -->
            {:else if dbType === 'd1'}
              <div class="flex flex-col gap-1.5">
                <Label for="cn-acct" class="text-xs font-medium">Account ID</Label>
                <Input id="cn-acct" bind:value={accountId} placeholder="abcdef1234567890…" class="h-8 font-mono text-sm" />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="cn-dbid" class="text-xs font-medium">Database ID</Label>
                <Input id="cn-dbid" bind:value={databaseId} placeholder="xxxxxxxx-xxxx-…" class="h-8 font-mono text-sm" />
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="cn-tok" class="text-xs font-medium">API Token</Label>
                <Input id="cn-tok" type="password" bind:value={apiToken} placeholder="Cloudflare API token (D1:Edit)" class="h-8 text-sm" />
              </div>
            {/if}

            <div class="flex items-center justify-end gap-2 pt-1">
              {#if dbType !== 'd1'}
                <Button type="button" variant="outline" size="sm" onclick={handleTest} disabled={testing || !!connecting}>
                  {testing ? 'Testing…' : 'Test'}
                </Button>
              {/if}
              <Button type="button" size="sm" onclick={handleConnect} disabled={!!connecting || testing}>
                {#if connecting === '__new__'}
                  <Loader class="mr-1.5 size-3 animate-spin" />Connecting…
                {:else}
                  Connect
                {/if}
              </Button>
            </div>

          </div>
        {/if}
      </div>

    </div>
  </Dialog.Content>
</Dialog.Root>
