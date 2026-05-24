<script>
  import { onMount } from 'svelte'
  import Server from '@lucide/svelte/icons/server'
  import Copy from '@lucide/svelte/icons/copy'
  import Check from '@lucide/svelte/icons/check'
  import Power from '@lucide/svelte/icons/power'
  import PowerOff from '@lucide/svelte/icons/power-off'
  import Zap from '@lucide/svelte/icons/zap'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import { Button } from '$lib/components/ui/button/index.js'
  import { cn } from '$lib/utils.js'
  import { mcpStart, mcpStop, mcpStatus } from '$lib/api.js'

  let {
    open = $bindable(false),
    connected = false,
  } = $props()

  /** @type {{ running: boolean, port: number, url: string, token: string } | null} */
  let status = $state(null)
  let toggling = $state(false)
  /** @type {'claude' | 'cursor' | 'generic'} */
  let configTab = $state('claude')
  /** @type {string | null} */
  let copied = $state(null)

  $effect(() => {
    if (open) void refresh()
  })

  async function refresh() {
    try {
      status = await mcpStatus()
    } catch {
      status = null
    }
  }

  async function toggle() {
    toggling = true
    try {
      if (status?.running) {
        await mcpStop()
      } else {
        status = await mcpStart()
        return
      }
      status = await mcpStatus()
    } catch (e) {
      console.error(e)
    } finally {
      toggling = false
    }
  }

  const claudeConfig = $derived(
    status?.running
      ? JSON.stringify(
          {
            mcpServers: {
              'db-studio': {
                url: status.url,
                headers: { Authorization: `Bearer ${status.token}` },
              },
            },
          },
          null,
          2,
        )
      : '',
  )

  const cursorConfig = $derived(
    status?.running
      ? JSON.stringify(
          {
            mcpServers: {
              'db-studio': {
                url: status.url,
                headers: { Authorization: `Bearer ${status.token}` },
              },
            },
          },
          null,
          2,
        )
      : '',
  )

  const claudePath = '~/Library/Application Support/Claude/claude_desktop_config.json'
  const cursorPath = '.cursor/mcp.json (or project root)'

  const curlCmd = $derived(
    status?.running
      ? `curl -s -X POST ${status.url} \\\n  -H "Content-Type: application/json" \\\n  -H "Authorization: Bearer ${status.token}" \\\n  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'`
      : '',
  )

  /** @param {string} text @param {string} key */
  async function copy(text, key) {
    await navigator.clipboard.writeText(text)
    copied = key
    setTimeout(() => {
      copied = null
    }, 2000)
  }

  const tools = [
    { name: 'execute_sql', desc: 'Run any SQL query and return results' },
    { name: 'list_tables', desc: 'List all tables with row counts' },
    { name: 'describe_table', desc: 'Full column definitions, PKs, FKs, indexes' },
    {
      name: 'check_migrations',
      desc: 'Detect Prisma, Drizzle, Rails, Flyway, Knex, Alembic, Goose migration state',
    },
  ]
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="flex max-h-[85vh] max-w-xl flex-col gap-0 overflow-hidden p-0">
    <Dialog.Header class="shrink-0 border-b border-border px-4 py-3">
      <div class="flex items-center gap-2">
        <Server class="size-4 text-muted-foreground" />
        <Dialog.Title class="text-sm font-semibold">MCP Server</Dialog.Title>
        {#if status?.running}
          <span
            class="ml-auto flex items-center gap-1.5 rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-medium text-green-600 dark:text-green-400"
          >
            <span class="size-1.5 animate-pulse rounded-full bg-green-500"></span>
            Running · port {status.port}
          </span>
        {:else}
          <span
            class="ml-auto flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
          >
            <span class="size-1.5 rounded-full bg-muted-foreground/40"></span>
            Stopped
          </span>
        {/if}
      </div>
      <Dialog.Description class="text-ui-xs text-muted-foreground">
        Expose your database to Claude Desktop, Cursor, and other MCP-compatible agents.
      </Dialog.Description>
    </Dialog.Header>

    <div class="app-scroll min-h-0 flex-1 overflow-y-auto">
      <!-- Toggle -->
      <div class="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <p class="text-sm font-medium">
            {status?.running ? 'Server is running' : 'Server is stopped'}
          </p>
          <p class="text-ui-xs text-muted-foreground">
            {#if status?.running}
              Listening on <span class="font-mono">{status.url}</span>
            {:else}
              Start to allow AI agents to query this database
            {/if}
          </p>
        </div>
        <Button
          size="sm"
          variant={status?.running ? 'outline' : 'default'}
          disabled={toggling || !connected}
          onclick={() => void toggle()}
          class="shrink-0 gap-1.5"
        >
          {#if toggling}
            <span
              class="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent"
            ></span>
          {:else if status?.running}
            <PowerOff class="size-3.5" />
            Stop
          {:else}
            <Power class="size-3.5" />
            Start
          {/if}
        </Button>
      </div>

      {#if status?.running}
        <!-- Config snippets -->
        <div class="border-b border-border px-4 py-3">
          <p class="mb-2 text-ui-xs font-semibold text-foreground">Add to your AI tool config</p>

          <!-- Tab bar -->
          <div
            class="mb-3 flex gap-0.5 rounded-md border border-border/80 bg-muted/30 p-0.5 text-ui-xs"
          >
            {#each [['claude', 'Claude Desktop'], ['cursor', 'Cursor'], ['generic', 'Other / API']] as [key, label] (key)}
              <button
                type="button"
                class={cn(
                  'flex-1 rounded px-2 py-1 transition-colors',
                  configTab === key
                    ? 'bg-background font-medium text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onclick={() => (configTab = /** @type {any} */ (key))}
              >
                {label}
              </button>
            {/each}
          </div>

          {#if configTab === 'claude'}
            <p class="mb-1.5 text-[10px] text-muted-foreground">
              Add to <span class="font-mono">{claudePath}</span>
            </p>
            <div class="relative">
              <pre
                class="overflow-x-auto rounded-lg border border-border bg-muted/50 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-foreground">{claudeConfig}</pre>
              <button
                type="button"
                class="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                onclick={() => void copy(claudeConfig, 'claude')}
              >
                {#if copied === 'claude'}
                  <Check class="size-3.5 text-green-500" />
                {:else}
                  <Copy class="size-3.5" />
                {/if}
              </button>
            </div>
          {:else if configTab === 'cursor'}
            <p class="mb-1.5 text-[10px] text-muted-foreground">
              Add to <span class="font-mono">{cursorPath}</span>
            </p>
            <div class="relative">
              <pre
                class="overflow-x-auto rounded-lg border border-border bg-muted/50 px-3 py-2.5 font-mono text-[11px] leading-relaxed text-foreground">{cursorConfig}</pre>
              <button
                type="button"
                class="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                onclick={() => void copy(cursorConfig, 'cursor')}
              >
                {#if copied === 'cursor'}
                  <Check class="size-3.5 text-green-500" />
                {:else}
                  <Copy class="size-3.5" />
                {/if}
              </button>
            </div>
          {:else}
            <div class="space-y-2">
              <div>
                <p class="mb-1 text-[10px] text-muted-foreground">Endpoint</p>
                <div class="flex items-center gap-2">
                  <code
                    class="flex-1 rounded border border-border bg-muted/50 px-2 py-1 font-mono text-[11px]"
                    >{status.url}</code
                  >
                  <button
                    type="button"
                    class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                    onclick={() => void copy(status?.url ?? '', 'url')}
                  >
                    {#if copied === 'url'}
                      <Check class="size-3.5 text-green-500" />
                    {:else}
                      <Copy class="size-3.5" />
                    {/if}
                  </button>
                </div>
              </div>
              <div>
                <p class="mb-1 text-[10px] text-muted-foreground">
                  Auth token (include in Authorization: Bearer header)
                </p>
                <div class="flex items-center gap-2">
                  <code
                    class="flex-1 rounded border border-border bg-muted/50 px-2 py-1 font-mono text-[11px]"
                    >{status.token}</code
                  >
                  <button
                    type="button"
                    class="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                    onclick={() => void copy(status?.token ?? '', 'token')}
                  >
                    {#if copied === 'token'}
                      <Check class="size-3.5 text-green-500" />
                    {:else}
                      <Copy class="size-3.5" />
                    {/if}
                  </button>
                </div>
              </div>
              <div>
                <p class="mb-1 text-[10px] text-muted-foreground">Test with curl</p>
                <div class="relative">
                  <pre
                    class="overflow-x-auto rounded-lg border border-border bg-muted/50 px-3 py-2.5 font-mono text-[11px] leading-relaxed">{curlCmd}</pre>
                  <button
                    type="button"
                    class="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-accent"
                    onclick={() => void copy(curlCmd, 'curl')}
                  >
                    {#if copied === 'curl'}
                      <Check class="size-3.5 text-green-500" />
                    {:else}
                      <Copy class="size-3.5" />
                    {/if}
                  </button>
                </div>
              </div>
            </div>
          {/if}
        </div>

        <!-- Tools list -->
        <div class="px-4 py-3">
          <p class="mb-2 flex items-center gap-1.5 text-ui-xs font-semibold text-foreground">
            <Zap class="size-3.5" />
            Available tools
          </p>
          <div class="flex flex-col gap-1.5">
            {#each tools as tool (tool.name)}
              <div
                class="flex items-start gap-2 rounded-lg border border-border/50 bg-muted/20 px-3 py-2"
              >
                <code class="shrink-0 font-mono text-[11px] font-medium text-foreground"
                  >{tool.name}</code
                >
                <span class="text-[11px] text-muted-foreground">{tool.desc}</span>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
          <Server class="size-8 text-muted-foreground/25" />
          <p class="text-sm text-muted-foreground">
            {#if !connected}
              No database connected. Connect first, then start the MCP server.
            {:else}
              Click Start to launch the local MCP server.
            {/if}
          </p>
        </div>
      {/if}
    </div>
  </Dialog.Content>
</Dialog.Root>
