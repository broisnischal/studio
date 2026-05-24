<script>
  import { onMount } from 'svelte'
  import Server from '@lucide/svelte/icons/server'
  import Copy from '@lucide/svelte/icons/copy'
  import Check from '@lucide/svelte/icons/check'
  import Power from '@lucide/svelte/icons/power'
  import PowerOff from '@lucide/svelte/icons/power-off'
  import Zap from '@lucide/svelte/icons/zap'
  import Bot from '@lucide/svelte/icons/bot'
  import Code2 from '@lucide/svelte/icons/code-2'
  import Wand2 from '@lucide/svelte/icons/wand-2'
  import Database from '@lucide/svelte/icons/database'
  import Activity from '@lucide/svelte/icons/activity'
  import GitBranch from '@lucide/svelte/icons/git-branch'
  import Search from '@lucide/svelte/icons/search'
  import FileSearch from '@lucide/svelte/icons/file-search'
  import BarChart2 from '@lucide/svelte/icons/bar-chart-2'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { cn } from '$lib/utils.js'
  import { mcpStart, mcpStop, mcpStatus } from '$lib/api.js'

  let {
    open = $bindable(false),
    connected = false,
  } = $props()

  /** @type {{ running: boolean, port: number, url: string, token: string } | null} */
  let status = $state(null)
  let toggling = $state(false)
  /** @type {string | null} */
  let copied = $state(null)

  $effect(() => {
    if (open) void refresh()
  })

  async function refresh() {
    try { status = await mcpStatus() } catch { status = null }
  }

  async function toggle() {
    toggling = true
    try {
      if (status?.running) {
        await mcpStop()
        status = await mcpStatus()
      } else {
        status = await mcpStart()
      }
    } catch (e) {
      console.error(e)
    } finally {
      toggling = false
    }
  }

  const claudeConfig = $derived(
    status?.running
      ? JSON.stringify({ mcpServers: { 'db-studio': { url: status.url, headers: { Authorization: `Bearer ${status.token}` } } } }, null, 2)
      : '',
  )

  const cursorConfig = $derived(
    status?.running
      ? JSON.stringify({ mcpServers: { 'db-studio': { url: status.url, headers: { Authorization: `Bearer ${status.token}` } } } }, null, 2)
      : '',
  )

  const vscodeConfig = $derived(
    status?.running
      ? JSON.stringify({ servers: { 'db-studio': { type: 'http', url: status.url, headers: { Authorization: `Bearer ${status.token}` } } } }, null, 2)
      : '',
  )

  /** @param {string} text @param {string} key */
  async function copy(text, key) {
    if (!text) return
    await navigator.clipboard.writeText(text)
    copied = key
    setTimeout(() => { copied = null }, 2000)
  }

  const integrations = /** @type {const} */ ([
    {
      key: 'claude',
      label: 'Claude Desktop',
      path: '~/Library/Application Support/Claude/claude_desktop_config.json',
      pathShort: 'claude_desktop_config.json',
      hint: 'Merge into mcpServers key',
    },
    {
      key: 'cursor',
      label: 'Cursor',
      path: '~/.cursor/mcp.json',
      pathShort: '~/.cursor/mcp.json',
      hint: 'Project or global config',
    },
    {
      key: 'vscode',
      label: 'VS Code',
      path: '.vscode/mcp.json',
      pathShort: '.vscode/mcp.json',
      hint: 'Workspace MCP config',
    },
  ])

  const tools = [
    { name: 'execute_sql', desc: 'Run any SQL and return structured results', category: 'query' },
    { name: 'list_tables', desc: 'List all tables with types and row estimates', category: 'schema' },
    { name: 'describe_table', desc: 'Full schema: columns, PKs, FKs, indexes', category: 'schema' },
    { name: 'check_migrations', desc: 'Detect Prisma, Drizzle, Rails, Flyway and others', category: 'migration' },
    { name: 'explain_query', desc: 'Query execution plan for performance analysis', category: 'perf' },
    { name: 'get_database_stats', desc: 'Table sizes, cache hit rates, bloat, connections', category: 'perf' },
  ]

  /** @param {string} category */
  function categoryColor(category) {
    switch (category) {
      case 'query': return 'bg-blue-500/10 text-blue-500'
      case 'schema': return 'bg-violet-500/10 text-violet-500'
      case 'migration': return 'bg-amber-500/10 text-amber-500'
      case 'perf': return 'bg-emerald-500/10 text-emerald-500'
      default: return 'bg-muted text-muted-foreground'
    }
  }

  /** @param {typeof integrations[number]} intg */
  function configFor(intg) {
    if (intg.key === 'vscode') return vscodeConfig
    if (intg.key === 'cursor') return cursorConfig
    return claudeConfig
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[88vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">

    <!-- Header -->
    <Dialog.Header class="shrink-0 border-b border-border px-5 py-4">
      <div class="flex items-start justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Server class="size-4 text-muted-foreground" />
          </div>
          <div>
            <Dialog.Title class="text-sm font-semibold leading-tight">MCP Server</Dialog.Title>
            <Dialog.Description class="mt-0.5 text-[11px] text-muted-foreground">
              Expose your database to Claude, Cursor, VS Code, and any MCP-compatible agent
            </Dialog.Description>
          </div>
        </div>

        {#if status?.running}
          <span class="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-[10px] font-semibold text-green-600 dark:text-green-400">
            <span class="size-1.5 animate-pulse rounded-full bg-green-500"></span>
            Running · port {status.port}
          </span>
        {:else}
          <span class="mt-0.5 flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            <span class="size-1.5 rounded-full bg-muted-foreground/30"></span>
            Stopped
          </span>
        {/if}
      </div>
    </Dialog.Header>

    <div class="app-scroll min-h-0 flex-1 overflow-y-auto">

      <!-- Control row -->
      <div class="flex items-center justify-between gap-4 border-b border-border/60 bg-muted/20 px-5 py-3">
        <div class="min-w-0">
          {#if status?.running}
            <div class="flex items-center gap-2">
              <span class="font-mono text-[11px] text-muted-foreground">Endpoint</span>
              <code class="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground">{status.url}</code>
              <button
                type="button"
                class="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
                onclick={() => void copy(status?.url ?? '', 'url')}
              >
                {#if copied === 'url'}<Check class="size-3 text-green-500" />{:else}<Copy class="size-3" />{/if}
              </button>
            </div>
          {:else}
            <p class="text-[11px] text-muted-foreground">
              {connected ? 'Start the server to let AI agents query this database' : 'Connect to a database first, then start the MCP server'}
            </p>
          {/if}
        </div>

        <button
          type="button"
          class={cn(
            'flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
            status?.running
              ? 'border border-border bg-background hover:bg-muted'
              : 'bg-foreground text-background hover:bg-foreground/90',
          )}
          disabled={toggling || !connected}
          onclick={() => void toggle()}
        >
          {#if toggling}
            <span class="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
            {status?.running ? 'Stopping…' : 'Starting…'}
          {:else if status?.running}
            <PowerOff class="size-3.5" />
            Stop
          {:else}
            <Power class="size-3.5" />
            Start server
          {/if}
        </button>
      </div>

      {#if status?.running}
        <!-- Integration cards -->
        <div class="border-b border-border/60 px-5 py-4">
          <p class="mb-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Add to your AI tools</p>
          <div class="grid grid-cols-3 gap-2.5">
            {#each integrations as intg (intg.key)}
              {@const config = configFor(intg)}
              <div class="group flex flex-col gap-2.5 rounded-xl border border-border bg-card p-3 transition-colors hover:border-border/80 hover:bg-muted/30">
                <div class="flex items-center justify-between gap-1">
                  <div class="flex items-center gap-2">
                    {#if intg.key === 'claude'}
                      <Bot class="size-3.5 text-orange-400" />
                    {:else if intg.key === 'cursor'}
                      <Wand2 class="size-3.5 text-blue-400" />
                    {:else}
                      <Code2 class="size-3.5 text-sky-400" />
                    {/if}
                    <span class="text-[11px] font-semibold text-foreground">{intg.label}</span>
                  </div>
                  <button
                    type="button"
                    class="flex size-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground opacity-0 transition-[opacity,colors] group-hover:opacity-100 hover:border-foreground/20 hover:text-foreground"
                    title="Copy config"
                    onclick={() => void copy(config, intg.key)}
                  >
                    {#if copied === intg.key}
                      <Check class="size-3 text-green-500" />
                    {:else}
                      <Copy class="size-3" />
                    {/if}
                  </button>
                </div>

                <div class="min-h-0 overflow-hidden rounded-lg border border-border/60 bg-muted/40">
                  <pre class="overflow-x-auto px-2.5 py-2 font-mono text-[9.5px] leading-relaxed text-foreground/80">{config}</pre>
                </div>

                <div class="flex flex-col gap-0.5">
                  <span class="font-mono text-[9px] text-muted-foreground/70 truncate" title={intg.path}>{intg.pathShort}</span>
                  <span class="text-[9px] text-muted-foreground/50">{intg.hint}</span>
                </div>
              </div>
            {/each}
          </div>
        </div>

        <!-- Tools grid -->
        <div class="px-5 py-4">
          <p class="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Zap class="size-3" />
            Available tools ({tools.length})
          </p>
          <div class="grid grid-cols-2 gap-2">
            {#each tools as tool (tool.name)}
              <div class="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
                <span class={cn('mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold', categoryColor(tool.category))}>
                  {tool.category}
                </span>
                <div class="min-w-0">
                  <p class="font-mono text-[11px] font-medium text-foreground">{tool.name}</p>
                  <p class="mt-0.5 text-[10px] leading-snug text-muted-foreground">{tool.desc}</p>
                </div>
              </div>
            {/each}
          </div>
        </div>

      {:else}
        <!-- Stopped state -->
        <div class="flex flex-col items-center justify-center gap-3 px-5 py-14 text-center">
          <div class="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/30">
            <Server class="size-6 text-muted-foreground/40" />
          </div>
          <div>
            <p class="text-sm font-medium text-foreground">
              {connected ? 'Start to connect AI agents' : 'No database connected'}
            </p>
            <p class="mt-1 text-[11px] text-muted-foreground">
              {connected
                ? 'Once running, paste the config snippet into Claude Desktop, Cursor, or VS Code'
                : 'Connect to a database first, then start the MCP server'}
            </p>
          </div>

          <!-- Preview tools when stopped -->
          <div class="mt-2 grid w-full max-w-xs grid-cols-2 gap-1.5">
            {#each tools as tool (tool.name)}
              <div class="rounded-lg border border-border/40 bg-muted/10 px-2.5 py-1.5">
                <p class="font-mono text-[10px] font-medium text-muted-foreground">{tool.name}</p>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
