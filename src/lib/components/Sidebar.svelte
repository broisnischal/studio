<script>
  import Search from '@lucide/svelte/icons/search'
  import Table2 from '@lucide/svelte/icons/table-2'
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

  let {
    connectionName = '',
    schemas = [],
    tables = [],
    activeSchema = $bindable('public'),
    activeTable = null,
    activeView = 'table',
    tableFilter = '',
    loadingTables = false,
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

  const filteredTables = $derived(
    tables.filter((t) => t.name.toLowerCase().includes(localFilter.toLowerCase())),
  )
</script>

<div class="flex h-full shrink-0" style:width="{width}px" data-studio-region="sidebar">
  <aside
    class="studio-chrome flex h-full min-w-0 flex-1 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    data-studio-chrome
  >
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
      <p class="px-3 pb-1 text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase">
        Tables
      </p>
      <ScrollArea class="min-h-0 w-full flex-1">
        {#if loadingTables}
          <div class="flex items-center justify-center py-8" role="status" aria-label="Loading tables">
            <span class="inline-flex gap-1.5" aria-hidden="true">
              <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 0ms"></span>
              <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 150ms"></span>
              <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50" style="animation-delay: 300ms"></span>
            </span>
          </div>
        {:else}
        <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-2">
          {#if tables.length === 0}
            <li class="flex w-full flex-col items-center gap-2 px-4 py-10 text-center">
              <Table2 class="size-7 text-muted-foreground/25" />
              <p class="text-ui-sm text-muted-foreground">
                No tables in {activeSchema || 'schema'}
              </p>
            </li>
          {:else if filteredTables.length === 0}
            <li class="flex w-full flex-col items-center gap-2 px-4 py-8 text-center">
              <Search class="size-6 text-muted-foreground/25" />
              <p class="text-ui-sm text-muted-foreground">No tables match your search</p>
            </li>
          {:else}
            {#each filteredTables as table (table.name)}
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
