<script>
  import { untrack } from 'svelte'
  import Database  from '@lucide/svelte/icons/database'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import Cloud     from '@lucide/svelte/icons/cloud'
  import X         from '@lucide/svelte/icons/x'
  import Clock     from '@lucide/svelte/icons/clock'
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
  import { Button }     from '$lib/components/ui/button/index.js'
  import { Input }      from '$lib/components/ui/input/index.js'
  import { Label }      from '$lib/components/ui/label/index.js'
  import { Checkbox }   from '$lib/components/ui/checkbox/index.js'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import * as Dialog    from '$lib/components/ui/dialog/index.js'
  import { parseConnectionUri } from '$lib/connection-uri.js'

  let {
    open = $bindable(false),
    /** @param {import('$lib/stores/connections.js').SavedConnection} conn @param {string} id */
    onconnected = (conn, id) => {},
  } = $props()

  const DRIVERS = [
    { id: 'postgres', label: 'PostgreSQL',    icon: Database,  color: 'text-blue-500'  },
    { id: 'sqlite',   label: 'SQLite',        icon: HardDrive, color: 'text-green-500' },
    { id: 'd1',       label: 'Cloudflare D1', icon: Cloud,     color: 'text-orange-500'},
  ]

  /** @type {import('$lib/stores/connections.js').SavedConnection[]} */
  let saved      = $state(loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0)))
  let lastId     = $state(getLastConnectionId())
  /** @type {string|null} */
  let editingId  = $state(null)
  let connecting = $state(/** @type {string|null} */ (null))
  let testing    = $state(false)
  let error      = $state('')
  let testOk     = $state(false)

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
  let connectionUri = $state('')
  let uriHint      = $state('')

  function defaultName(t) {
    return t === 'sqlite' ? 'Local SQLite' : t === 'd1' ? 'Cloudflare D1' : 'Local PostgreSQL'
  }

  function formPayload() {
    if (dbType === 'sqlite') return { type: 'sqlite', name, filePath }
    if (dbType === 'd1')     return { type: 'd1', name, accountId, databaseId, apiToken }
    return { type: 'postgres', name, host, port, database, user, password, ssl }
  }

  /** @param {import('$lib/stores/connections.js').SavedConnection|null} conn */
  function resetForm(conn) {
    editingId = conn?.id ?? null
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
    error = ''; testOk = false; connectionUri = ''; uriHint = ''
  }

  function applyConnectionUri() {
    uriHint = ''
    const parsed = parseConnectionUri(dbType === 'sqlite' ? 'sqlite' : 'postgres', connectionUri)
    if (!parsed) return
    if ('error' in parsed) {
      uriHint = parsed.error
      return
    }
    if (dbType === 'sqlite' && 'filePath' in parsed) {
      filePath = parsed.filePath
      uriHint = 'Fields updated from URI'
      return
    }
    if ('host' in parsed) {
      host = parsed.host
      port = parsed.port
      database = parsed.database
      user = parsed.user
      password = parsed.password
      ssl = parsed.ssl
      uriHint = 'Fields updated from URI'
    }
  }

  function handleUriPaste() {
    requestAnimationFrame(() => applyConnectionUri())
  }

  function uriHintIsError(hint) {
    return hint.includes('Could') || hint.includes('Expected') || hint.includes('missing')
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

  $effect(() => {
    if (!open) return
    untrack(() => {
      const list = loadSavedConnections().sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
      saved  = list
      lastId = getLastConnectionId()
      resetForm(null)
    })
  })

  function handleDelete(id) {
    saved = removeConnection(id).sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
    if (id === lastId) { lastId = null; setLastConnectionId(null) }
    if (editingId === id) resetForm(null)
  }

  /** @param {import('$lib/stores/connections.js').SavedConnection} conn */
  function selectSaved(conn) {
    resetForm(conn)
  }

  async function connectWith(conn) {
    connecting = conn.id; error = ''
    try {
      if (conn.type === 'sqlite') await connectSqlite(conn)
      else if (conn.type === 'd1') await connectD1(conn)
      else await connectPostgres(conn)
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
    connecting = editingId ?? '__new__'; error = ''
    try {
      const payload = formPayload()
      if (payload.type === 'sqlite') await connectSqlite(payload)
      else if (payload.type === 'd1') await connectD1(payload)
      else await connectPostgres(payload)

      const existing = editingId
        ? saved.find((s) => s.id === editingId)
        : saved.find((s) => {
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
    class="flex max-h-[min(90vh,820px)] w-[min(980px,calc(100vw-2rem))] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-[980px]"
    showCloseButton={true}
  >
    <!-- Header -->
    <div class="shrink-0 border-b border-border px-6 py-4">
      <h2 class="text-lg font-semibold text-foreground">Connect to database</h2>
      <p class="mt-0.5 text-sm text-muted-foreground">
        Resume a recent connection or configure a new one.
      </p>
    </div>

    <!-- Two-panel body -->
    <div class="grid min-h-0 min-w-0 flex-1 grid-cols-1 md:grid-cols-[minmax(260px,320px)_minmax(0,1fr)]">

      <!-- Left: saved / recent -->
      <section class="flex min-h-[320px] min-w-0 flex-col border-b border-border bg-muted/20 md:min-h-0 md:border-b-0 md:border-r">
        <div class="flex shrink-0 items-center justify-between gap-2 px-5 py-4">
          <div>
            <h3 class="text-sm font-semibold text-foreground">Recent</h3>
            <p class="text-xs text-muted-foreground">{saved.length} saved connection{saved.length === 1 ? '' : 's'}</p>
          </div>
        </div>

        <ScrollArea class="min-h-0 flex-1 px-3 pb-4">
          {#if saved.length === 0}
            <div class="mx-2 flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-background/50 px-4 py-10 text-center">
              <Clock class="mb-3 size-8 text-muted-foreground/50" />
              <p class="text-sm font-medium text-foreground">No saved connections</p>
              <p class="mt-1 max-w-[200px] text-xs text-muted-foreground">
                Configure a connection on the right — it will appear here next time.
              </p>
            </div>
          {:else}
            <div class="flex flex-col gap-2 px-2">
              {#each saved as conn (conn.id)}
                {@const d = driver(conn.type)}
                {@const Icon = d.icon}
                {@const isLast = conn.id === lastId}
                {@const isSelected = conn.id === editingId}
                {@const isBusy = connecting === conn.id}
                <div
                  class="group relative rounded-xl border transition-all
                         {isSelected
                           ? 'border-ring bg-accent/40 shadow-sm'
                           : isLast
                             ? 'border-primary/25 bg-background hover:border-ring/40 hover:bg-accent/20'
                             : 'border-border/80 bg-background hover:border-ring/40 hover:bg-accent/20'}"
                >
                  <button
                    type="button"
                    class="flex w-full items-start gap-3 px-3.5 py-3 text-left"
                    onclick={() => selectSaved(conn)}
                  >
                    <div class="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Icon class="size-4 {d.color}" />
                    </div>
                    <div class="min-w-0 flex-1 pt-0.5">
                      <div class="flex items-center gap-2">
                        <span class="truncate text-sm font-medium text-foreground">{conn.name}</span>
                        {#if isLast}
                          <span class="shrink-0 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">Last used</span>
                        {/if}
                      </div>
                      <p class="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">{connDetail(conn)}</p>
                      {#if conn.lastConnectedAt}
                        <p class="mt-1 text-[10px] text-muted-foreground/70">{relativeTime(conn.lastConnectedAt)}</p>
                      {/if}
                    </div>
                  </button>

                  <div class="flex items-center gap-1 border-t border-border/60 px-2 py-1.5">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      class="h-7 flex-1 text-xs"
                      disabled={!!connecting}
                      onclick={() => connectWith(conn)}
                    >
                      {#if isBusy}
                        <Loader class="mr-1 size-3 animate-spin" />Connecting…
                      {:else if isLast}
                        Resume
                      {:else}
                        Connect
                      {/if}
                    </Button>
                    <button
                      type="button"
                      class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                      onclick={(e) => { e.stopPropagation(); handleDelete(conn.id) }}
                      aria-label="Delete connection"
                      title="Delete"
                    ><X class="size-3.5" /></button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </ScrollArea>
      </section>

      <!-- Right: new / edit connection -->
      <section class="flex min-h-0 min-w-0 flex-col overflow-hidden">
        <div class="flex shrink-0 items-center justify-between gap-3 border-b border-border px-6 py-4">
          <div>
            <h3 class="text-sm font-semibold text-foreground">
              {editingId ? 'Edit connection' : 'New connection'}
            </h3>
            <p class="text-xs text-muted-foreground">
              {editingId ? 'Update details and connect, or start fresh.' : 'Set up a database connection.'}
            </p>
          </div>
          {#if editingId}
            <Button type="button" variant="outline" size="sm" onclick={() => resetForm(null)}>
              Start fresh
            </Button>
          {/if}
        </div>

        <ScrollArea class="min-h-0 min-w-0 flex-1">
          <div class="flex min-w-0 flex-col gap-5 px-6 py-5">

            <div class="grid grid-cols-3 gap-2">
              {#each DRIVERS as d (d.id)}
                {@const Icon = d.icon}
                <button
                  type="button"
                  class="flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-colors
                         {dbType === d.id ? 'border-ring bg-accent/50 shadow-sm' : 'border-border hover:bg-accent/30'}"
                  onclick={() => {
                    const AUTO = ['Local PostgreSQL', 'Local SQLite', 'Cloudflare D1']
                    if (AUTO.includes(name)) name = defaultName(d.id)
                    dbType = d.id
                    connectionUri = ''
                    uriHint = ''
                  }}
                >
                  <Icon class="size-4 {dbType === d.id ? d.color : 'text-muted-foreground'}" />
                  <span class="text-[11px] font-medium {dbType === d.id ? 'text-foreground' : 'text-muted-foreground'}">{d.label}</span>
                </button>
              {/each}
            </div>

            <div class="flex flex-col gap-1.5">
              <Label for="cn-name" class="text-xs font-medium">Connection name</Label>
              <Input id="cn-name" bind:value={name} class="h-9 text-sm" />
            </div>

            {#if dbType === 'postgres'}
              <div class="flex flex-col gap-1.5">
                <Label for="cn-uri" class="text-xs font-medium">Connection URI</Label>
                <div class="flex gap-2">
                  <Input
                    id="cn-uri"
                    bind:value={connectionUri}
                    placeholder="postgresql://user:password@127.0.0.1:5432/postgres"
                    class="h-9 flex-1 font-mono text-sm"
                    onpaste={handleUriPaste}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyConnectionUri() } }}
                  />
                  <Button type="button" variant="outline" size="sm" class="shrink-0" onclick={applyConnectionUri} disabled={!connectionUri.trim()}>
                    Parse
                  </Button>
                </div>
                {#if uriHint}
                  <p class="text-xs {uriHintIsError(uriHint) ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}">{uriHint}</p>
                {:else}
                  <p class="text-xs text-muted-foreground">Paste a <code class="font-mono">postgresql://</code> URL to auto-fill fields.</p>
                {/if}
              </div>

              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-3">
                  <div class="grid grid-cols-[1fr_88px] gap-2">
                    <div class="flex flex-col gap-1.5">
                      <Label for="cn-host" class="text-xs font-medium">Host</Label>
                      <Input id="cn-host" bind:value={host} class="h-9 text-sm" />
                    </div>
                    <div class="flex flex-col gap-1.5">
                      <Label for="cn-port" class="text-xs font-medium">Port</Label>
                      <Input id="cn-port" type="number" bind:value={port} class="h-9 text-sm" />
                    </div>
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <Label for="cn-db" class="text-xs font-medium">Database</Label>
                    <Input id="cn-db" bind:value={database} class="h-9 text-sm" />
                  </div>
                </div>
                <div class="flex flex-col gap-3">
                  <div class="flex flex-col gap-1.5">
                    <Label for="cn-user" class="text-xs font-medium">User</Label>
                    <Input id="cn-user" bind:value={user} autocomplete="username" class="h-9 text-sm" />
                  </div>
                  <div class="flex flex-col gap-1.5">
                    <Label for="cn-pass" class="text-xs font-medium">Password</Label>
                    <Input id="cn-pass" type="password" bind:value={password} autocomplete="current-password" class="h-9 text-sm" />
                  </div>
                  <div class="flex items-center gap-2 pt-1">
                    <Checkbox id="cn-ssl" checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
                    <Label for="cn-ssl" class="text-xs font-normal text-muted-foreground cursor-pointer">Use SSL (sslmode=require)</Label>
                  </div>
                </div>
              </div>

            {:else if dbType === 'sqlite'}
              <div class="flex flex-col gap-1.5">
                <Label for="cn-uri" class="text-xs font-medium">Connection URI</Label>
                <div class="flex gap-2">
                  <Input
                    id="cn-uri"
                    bind:value={connectionUri}
                    placeholder="sqlite:///path/to/database.db"
                    class="h-9 flex-1 font-mono text-sm"
                    onpaste={handleUriPaste}
                    onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); applyConnectionUri() } }}
                  />
                  <Button type="button" variant="outline" size="sm" class="shrink-0" onclick={applyConnectionUri} disabled={!connectionUri.trim()}>
                    Parse
                  </Button>
                </div>
                {#if uriHint}
                  <p class="text-xs {uriHintIsError(uriHint) ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}">{uriHint}</p>
                {:else}
                  <p class="text-xs text-muted-foreground">Paste a <code class="font-mono">sqlite://</code> or <code class="font-mono">file://</code> URI.</p>
                {/if}
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="cn-path" class="text-xs font-medium">File path</Label>
                <Input id="cn-path" bind:value={filePath} placeholder="/path/to/database.db" class="h-9 font-mono text-sm" />
                <p class="text-xs text-muted-foreground">Absolute path or <code class="font-mono">:memory:</code></p>
              </div>

            {:else if dbType === 'd1'}
              <div class="grid grid-cols-2 gap-4">
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-acct" class="text-xs font-medium">Account ID</Label>
                  <Input id="cn-acct" bind:value={accountId} placeholder="abcdef1234567890…" class="h-9 font-mono text-sm" />
                </div>
                <div class="flex flex-col gap-1.5">
                  <Label for="cn-dbid" class="text-xs font-medium">Database ID</Label>
                  <Input id="cn-dbid" bind:value={databaseId} placeholder="xxxxxxxx-xxxx-…" class="h-9 font-mono text-sm" />
                </div>
              </div>
              <div class="flex flex-col gap-1.5">
                <Label for="cn-tok" class="text-xs font-medium">API Token</Label>
                <Input id="cn-tok" type="password" bind:value={apiToken} placeholder="Cloudflare API token (D1:Edit)" class="h-9 text-sm" />
              </div>
            {/if}
          </div>
        </ScrollArea>

        <!-- Footer actions -->
        <div class="shrink-0 border-t border-border bg-muted/10 px-6 py-4">
          {#if error}
            <div class="mb-3 rounded-md bg-destructive/8 px-3 py-2 text-xs text-destructive">{error}</div>
          {/if}
          {#if testOk}
            <div class="mb-3 rounded-md bg-emerald-500/10 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">Connection test successful</div>
          {/if}
          <div class="flex items-center justify-end gap-2">
            {#if dbType !== 'd1'}
              <Button type="button" variant="outline" size="sm" onclick={handleTest} disabled={testing || !!connecting}>
                {testing ? 'Testing…' : 'Test connection'}
              </Button>
            {/if}
            <Button type="button" size="sm" onclick={handleConnect} disabled={!!connecting || testing}>
              {#if connecting === (editingId ?? '__new__')}
                <Loader class="mr-1.5 size-3 animate-spin" />Connecting…
              {:else}
                {editingId ? 'Save & connect' : 'Connect'}
              {/if}
            </Button>
          </div>
        </div>
      </section>
    </div>
  </Dialog.Content>
</Dialog.Root>
