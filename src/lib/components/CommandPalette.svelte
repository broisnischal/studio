<script>
  import Table2      from '@lucide/svelte/icons/table-2'
  import Terminal    from '@lucide/svelte/icons/terminal'
  import Settings    from '@lucide/svelte/icons/settings'
  import Unplug      from '@lucide/svelte/icons/unplug'
  import Database    from '@lucide/svelte/icons/database'
  import HardDrive   from '@lucide/svelte/icons/hard-drive'
  import Cloud       from '@lucide/svelte/icons/cloud'
  import RefreshCw   from '@lucide/svelte/icons/refresh-cw'
  import CornerDownLeft from '@lucide/svelte/icons/corner-down-left'
  import Bot         from '@lucide/svelte/icons/bot'
  import Keyboard    from '@lucide/svelte/icons/keyboard'
  import ArrowLeftRight from '@lucide/svelte/icons/arrow-left-right'
  import ArrowDownToLine from '@lucide/svelte/icons/arrow-down-to-line'
  import * as Command from '$lib/components/ui/command/index.js'
  import { formatTableRowCount } from '$lib/table-list.js'

  let {
    open = $bindable(false),
    connected = false,
    schemas = [],
    tables = [],
    activeSchema = 'public',
    /** @type {import('$lib/stores/connections.js').SavedConnection[]} */
    savedConnections = [],
    /** Currently connected connection id (to mark it) */
    activeConnectionId = '',
    ontableselect = () => {},
    onschemachange = () => {},
    onopensql = () => {},
    onopentable = () => {},
    onopensettings = () => {},
    onopenconnection = () => {},
    ondisconnect = () => {},
    onrefresh = () => {},
    onopenai = () => {},
    onopenshortcuts = () => {},
    oncheckupdate = () => {},
    /** @param {import('$lib/stores/connections.js').SavedConnection} conn */
    onswitchdatabase = (conn) => {},
  } = $props()

  /** @param {'postgres'|'sqlite'|'d1'} type */
  function driverIcon(type) {
    if (type === 'sqlite') return HardDrive
    if (type === 'd1')     return Cloud
    return Database
  }

  /** @param {import('$lib/stores/connections.js').SavedConnection} conn */
  function connSubtitle(conn) {
    if (conn.type === 'sqlite') return conn.filePath ?? ''
    if (conn.type === 'd1')     return `${conn.accountId?.slice(0, 8) ?? ''}… / ${conn.databaseId?.slice(0, 8) ?? ''}…`
    return `${conn.user ?? ''}@${conn.host ?? ''}:${conn.port ?? ''}/${conn.database ?? ''}`
  }

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
    <Command.List class="max-h-[min(400px,55vh)]">
      <Command.Empty>No results.</Command.Empty>

      {#if connected}
        <Command.Group heading="Views">
          <Command.Item value="open sql editor query console" onSelect={() => run(onopensql)}>
            <Terminal class="size-4 opacity-60" />
            <span>SQL editor</span>
            <Command.Shortcut>⌘⇧S</Command.Shortcut>
          </Command.Item>
          <Command.Item value="open table data browser" onSelect={() => run(onopentable)}>
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
                  <span class="ml-auto text-ui-xs text-muted-foreground">current</span>
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
                <span
                  class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground"
                  title={table.rowCount != null ? Number(table.rowCount).toLocaleString('en-US') : undefined}
                >
                  {formatTableRowCount(table.rowCount)}
                </span>
              </Command.Item>
            {/each}
          </Command.Group>
        {/if}

        <Command.Group heading="AI">
          <Command.Item value="ask ai assistant chat query" onSelect={() => run(onopenai)}>
            <Bot class="size-4 opacity-60" />
            <span>Ask AI</span>
            <Command.Shortcut>⌘⇧A</Command.Shortcut>
          </Command.Item>
        </Command.Group>

        <Command.Group heading="Actions">
          <Command.Item value="refresh schema tables" onSelect={() => run(onrefresh)}>
            <RefreshCw class="size-4 opacity-60" />
            <span>Refresh tables</span>
          </Command.Item>
          <Command.Item value="open settings preferences" onSelect={() => run(onopensettings)}>
            <Settings class="size-4 opacity-60" />
            <span>Settings</span>
          </Command.Item>
          <Command.Item value="keyboard shortcuts keybindings hotkeys help" onSelect={() => run(onopenshortcuts)}>
            <Keyboard class="size-4 opacity-60" />
            <span>Keyboard shortcuts</span>
            <Command.Shortcut>?</Command.Shortcut>
          </Command.Item>
          <Command.Item value="check for updates upgrade version" onSelect={() => run(oncheckupdate)}>
            <ArrowDownToLine class="size-4 opacity-60" />
            <span>Check for updates</span>
          </Command.Item>
          <Command.Item value="disconnect database" onSelect={() => run(ondisconnect)}>
            <Unplug class="size-4 opacity-60" />
            <span>Disconnect</span>
          </Command.Item>
        </Command.Group>
      {:else if savedConnections.length === 0}
        <Command.Group heading="Connection">
          <Command.Item value="add connection connect postgres" onSelect={() => run(onopenconnection)}>
            <Database class="size-4 opacity-60" />
            <span>Add connection</span>
          </Command.Item>
        </Command.Group>
      {/if}

      <!-- ── Switch database — always at the bottom ─────────────────── -->
      {#if savedConnections.length > 0}
        <Command.Group heading="Switch database">
          {#each savedConnections as conn (conn.id)}
            {@const Icon = driverIcon(conn.type ?? 'postgres')}
            {@const isActive = conn.id === activeConnectionId}
            <Command.Item
              value="switch database connection {conn.name} {connSubtitle(conn)} {conn.type}"
              onSelect={() => run(() => onswitchdatabase(conn))}
              disabled={isActive}
            >
              <Icon class="size-4 opacity-60" />
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate">{conn.name}</span>
                <span class="truncate font-mono text-[11px] text-muted-foreground">{connSubtitle(conn)}</span>
              </div>
              {#if isActive}
                <span class="shrink-0 text-xs text-muted-foreground">connected</span>
              {/if}
            </Command.Item>
          {/each}

          <Command.Item
            value="new connection add connect database"
            onSelect={() => run(onopenconnection)}
          >
            <Database class="size-4 opacity-60" />
            <span>New connection…</span>
          </Command.Item>
        </Command.Group>
      {/if}
    </Command.List>
  {/snippet}
</Command.Dialog>
