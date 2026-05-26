<script>
  import { tick } from 'svelte'
  import { executeSql } from '$lib/api.js'
  import Database from '@lucide/svelte/icons/database'
  import Check from '@lucide/svelte/icons/check'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import ChevronUp from '@lucide/svelte/icons/chevron-up'
  import HardDrive from '@lucide/svelte/icons/hard-drive'
  import Search from '@lucide/svelte/icons/search'
  import X from '@lucide/svelte/icons/x'
  import { cn } from '$lib/utils.js'

  let {
    /** @type {import('$lib/stores/connections.js').SavedConnection | null} */
    connection = null,
    onswitchtodb = /** @type {(dbName: string) => void} */ (() => {}),
  } = $props()

  let open = $state(false)
  /** @type {string[]} */
  let databases = $state([])
  let loading = $state(false)
  let error = $state('')
  let search = $state('')
  /** @type {HTMLButtonElement | null} */
  let triggerEl = $state(null)
  /** @type {HTMLDivElement | null} */
  let panelEl = $state(null)

  const currentDb = $derived(connection?.database ?? connection?.filePath ?? '')
  const isPostgres = $derived(connection?.type === 'postgres' || connection?.type === 'mysql')

  const filtered = $derived(
    search.trim()
      ? databases.filter((d) => d.toLowerCase().includes(search.toLowerCase()))
      : databases
  )

  async function fetchDatabases() {
    if (!isPostgres) return
    loading = true; error = ''
    try {
      const result = await executeSql(
        `SELECT datname FROM pg_catalog.pg_database WHERE datistemplate = false ORDER BY datname`
      )
      databases = (result?.rows ?? []).map((r) => String(r[0]))
    } catch (e) {
      error = String(e)
      databases = []
    } finally {
      loading = false
    }
  }

  async function open_() {
    open = true
    search = ''
    if (databases.length === 0) await fetchDatabases()
    await tick()
    panelEl?.querySelector('input')?.focus()
  }

  function close() {
    open = false
    search = ''
  }

  function switchTo(dbName) {
    if (dbName === currentDb) { close(); return }
    close()
    onswitchtodb(dbName)
  }

  function handleKeydown(/** @type {KeyboardEvent} */ e) {
    if (e.key === 'Escape') { e.stopPropagation(); close() }
  }

  // Close on outside click
  $effect(() => {
    if (!open) return
    function onPointerDown(/** @type {PointerEvent} */ e) {
      if (
        triggerEl && !triggerEl.contains(/** @type {Node} */ (e.target)) &&
        panelEl && !panelEl.contains(/** @type {Node} */ (e.target))
      ) close()
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  })
</script>

<div class="relative">
  <!-- Trigger button -->
  <button
    bind:this={triggerEl}
    type="button"
    class={cn(
      'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
      open ? 'bg-accent text-foreground' : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
    )}
    onclick={() => open ? close() : open_()}
    title="Switch database"
    disabled={!isPostgres}
  >
    {#if connection?.type === 'sqlite'}
      <HardDrive class="size-3.5 shrink-0 opacity-60" />
    {:else}
      <Database class="size-3.5 shrink-0 opacity-60" />
    {/if}
    <span class="min-w-0 flex-1 truncate font-mono text-ui-xs font-medium">
      {currentDb || connection?.name || 'database'}
    </span>
    {#if isPostgres}
      <ChevronUp class={cn('size-3 shrink-0 opacity-40 transition-transform', !open && 'rotate-180')} />
    {/if}
  </button>

  <!-- Dropdown panel — floats above the button -->
  {#if open}
    <div
      bind:this={panelEl}
      class="absolute bottom-full left-0 right-0 z-50 mb-1.5 flex flex-col overflow-hidden rounded-xl border border-border/60 bg-popover shadow-xl"
      style="max-height: min(320px, 60vh)"
      onkeydown={handleKeydown}
    >
      <!-- Header -->
      <div class="flex shrink-0 items-center justify-between border-b border-border/50 px-3 py-2">
        <div class="flex items-center gap-1.5">
          <Database class="size-3 text-muted-foreground/60" />
          <span class="font-mono text-[11px] font-medium text-muted-foreground">
            {connection?.host ?? 'databases'}
          </span>
        </div>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
            onclick={fetchDatabases}
            title="Refresh"
          >
            <RefreshCw class={cn('size-3', loading && 'animate-spin')} />
          </button>
          <button
            type="button"
            class="inline-flex size-5 items-center justify-center rounded text-muted-foreground/50 transition-colors hover:bg-accent hover:text-foreground"
            onclick={close}
          >
            <X class="size-3" />
          </button>
        </div>
      </div>

      <!-- Search -->
      {#if databases.length > 5}
        <div class="relative shrink-0 border-b border-border/40 px-2 py-1.5">
          <Search class="pointer-events-none absolute left-4 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/40" />
          <input
            type="text"
            placeholder="Filter databases…"
            class="h-6 w-full rounded border border-transparent bg-muted/40 pl-7 pr-2 font-mono text-[11px] text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/40"
            bind:value={search}
          />
        </div>
      {/if}

      <!-- Database list -->
      <div class="app-scroll min-h-0 flex-1 overflow-y-auto py-1">
        {#if loading}
          <div class="flex items-center justify-center gap-2 py-6 text-muted-foreground/50">
            <RefreshCw class="size-3.5 animate-spin" />
            <span class="font-mono text-[11px]">Loading databases…</span>
          </div>
        {:else if error}
          <div class="px-3 py-4 text-center font-mono text-[11px] text-destructive/80">{error}</div>
        {:else if filtered.length === 0}
          <div class="px-3 py-4 text-center font-mono text-[11px] text-muted-foreground/50">
            {search ? 'No match' : 'No databases found'}
          </div>
        {:else}
          {#each filtered as db (db)}
            {@const isCurrent = db === currentDb}
            <button
              type="button"
              class={cn(
                'flex w-full items-center gap-2.5 px-3 py-1.5 text-left transition-colors',
                isCurrent
                  ? 'bg-primary/10 text-foreground'
                  : 'text-foreground/80 hover:bg-accent/60 hover:text-foreground',
              )}
              onclick={() => switchTo(db)}
            >
              <Database class={cn('size-3 shrink-0', isCurrent ? 'text-primary' : 'text-muted-foreground/40')} />
              <span class="min-w-0 flex-1 truncate font-mono text-[12px]">{db}</span>
              {#if isCurrent}
                <span class="flex items-center gap-1 shrink-0">
                  <Check class="size-3 text-primary" />
                  <span class="font-mono text-[10px] text-primary/70">current</span>
                </span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <!-- Footer hint -->
      <div class="shrink-0 border-t border-border/40 px-3 py-1.5">
        <p class="font-mono text-[10px] text-muted-foreground/40">
          {databases.length} database{databases.length === 1 ? '' : 's'} on {connection?.host ?? 'server'}
        </p>
      </div>
    </div>
  {/if}
</div>
