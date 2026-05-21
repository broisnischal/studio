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
  import { cn } from '$lib/utils.js'

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

<aside class="flex h-full w-[220px] shrink-0 flex-col bg-sidebar text-sidebar-foreground">
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
        title="Refresh tables"
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

    <ScrollArea class="min-h-0 flex-1">
      <ul class="flex flex-col px-1 pb-2">
        {#if loadingTables}
          <li class="px-2.5 py-2 text-[12px] text-muted-foreground">Loading…</li>
        {:else if tables.length === 0}
          <li class="px-2.5 py-2 text-[12px] text-muted-foreground">
            No tables in {activeSchema || 'schema'}
          </li>
        {:else if filteredTables.length === 0}
          <li class="px-2.5 py-2 text-[12px] text-muted-foreground">No match</li>
        {:else}
          {#each filteredTables as table (table.name)}
            <li>
              <button
                type="button"
                class={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition-colors',
                  activeTable === table.name
                    ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                    : 'text-muted-foreground hover:bg-sidebar-accent/40 hover:text-foreground',
                )}
                onclick={() => ontableselect(table.name)}
              >
                <Table2 class="size-3 shrink-0 opacity-50" />
                <span class="min-w-0 flex-1 truncate font-mono text-[12px]">{table.name}</span>
                <span class="shrink-0 font-mono text-[11px] tabular-nums opacity-60">
                  {table.rowCount}
                </span>
              </button>
            </li>
          {/each}
        {/if}
      </ul>
    </ScrollArea>
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
