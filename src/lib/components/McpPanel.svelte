<script>
  import Server from '@lucide/svelte/icons/server'
  import Copy from '@lucide/svelte/icons/copy'
  import Check from '@lucide/svelte/icons/check'
  import Power from '@lucide/svelte/icons/power'
  import PowerOff from '@lucide/svelte/icons/power-off'
  import Zap from '@lucide/svelte/icons/zap'
  import Bot from '@lucide/svelte/icons/bot'
  import Code2 from '@lucide/svelte/icons/code-2'
  import Wand2 from '@lucide/svelte/icons/wand-2'
  import ExternalLink from '@lucide/svelte/icons/external-link'
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
      } else {
        await mcpStart()
      }
      status = await mcpStatus()
    } catch (e) {
      console.error(e)
    } finally {
      toggling = false
    }
  }

  // Configs are always derivable — port + token are stable even when server is stopped.
  const claudeConfig = $derived(
    status
      ? JSON.stringify(
          { mcpServers: { 'db-studio': { url: status.url, headers: { Authorization: `Bearer ${status.token}` } } } },
          null, 2,
        )
      : '',
  )

  const cursorConfig = $derived(
    status
      ? JSON.stringify(
          { mcpServers: { 'db-studio': { url: status.url, headers: { Authorization: `Bearer ${status.token}` } } } },
          null, 2,
        )
      : '',
  )

  const vscodeConfig = $derived(
    status
      ? JSON.stringify(
          { servers: { 'db-studio': { type: 'http', url: status.url, headers: { Authorization: `Bearer ${status.token}` } } } },
          null, 2,
        )
      : '',
  )

  // Deep-link install URLs — generated from stable port + token
  const cursorInstallUrl = $derived.by(() => {
    if (!status) return ''
    const cfg = JSON.stringify({ url: status.url, headers: { Authorization: `Bearer ${status.token}` } })
    return `cursor://anysphere.cursor-deeplink/mcp/install?name=db-studio&config=${btoa(cfg)}`
  })

  const vscodeInstallUrl = $derived.by(() => {
    if (!status) return ''
    const cfg = JSON.stringify({ name: 'db-studio', type: 'http', url: status.url, headers: { Authorization: `Bearer ${status.token}` } })
    return `vscode:mcp/install?${encodeURIComponent(cfg)}`
  })

  const vscodeInsidersInstallUrl = $derived.by(() => {
    if (!status) return ''
    const cfg = JSON.stringify({ name: 'db-studio', type: 'http', url: status.url, headers: { Authorization: `Bearer ${status.token}` } })
    return `vscode-insiders:mcp/install?${encodeURIComponent(cfg)}`
  })

  /** Open a protocol URL via Tauri opener (handles cursor://, vscode:, etc.) */
  async function installVia(url) {
    try {
      const { openUrl } = await import('@tauri-apps/plugin-opener')
      await openUrl(url)
    } catch (e) {
      console.error('Failed to open install URL:', e)
    }
  }

  /** @param {string} text @param {string} key */
  async function copy(text, key) {
    if (!text) return
    await navigator.clipboard.writeText(text)
    copied = key
    setTimeout(() => { copied = null }, 2000)
  }

  const tools = [
    { name: 'execute_sql',        desc: 'Run any SQL and return structured results',         category: 'query' },
    { name: 'list_tables',        desc: 'All tables with types and row estimates',           category: 'schema' },
    { name: 'describe_table',     desc: 'Columns, PKs, foreign keys, and indexes',          category: 'schema' },
    { name: 'check_migrations',   desc: 'Prisma, Drizzle, Rails, Flyway, Knex state',       category: 'migration' },
    { name: 'explain_query',      desc: 'Query execution plan without running the query',    category: 'perf' },
    { name: 'get_database_stats', desc: 'Table sizes, cache hit rates, bloat, connections',  category: 'perf' },
  ]

  /** @param {string} cat */
  function catColor(cat) {
    return cat === 'query'     ? 'bg-blue-500/10 text-blue-500'
         : cat === 'schema'    ? 'bg-violet-500/10 text-violet-500'
         : cat === 'migration' ? 'bg-amber-500/10 text-amber-500'
                               : 'bg-emerald-500/10 text-emerald-500'
  }
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[90vh] w-full max-w-2xl flex-col gap-0 overflow-hidden p-0">

    <!-- Header -->
    <Dialog.Header class="shrink-0 border-b border-border px-5 py-4">
      <div class="flex items-center gap-3">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Server class="size-4 text-muted-foreground" />
        </div>
        <div class="min-w-0 flex-1">
          <Dialog.Title class="text-sm font-semibold">MCP Server</Dialog.Title>
          <Dialog.Description class="mt-0.5 text-[11px] text-muted-foreground">
            Connect Claude Desktop, Cursor, and VS Code to this database. Port and token are stable — configure once.
          </Dialog.Description>
        </div>
        {#if status?.running}
          <span class="flex shrink-0 items-center gap-1.5 rounded-full bg-green-500/10 px-2.5 py-1 text-[10px] font-semibold text-green-600 dark:text-green-400">
            <span class="size-1.5 animate-pulse rounded-full bg-green-500"></span>
            Running · :{status.port}
          </span>
        {:else}
          <span class="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[10px] font-medium text-muted-foreground">
            <span class="size-1.5 rounded-full bg-muted-foreground/30"></span>
            Stopped
          </span>
        {/if}
      </div>
    </Dialog.Header>

    <div class="app-scroll min-h-0 flex-1 overflow-y-auto">

      <!-- Control strip -->
      <div class="flex items-center justify-between gap-4 border-b border-border/50 px-5 py-3">
        {#if status}
          <div class="flex min-w-0 items-center gap-2">
            <code class="rounded bg-muted px-2 py-0.5 font-mono text-[11px] text-foreground">{status.url}</code>
            <button type="button"
              class="inline-flex size-5 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              onclick={() => void copy(status?.url ?? '', 'url')}>
              {#if copied === 'url'}<Check class="size-3 text-green-500" />{:else}<Copy class="size-3" />{/if}
            </button>
          </div>
        {:else}
          <span class="text-[11px] text-muted-foreground">Loading…</span>
        {/if}

        <button
          type="button"
          disabled={toggling || !connected}
          onclick={() => void toggle()}
          class={cn(
            'flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-40',
            status?.running ? 'border border-border bg-background hover:bg-muted' : 'bg-foreground text-background hover:bg-foreground/90',
          )}
        >
          {#if toggling}
            <span class="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"></span>
            {status?.running ? 'Stopping…' : 'Starting…'}
          {:else if status?.running}
            <PowerOff class="size-3.5" />Stop
          {:else}
            <Power class="size-3.5" />Start server
          {/if}
        </button>
      </div>

      {#if status}
        <!-- One-click install section — always shown since port+token are stable -->
        <div class="border-b border-border/50 px-5 py-4">
          <div class="mb-3 flex items-center justify-between">
            <p class="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">One-click install</p>
            {#if !status.running}
              <span class="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                Start server to activate connections
              </span>
            {/if}
          </div>

          <div class="grid grid-cols-3 gap-3">

            <!-- Claude Desktop -->
            <div class="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5">
              <div class="flex items-center gap-2">
                <div class="flex size-7 items-center justify-center rounded-lg bg-orange-500/10">
                  <Bot class="size-3.5 text-orange-500" />
                </div>
                <span class="text-xs font-semibold text-foreground">Claude Desktop</span>
              </div>

              <p class="text-[10px] leading-relaxed text-muted-foreground">
                No install link available — copy the JSON and add it to your config file.
              </p>

              <div class="mt-auto space-y-1.5">
                <button
                  type="button"
                  class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
                  onclick={() => void copy(claudeConfig, 'claude')}
                >
                  {#if copied === 'claude'}
                    <Check class="size-3 text-green-500" />Copied!
                  {:else}
                    <Copy class="size-3" />Copy config
                  {/if}
                </button>
                <p class="text-center font-mono text-[9px] text-muted-foreground/50 truncate px-1">
                  ~/Library/.../Claude/claude_desktop_config.json
                </p>
              </div>
            </div>

            <!-- Cursor -->
            <div class="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5">
              <div class="flex items-center gap-2">
                <div class="flex size-7 items-center justify-center rounded-lg bg-blue-500/10">
                  <Wand2 class="size-3.5 text-blue-500" />
                </div>
                <span class="text-xs font-semibold text-foreground">Cursor</span>
              </div>

              <p class="text-[10px] leading-relaxed text-muted-foreground">
                Opens Cursor and installs db-studio MCP server automatically.
              </p>

              <div class="mt-auto space-y-1.5">
                <button
                  type="button"
                  disabled={!cursorInstallUrl}
                  onclick={() => void installVia(cursorInstallUrl)}
                  class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-500 px-2.5 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <ExternalLink class="size-3" />Add to Cursor
                </button>
                <button
                  type="button"
                  class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  onclick={() => void copy(cursorConfig, 'cursor')}
                >
                  {#if copied === 'cursor'}<Check class="size-3 text-green-500" />Copied{:else}<Copy class="size-3" />Copy JSON{/if}
                </button>
              </div>
            </div>

            <!-- VS Code -->
            <div class="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5">
              <div class="flex items-center gap-2">
                <div class="flex size-7 items-center justify-center rounded-lg bg-sky-500/10">
                  <Code2 class="size-3.5 text-sky-500" />
                </div>
                <span class="text-xs font-semibold text-foreground">VS Code</span>
              </div>

              <p class="text-[10px] leading-relaxed text-muted-foreground">
                Opens VS Code and installs via the built-in MCP install link.
              </p>

              <div class="mt-auto space-y-1.5">
                <button
                  type="button"
                  disabled={!vscodeInstallUrl}
                  onclick={() => void installVia(vscodeInstallUrl)}
                  class="flex w-full items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-2.5 py-1.5 text-[11px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <ExternalLink class="size-3" />Add to VS Code
                </button>
                <button
                  type="button"
                  onclick={() => void installVia(vscodeInsidersInstallUrl)}
                  class="flex w-full items-center justify-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1 text-[10px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <ExternalLink class="size-3" />Insiders
                </button>
              </div>
            </div>

          </div>
        </div>

        <!-- Tools -->
        <div class="px-5 py-4">
          <p class="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Zap class="size-3" />{tools.length} available tools
          </p>
          <div class="grid grid-cols-2 gap-2">
            {#each tools as tool (tool.name)}
              <div class="flex items-start gap-2.5 rounded-lg border border-border/50 bg-muted/15 px-3 py-2.5">
                <span class={cn('mt-0.5 shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-bold', catColor(tool.category))}>
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
        <div class="flex flex-col items-center justify-center gap-3 px-5 py-16 text-center">
          <div class="flex size-14 items-center justify-center rounded-2xl border border-border bg-muted/30">
            <Server class="size-6 text-muted-foreground/40" />
          </div>
          <p class="text-sm text-muted-foreground">
            {connected ? 'Loading…' : 'Connect to a database first, then start the MCP server.'}
          </p>
        </div>
      {/if}

    </div>
  </Dialog.Content>
</Dialog.Root>
