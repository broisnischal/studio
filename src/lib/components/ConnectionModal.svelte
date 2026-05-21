<script>
  import Database from '@lucide/svelte/icons/database'
  import X from '@lucide/svelte/icons/x'
  import { testPostgresConnection, connectPostgres } from '$lib/api.js'
  import {
    loadSavedConnections,
    upsertConnection,
    removeConnection,
    newConnectionId,
  } from '$lib/stores/connections.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import * as Tabs from '$lib/components/ui/tabs/index.js'

  let {
    open = $bindable(false),
    onconnected = () => {},
  } = $props()

  let saved = $state([])
  let tab = $state('new')
  let testing = $state(false)
  let connecting = $state(false)
  let error = $state('')
  let testOk = $state(false)

  let name = $state('Local PostgreSQL')
  let host = $state('127.0.0.1')
  let port = $state('5432')
  let database = $state('postgres')
  let user = $state('postgres')
  let password = $state('')
  let ssl = $state(false)

  function formPayload() {
    return { name, host, port, database, user, password, ssl }
  }

  function refreshSaved() {
    saved = loadSavedConnections()
  }

  $effect(() => {
    if (open) refreshSaved()
  })

  function resetForm(conn) {
    name = conn?.name ?? 'Local PostgreSQL'
    host = conn?.host ?? '127.0.0.1'
    port = String(conn?.port ?? 5432)
    database = conn?.database ?? 'postgres'
    user = conn?.user ?? 'postgres'
    password = conn?.password ?? ''
    ssl = Boolean(conn?.ssl)
    error = ''
    testOk = false
  }

  function useSaved(conn) {
    resetForm(conn)
    tab = 'new'
  }

  async function handleTest() {
    testing = true
    error = ''
    testOk = false
    try {
      await testPostgresConnection(formPayload())
      testOk = true
    } catch (e) {
      error = String(e)
    } finally {
      testing = false
    }
  }

  async function handleConnect() {
    connecting = true
    error = ''
    try {
      const payload = formPayload()
      await connectPostgres(payload)
      const id = saved.find((s) => s.host === payload.host && s.database === payload.database)?.id
      saved = upsertConnection({
        id: id ?? newConnectionId(),
        ...payload,
        port: Number(payload.port) || 5432,
      })
      onconnected(payload)
      open = false
    } catch (e) {
      error = String(e)
    } finally {
      connecting = false
    }
  }

  function handleDelete(id) {
    saved = removeConnection(id)
    if (saved.length === 0) tab = 'new'
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-md gap-0 p-0 sm:max-w-md">
    <Dialog.Header class="gap-1 border-b border-border px-6 py-5">
      <div class="flex items-start gap-3">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Database class="size-4 text-muted-foreground" />
        </div>
        <div class="flex flex-col gap-1">
          <Dialog.Title class="text-base font-semibold">Connect to PostgreSQL</Dialog.Title>
          <Dialog.Description class="text-sm text-muted-foreground">
            Add a database connection to explore schemas and tables.
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <Tabs.Root bind:value={tab} class="px-6 pt-4">
      <Tabs.List class="grid w-full grid-cols-2">
        <Tabs.Trigger value="new">New connection</Tabs.Trigger>
        <Tabs.Trigger value="saved" disabled={saved.length === 0}>
          Saved ({saved.length})
        </Tabs.Trigger>
      </Tabs.List>

      <Tabs.Content value="saved" class="mt-4 flex flex-col gap-2">
        {#if saved.length === 0}
          <p class="text-sm text-muted-foreground">No saved connections.</p>
        {:else}
          {#each saved as conn (conn.id)}
            <div class="flex items-center gap-2">
              <button
                type="button"
                class="flex min-w-0 flex-1 flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2.5 text-left transition-colors hover:bg-accent"
                onclick={() => useSaved(conn)}
              >
                <span class="truncate text-sm font-medium">{conn.name}</span>
                <span class="truncate font-mono text-xs text-muted-foreground">
                  {conn.user}@{conn.host}:{conn.port}/{conn.database}
                </span>
              </button>
              <button
                type="button"
                class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label="Remove saved connection"
                onclick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  handleDelete(conn.id)
                }}
              >
                <X class="size-4" />
              </button>
            </div>
          {/each}
        {/if}
      </Tabs.Content>

      <Tabs.Content value="new" class="mt-4">
        <div class="flex flex-col gap-4">
          <div class="flex flex-col gap-2">
            <Label for="conn-name">Connection name</Label>
            <Input id="conn-name" bind:value={name} required />
          </div>

          <div class="grid grid-cols-[1fr_100px] gap-3">
            <div class="flex flex-col gap-2">
              <Label for="conn-host">Host</Label>
              <Input id="conn-host" bind:value={host} required />
            </div>
            <div class="flex flex-col gap-2">
              <Label for="conn-port">Port</Label>
              <Input id="conn-port" type="number" bind:value={port} required />
            </div>
          </div>

          <div class="flex flex-col gap-2">
            <Label for="conn-db">Database</Label>
            <Input id="conn-db" bind:value={database} required />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="flex flex-col gap-2">
              <Label for="conn-user">User</Label>
              <Input id="conn-user" bind:value={user} autocomplete="username" required />
            </div>
            <div class="flex flex-col gap-2">
              <Label for="conn-pass">Password</Label>
              <Input
                id="conn-pass"
                type="password"
                bind:value={password}
                autocomplete="current-password"
              />
            </div>
          </div>

          <div class="flex items-center gap-2.5">
            <Checkbox checked={ssl} onCheckedChange={(v) => (ssl = v === true)} />
            <Label class="font-normal text-muted-foreground">Use SSL (sslmode=require)</Label>
          </div>
        </div>
      </Tabs.Content>
    </Tabs.Root>

    {#if error}
      <p class="px-6 pt-3 text-sm text-destructive">{error}</p>
    {/if}
    {#if testOk}
      <p class="px-6 pt-3 text-sm text-muted-foreground">Connection test successful.</p>
    {/if}

    <Dialog.Footer class="flex-row justify-end gap-2 border-t border-border px-6 py-4">
      <Button type="button" variant="outline" onclick={handleTest} disabled={testing || connecting}>
        {testing ? 'Testing…' : 'Test connection'}
      </Button>
      <Button type="button" onclick={handleConnect} disabled={connecting || testing}>
        {connecting ? 'Connecting…' : 'Connect'}
      </Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
