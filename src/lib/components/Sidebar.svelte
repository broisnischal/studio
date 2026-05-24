<script>
  import { onMount } from 'svelte'
  import { getCurrentWindow } from '@tauri-apps/api/window'
  import Search from '@lucide/svelte/icons/search'
  import Table2 from '@lucide/svelte/icons/table-2'
  import Eye from '@lucide/svelte/icons/eye'
  import Layers from '@lucide/svelte/icons/layers'
  import Zap from '@lucide/svelte/icons/zap'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import Terminal from '@lucide/svelte/icons/terminal'
  import Command from '@lucide/svelte/icons/command'
  import ListFilter from '@lucide/svelte/icons/list-filter'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import Plus from '@lucide/svelte/icons/plus'
  import Settings from '@lucide/svelte/icons/settings'
  import Unplug from '@lucide/svelte/icons/unplug'
  import { ScrollArea } from '$lib/components/ui/scroll-area/index.js'
  import * as Select from '$lib/components/ui/select/index.js'
  import * as Tabs from '$lib/components/ui/tabs/index.js'
  import ResizeHandle from './ResizeHandle.svelte'
  import { cn } from '$lib/utils.js'
  import { formatTableRowCount } from '$lib/table-list.js'
  import {
    clampNavSidebarWidth,
    loadLayout,
    saveLayout,
  } from '$lib/stores/layout.js'

  const initialLayout = loadLayout()
  let width = $state(initialLayout.navSidebarWidth)
  let resizeStartWidth = initialLayout.navSidebarWidth

  // Detect Tauri at mount time (inside onMount) to handle any injection delay
  let isTauri = $state(false)
  let maximized = $state(false)

  onMount(() => {
    isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    if (!isTauri) return

    const win = getCurrentWindow()
    win.isMaximized().then((v) => { maximized = v }).catch(() => {})

    const unlistenP = win.listen('tauri://resize', async () => {
      maximized = await win.isMaximized()
    })

    return () => { unlistenP.then((fn) => fn()).catch(() => {}) }
  })

  async function winClose() {
    if (!isTauri) return
    try { await getCurrentWindow().close() } catch (e) { console.error('winClose:', e) }
  }

  async function winMinimize() {
    if (!isTauri) return
    try { await getCurrentWindow().minimize() } catch (e) { console.error('winMinimize:', e) }
  }

  async function winToggleMaximize() {
    if (!isTauri) return
    try { await getCurrentWindow().toggleMaximize() } catch (e) { console.error('winToggleMaximize:', e) }
  }

  let {
    connectionName = '',
    schemas = [],
    tables = [],
    activeSchema = $bindable('public'),
    activeTable = null,
    activeView = 'table',
    tableFilter = '',
    loadingTables = false,
    indexes = [],
    onschemachange = () => {},
    onviewchange = () => {},
    onopencommand = () => {},
    ontableselect = () => {},
    ontablefilter = () => {},
    onrefresh = () => {},
    onopensettings = () => {},
    ondisconnect = () => {},
  } = $props()

  let localFilter = $state(tableFilter)
  let filterDebounce = /** @type {ReturnType<typeof setTimeout> | null} */ (null)

  // Section open/collapsed state
  let tablesOpen = $state(true)
  let viewsOpen = $state(true)
  let matViewsOpen = $state(true)
  let indexesOpen = $state(true)

  // Sync from parent when it resets externally (e.g. connection change)
  $effect(() => {
    localFilter = tableFilter
  })

  /** @param {string} value */
  function handleFilterInput(value) {
    localFilter = value
    if (filterDebounce) clearTimeout(filterDebounce)
    filterDebounce = setTimeout(() => {
      filterDebounce = null
      ontablefilter(value)
    }, 200)
  }

  const lf = $derived(localFilter.toLowerCase())

  const regularTables = $derived(tables.filter((t) => !t.kind || t.kind === 'table' || t.kind === 'foreign_table'))
  const views = $derived(tables.filter((t) => t.kind === 'view'))
  const matViews = $derived(tables.filter((t) => t.kind === 'materialized_view'))

  const filteredRegularTables = $derived(regularTables.filter((t) => t.name.toLowerCase().includes(lf)))
  const filteredViews = $derived(views.filter((t) => t.name.toLowerCase().includes(lf)))
  const filteredMatViews = $derived(matViews.filter((t) => t.name.toLowerCase().includes(lf)))
  const filteredIndexes = $derived(
    indexes.filter((i) => i.name.toLowerCase().includes(lf) || i.tableName.toLowerCase().includes(lf))
  )
</script>

<div class="flex h-full shrink-0" style:width="{width}px" data-studio-region="sidebar">
  <aside
    class="studio-chrome flex h-full min-w-0 flex-1 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    data-studio-chrome
  >
  {#if isTauri}
    <!--
      Traffic light row: buttons sit outside the drag region so they always
      receive click events; the flex-1 filler to the right is the drag target.
    -->
    <div class="traffic-group flex h-9 shrink-0 items-center border-b border-sidebar-border">
      <!-- buttons — NOT inside data-tauri-drag-region -->
      <div class="flex shrink-0 items-center gap-[7px] px-[14px]">
        <button
          type="button"
          class="traffic-dot traffic-close"
          onclick={winClose}
          aria-label="Close window"
          title="Close"
        >
          <svg class="traffic-icon" viewBox="0 0 8 8" width="7" height="7" fill="none">
            <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <button
          type="button"
          class="traffic-dot traffic-minimize"
          onclick={winMinimize}
          aria-label="Minimize window"
          title="Minimize"
        >
          <svg class="traffic-icon" viewBox="0 0 8 8" width="7" height="7" fill="none">
            <path d="M1 4h6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
        <button
          type="button"
          class="traffic-dot traffic-maximize"
          onclick={winToggleMaximize}
          aria-label={maximized ? 'Restore window' : 'Maximize window'}
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {#if maximized}
            <svg class="traffic-icon" viewBox="0 0 8 8" width="7" height="7" fill="none">
              <path d="M2.5 1.5v4h4M1.5 2.5h4v4" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          {:else}
            <svg class="traffic-icon" viewBox="0 0 8 8" width="7" height="7" fill="none">
              <rect x="1.5" y="1.5" width="5" height="5" rx="0.5" stroke="currentColor" stroke-width="1.1"/>
            </svg>
          {/if}
        </button>
      </div>
      <!-- drag region fills the rest of the strip -->
      <div class="min-w-0 flex-1 self-stretch" data-tauri-drag-region role="none" ondblclick={winToggleMaximize}></div>
    </div>
  {/if}
  <div class="flex min-h-0 flex-1 flex-col">
    {#if connectionName}
      <div class="flex h-9 shrink-0 items-center border-b border-sidebar-border px-2">
        <Tabs.Root
          value={activeView}
          onValueChange={(v) => {
            if (v === 'table' || v === 'sql') onviewchange(v)
          }}
          class="w-full"
        >
          <Tabs.List class="h-7 w-full gap-0.5 rounded-md bg-muted/50 p-0.5">
            <Tabs.Trigger
              value="table"
              class="h-full flex-1 gap-1.5 rounded-sm text-ui-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground/70"
              title="Data view (⌘⇧D)"
            >
              <Table2 class="size-3 shrink-0 opacity-60" />
              Data
            </Tabs.Trigger>
            <Tabs.Trigger
              value="sql"
              class="h-full flex-1 gap-1.5 rounded-sm text-ui-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground/70"
              title="SQL editor (⌘⇧S)"
            >
              <Terminal class="size-3 shrink-0 opacity-60" />
              SQL
            </Tabs.Trigger>
          </Tabs.List>
        </Tabs.Root>
      </div>
    {/if}

    <div class="flex items-center gap-1.5 px-2.5 py-2.5">
      <span class="shrink-0 text-ui-sm text-muted-foreground">schema:</span>
      {#if schemas.length === 0}
        <span class="min-w-0 flex-1 truncate text-ui-sm font-medium text-foreground">—</span>
      {:else}
        <Select.Root
          type="single"
          value={activeSchema}
          onValueChange={(v) => {
            if (v) onschemachange(v)
          }}
        >
          <Select.Trigger
            class="h-6 min-w-0 flex-1 gap-1 border-0 bg-transparent px-0 text-ui-sm font-medium shadow-none focus-visible:ring-0 [&>svg]:size-3"
          >
            <span class="truncate">{activeSchema}</span>
          </Select.Trigger>
          <Select.Content>
            {#each schemas as schema (schema)}
              <Select.Item value={schema} label={schema} />
            {/each}
          </Select.Content>
        </Select.Root>
      {/if}
    </div>

    <div class="flex items-center gap-1 px-2 pb-1.5">
      <div class="relative min-w-0 flex-1">
        <Search
          class="pointer-events-none absolute top-1/2 left-2 size-3 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          placeholder=""
          value={localFilter}
          oninput={(e) => handleFilterInput(e.currentTarget.value)}
          class="h-7 w-full rounded-md border border-border bg-background/40 pl-7 pr-2 text-ui-sm outline-none focus:border-border focus:ring-1 focus:ring-ring/30"
        />
      </div>
      <button
        type="button"
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Filter tables"
        disabled
      >
        <ListFilter class="size-3.5" />
      </button>
      <button
        type="button"
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
        title="Refresh tables (⌘R)"
        disabled={loadingTables}
        onclick={onrefresh}
      >
        <RefreshCw class={cn('size-3.5', loadingTables && 'animate-spin')} />
      </button>
      <button
        type="button"
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="New table"
        disabled
      >
        <Plus class="size-3.5" />
      </button>
    </div>

    <div class="flex min-h-0 flex-1 flex-col">
      <ScrollArea class="min-h-0 w-full flex-1">
        {#if loadingTables}
          <div class="flex items-center justify-center py-8" role="status" aria-label="Loading">
            <span class="inline-flex gap-1.5" aria-hidden="true">
              <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 0ms"></span>
              <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 150ms"></span>
              <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 300ms"></span>
            </span>
          </div>
        {:else}

        <!-- ── Tables ─────────────────────────────────────────── -->
        <button
          type="button"
          class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1 text-left"
          onclick={() => { tablesOpen = !tablesOpen }}
        >
          <ChevronDown class={cn('size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150', !tablesOpen && '-rotate-90')} />
          <span class="text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase">Tables</span>
          {#if regularTables.length > 0}
            <span class="ml-auto font-mono text-ui-2xs text-muted-foreground/60">{regularTables.length}</span>
          {/if}
        </button>
        {#if tablesOpen}
          <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
            {#if regularTables.length === 0}
              <li class="flex w-full flex-col items-center gap-2 px-4 py-8 text-center">
                <Table2 class="size-7 text-muted-foreground/25" />
                <p class="text-ui-sm text-muted-foreground">No tables in {activeSchema || 'schema'}</p>
              </li>
            {:else if filteredRegularTables.length === 0}
              <li class="px-3 py-3 text-center text-ui-xs text-muted-foreground">No tables match</li>
            {:else}
              {#each filteredRegularTables as table (table.name)}
                <li>
                  <button
                    type="button"
                    class={cn(
                      'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                      activeTable === table.name
                        ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                        : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
                    )}
                    onclick={() => ontableselect(table.name)}
                  >
                    <Table2 class="size-3 shrink-0 opacity-50" />
                    <span class="min-w-0 truncate font-mono text-ui-sm leading-none">{table.name}</span>
                    <span
                      class="shrink-0 font-mono text-ui-xs leading-none tabular-nums text-muted-foreground"
                      title={table.rowCount != null ? Number(table.rowCount).toLocaleString('en-US') : undefined}
                    >
                      {formatTableRowCount(table.rowCount)}
                    </span>
                  </button>
                </li>
              {/each}
            {/if}
          </ul>
        {/if}

        <!-- ── Views ──────────────────────────────────────────── -->
        {#if views.length > 0 || filteredViews.length > 0}
          <button
            type="button"
            class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1 text-left"
            onclick={() => { viewsOpen = !viewsOpen }}
          >
            <ChevronDown class={cn('size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150', !viewsOpen && '-rotate-90')} />
            <span class="text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase">Views</span>
            {#if views.length > 0}
              <span class="ml-auto font-mono text-ui-2xs text-muted-foreground/60">{views.length}</span>
            {/if}
          </button>
          {#if viewsOpen}
            <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
              {#if filteredViews.length === 0}
                <li class="px-3 py-3 text-center text-ui-xs text-muted-foreground">No views match</li>
              {:else}
                {#each filteredViews as view (view.name)}
                  <li>
                    <button
                      type="button"
                      class={cn(
                        'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                        activeTable === view.name
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
                      )}
                      onclick={() => ontableselect(view.name)}
                    >
                      <Eye class="size-3 shrink-0 opacity-50" />
                      <span class="min-w-0 truncate font-mono text-ui-sm leading-none">{view.name}</span>
                    </button>
                  </li>
                {/each}
              {/if}
            </ul>
          {/if}
        {/if}

        <!-- ── Materialized Views ─────────────────────────────── -->
        {#if matViews.length > 0 || filteredMatViews.length > 0}
          <button
            type="button"
            class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1 text-left"
            onclick={() => { matViewsOpen = !matViewsOpen }}
          >
            <ChevronDown class={cn('size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150', !matViewsOpen && '-rotate-90')} />
            <span class="text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase">Materialized Views</span>
            {#if matViews.length > 0}
              <span class="ml-auto font-mono text-ui-2xs text-muted-foreground/60">{matViews.length}</span>
            {/if}
          </button>
          {#if matViewsOpen}
            <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
              {#if filteredMatViews.length === 0}
                <li class="px-3 py-3 text-center text-ui-xs text-muted-foreground">No materialized views match</li>
              {:else}
                {#each filteredMatViews as mv (mv.name)}
                  <li>
                    <button
                      type="button"
                      class={cn(
                        'flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors',
                        activeTable === mv.name
                          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                          : 'text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground',
                      )}
                      onclick={() => ontableselect(mv.name)}
                    >
                      <Layers class="size-3 shrink-0 opacity-50" />
                      <span class="min-w-0 truncate font-mono text-ui-sm leading-none">{mv.name}</span>
                      <span class="shrink-0 font-mono text-ui-xs leading-none tabular-nums text-muted-foreground">
                        {formatTableRowCount(mv.rowCount)}
                      </span>
                    </button>
                  </li>
                {/each}
              {/if}
            </ul>
          {/if}
        {/if}

        <!-- ── Indexes ─────────────────────────────────────────── -->
        {#if indexes.length > 0 || filteredIndexes.length > 0}
          <button
            type="button"
            class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1 text-left"
            onclick={() => { indexesOpen = !indexesOpen }}
          >
            <ChevronDown class={cn('size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150', !indexesOpen && '-rotate-90')} />
            <span class="text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase">Indexes</span>
            {#if indexes.length > 0}
              <span class="ml-auto font-mono text-ui-2xs text-muted-foreground/60">{indexes.length}</span>
            {/if}
          </button>
          {#if indexesOpen}
            <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-2">
              {#if filteredIndexes.length === 0}
                <li class="px-3 py-3 text-center text-ui-xs text-muted-foreground">No indexes match</li>
              {:else}
                {#each filteredIndexes as idx (idx.name)}
                  <li>
                    <button
                      type="button"
                      class="flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground"
                      onclick={() => ontableselect(idx.tableName)}
                      title="Open table: {idx.tableName}"
                    >
                      <div class="flex w-full min-w-0 items-center gap-2">
                        <Zap class="size-3 shrink-0 opacity-50" />
                        <span class="min-w-0 truncate font-mono text-ui-sm leading-none">{idx.name}</span>
                        {#if idx.isPrimary}
                          <span class="shrink-0 rounded px-1 py-px text-ui-3xs font-medium bg-primary/10 text-primary">PK</span>
                        {:else if idx.isUnique}
                          <span class="shrink-0 rounded px-1 py-px text-ui-3xs font-medium bg-muted text-muted-foreground">UNQ</span>
                        {/if}
                      </div>
                      <div class="flex w-full min-w-0 items-center gap-1 pl-5">
                        <span class="min-w-0 truncate text-ui-2xs text-muted-foreground/60">{idx.tableName}{idx.columns ? ` · ${idx.columns}` : ''}</span>
                        {#if idx.indexType && idx.indexType !== 'btree'}
                          <span class="shrink-0 font-mono text-ui-2xs text-muted-foreground/50">{idx.indexType}</span>
                        {/if}
                      </div>
                    </button>
                  </li>
                {/each}
              {/if}
            </ul>
          {/if}
        {/if}

        {/if}
      </ScrollArea>
    </div>
  </div>

  <footer class="flex items-center gap-1 border-t border-sidebar-border px-2 py-2">
    <span
      class="min-w-0 flex-1 truncate px-1 text-ui-2xs text-muted-foreground"
      title={connectionName || 'Not connected'}
    >
      {connectionName || 'DB Studio'}
    </span>
    <button
      type="button"
      class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Command menu (⌘K)"
      onclick={onopencommand}
    >
      <Command class="size-3.5" />
    </button>
    <button
      type="button"
      class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Settings"
      onclick={onopensettings}
    >
      <Settings class="size-3.5" />
    </button>
    {#if connectionName}
      <button
        type="button"
        class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
        title="Disconnect"
        onclick={ondisconnect}
      >
        <Unplug class="size-3.5" />
      </button>
    {/if}
  </footer>
  </aside>
  <ResizeHandle
    edge="end"
    onresizestart={() => {
      resizeStartWidth = width
    }}
    onresize={(dx) => {
      width = clampNavSidebarWidth(resizeStartWidth + dx)
    }}
    onresizeend={() => {
      resizeStartWidth = width
      saveLayout({ navSidebarWidth: width })
    }}
  />
</div>

<style>
  .traffic-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: none;
    cursor: default;
    flex-shrink: 0;
    transition: opacity 0.1s;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }
  .traffic-dot:active { opacity: 0.55; }

  /* Standard macOS traffic light colours */
  .traffic-close    { background-color: #ff5f57; color: #7c0902; }
  .traffic-minimize { background-color: #ffbd2e; color: #7c4d00; }
  .traffic-maximize { background-color: #27c93f; color: #0a5c1d; }

  /* Icons hidden by default, revealed when any dot in the group is hovered */
  .traffic-icon {
    opacity: 0;
    transition: opacity 0.08s;
    pointer-events: none;
    flex-shrink: 0;
  }

  /* Hover on the button group shows all icons simultaneously */
  .traffic-group:hover .traffic-icon {
    opacity: 1;
  }

  /* Dim when window doesn't have focus / group not hovered */
  .traffic-group:not(:hover) .traffic-dot {
    opacity: 0.45;
  }
</style>
