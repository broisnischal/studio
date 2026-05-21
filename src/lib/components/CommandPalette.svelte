<script>
  import Table2 from '@lucide/svelte/icons/table-2'
  import Terminal from '@lucide/svelte/icons/terminal'
  import Settings from '@lucide/svelte/icons/settings'
  import Unplug from '@lucide/svelte/icons/unplug'
  import Database from '@lucide/svelte/icons/database'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import CornerDownLeft from '@lucide/svelte/icons/corner-down-left'
  import * as Command from '$lib/components/ui/command/index.js'
  import { formatTableRowCount } from '$lib/table-list.js'

  let {
    open = $bindable(false),
    connected = false,
    schemas = [],
    tables = [],
    activeSchema = 'public',
    ontableselect = () => {},
    onschemachange = () => {},
    onopensql = () => {},
    onopentable = () => {},
    onopensettings = () => {},
    onopenconnection = () => {},
    ondisconnect = () => {},
    onrefresh = () => {},
  } = $props()

  function run(action) {
    open = false
    action()
  }
</script>

<Command.Dialog
  bind:open
  title="Command menu"
  description="Search tables, schemas, and commands"
  class="sm:max-w-lg"
>
  {#snippet children()}
    <Command.Input placeholder="Search tables, schemas, commands…" />
    <Command.List class="max-h-[min(360px,50vh)]">
      <Command.Empty>No results.</Command.Empty>

      {#if connected}
        <Command.Group heading="Views">
          <Command.Item
            value="open sql editor query console"
            onSelect={() => run(onopensql)}
          >
            <Terminal class="size-4 opacity-60" />
            <span>SQL editor</span>
            <Command.Shortcut>⌘⇧S</Command.Shortcut>
          </Command.Item>
          <Command.Item
            value="open table data browser"
            onSelect={() => run(onopentable)}
          >
            <Table2 class="size-4 opacity-60" />
            <span>Table data</span>
            <Command.Shortcut>⌘⇧D</Command.Shortcut>
          </Command.Item>
        </Command.Group>

        {#if schemas.length > 0}
          <Command.Group heading="Schemas">
            {#each schemas as schema (schema)}
              <Command.Item
                value="schema {schema}"
                onSelect={() => run(() => onschemachange(schema))}
              >
                <Database class="size-4 opacity-60" />
                <span class="font-mono">{schema}</span>
                {#if schema === activeSchema}
                  <span class="ml-auto text-[11px] text-muted-foreground">current</span>
                {/if}
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}

        {#if tables.length > 0}
          <Command.Group heading="Tables">
            {#each tables as table (table.name)}
              <Command.Item
                value="table {activeSchema} {table.name}"
                class="gap-2"
                onSelect={() => run(() => ontableselect(table.name))}
              >
                <Table2 class="size-4 opacity-60" />
                <span class="min-w-0 truncate font-mono">{table.name}</span>
                <span class="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
                  {formatTableRowCount(table.rowCount)}
                </span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}

        <Command.Group heading="Actions">
          <Command.Item value="refresh schema tables" onSelect={() => run(onrefresh)}>
            <RefreshCw class="size-4 opacity-60" />
            <span>Refresh tables</span>
          </Command.Item>
          <Command.Item value="open settings preferences" onSelect={() => run(onopensettings)}>
            <Settings class="size-4 opacity-60" />
            <span>Settings</span>
          </Command.Item>
          <Command.Item value="disconnect database" onSelect={() => run(ondisconnect)}>
            <Unplug class="size-4 opacity-60" />
            <span>Disconnect</span>
          </Command.Item>
        </Command.Group>
      {:else}
        <Command.Group heading="Connection">
          <Command.Item
            value="add connection connect postgres"
            onSelect={() => run(onopenconnection)}
          >
            <Database class="size-4 opacity-60" />
            <span>Add connection</span>
          </Command.Item>
        </Command.Group>
      {/if}
    </Command.List>
  {/snippet}
</Command.Dialog>
