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
  import ResizeHandle from './ResizeHandle.svelte'
  import TableListSkeleton from './TableListSkeleton.svelte'
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

  const filteredTables = $derived(
    tables.filter((t) => t.name.toLowerCase().includes(tableFilter.toLowerCase())),
  )
</script>

<div class="flex h-full shrink-0" style:width="{width}px" data-studio-region="sidebar">
  <aside class="flex h-full min-w-0 flex-1 flex-col bg-sidebar text-sidebar-foreground">
  <div class="flex min-h-0 flex-1 flex-col">
    {#if connectionName}
      <div class="flex gap-0.5 border-b border-sidebar-border px-1.5 py-1.5">
        <button
          type="button"
          class={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-[11px] transition-colors',
            activeView === 'table'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground',
          )}
          title="Data view (⌘⇧D)"
          onclick={() => onviewchange('table')}
        >
          <Table2 class="size-3" />
          Data
        </button>
        <button
          type="button"
          class={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-md py-1 text-[11px] transition-colors',
            activeView === 'sql'
              ? 'bg-sidebar-accent text-sidebar-accent-foreground'
              : 'text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground',
          )}
          title="SQL editor (⌘⇧S)"
          onclick={() => onviewchange('sql')}
        >
          <Terminal class="size-3" />
          SQL
        </button>
      </div>
    {/if}

    <div class="flex items-center gap-1.5 px-2.5 py-2.5">
      <span class="shrink-0 text-[12px] text-muted-foreground">schema:</span>
      {#if schemas.length === 0}
        <span class="min-w-0 flex-1 truncate text-[12px] font-medium text-foreground">—</span>
      {:else}
        <Select.Root
          type="single"
          value={activeSchema}
          onValueChange={(v) => {
            if (v) onschemachange(v)
          }}
        >
          <Select.Trigger
            class="h-6 min-w-0 flex-1 gap-1 border-0 bg-transparent px-0 text-[12px] font-medium shadow-none focus-visible:ring-0 [&>svg]:size-3"
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
          value={tableFilter}
          oninput={(e) => ontablefilter(e.currentTarget.value)}
          class="h-7 w-full rounded-md border border-border bg-background/40 pl-7 pr-2 text-[12px] outline-none focus:border-border focus:ring-1 focus:ring-ring/30"
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
      <p class="px-3 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
        Tables
      </p>
      <ScrollArea class="min-h-0 w-full flex-1">
        {#if loadingTables}
          <TableListSkeleton />
        {:else}
        <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-2">
          {#if tables.length === 0}
            <li class="flex w-full flex-col items-center gap-2 px-4 py-10 text-center">
              <Table2 class="size-7 text-muted-foreground/25" />
              <p class="text-[12px] text-muted-foreground">
                No tables in {activeSchema || 'schema'}
              </p>
            </li>
          {:else if filteredTables.length === 0}
            <li class="flex w-full flex-col items-center gap-2 px-4 py-8 text-center">
              <Search class="size-6 text-muted-foreground/25" />
              <p class="text-[12px] text-muted-foreground">No tables match your search</p>
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
                  <span class="min-w-0 truncate font-mono text-[12px] leading-none">{table.name}</span>
                  <span
                    class="shrink-0 font-mono text-[11px] leading-none tabular-nums text-muted-foreground"
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
      class="min-w-0 flex-1 truncate px-1 text-[10px] text-muted-foreground"
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
