<script>
  import Play from "@lucide/svelte/icons/play";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Braces from "@lucide/svelte/icons/braces";
  import Wand2 from "@lucide/svelte/icons/wand-2";
  import CheckCheck from "@lucide/svelte/icons/check-check";
  import X from "@lucide/svelte/icons/x";
  import Loader2 from "@lucide/svelte/icons/loader-2";
  import SqlEditor from "./SqlEditor.svelte";
  import DataTable from "./DataTable.svelte";
  import DataTableSkeleton from "./DataTableSkeleton.svelte";
  import ResizeHandle from "./ResizeHandle.svelte";
  import { Button } from "$lib/components/ui/button/index.js";
  import * as Alert from "$lib/components/ui/alert/index.js";
  import {
    clampSqlEditorHeight,
    loadLayout,
    saveLayout,
  } from "$lib/stores/layout.js";
  import { untrack } from "svelte";
  import { chatCompletionStream, parseAssistantMessage, buildSystemPrompt } from "$lib/ai.js";
  import { loadAiSettings } from "$lib/stores/ai-settings.js";

  /** @typedef {import('$lib/monaco-sql-complete.js').SqlSchemaHints} SqlSchemaHints */

  let {
    sql = $bindable("SELECT 1;"),
    columns = [],
    rows = [],
    queryMs = 0,
    message = "",
    loading = false,
    error = "",
    schemaHints = /** @type {SqlSchemaHints} */ ({}),
    schemaContext = /** @type {Parameters<typeof buildSystemPrompt>[0] | null} */ (null),
    onrun = () => {},
    onmodk = undefined,
    onmodenter = undefined,
    onmods = undefined,
  } = $props();

  let selected = $state(new Set());
  /** @type {HTMLElement | null} */
  let consoleEl = $state(null);
  const initialLayout = loadLayout();
  let editorHeight = $state(initialLayout.sqlEditorHeight);
  let resizeStartHeight = initialLayout.sqlEditorHeight;
  /** @type {(() => Promise<void>) | null} */
  let formatSql = $state(null);

  // AI fix state
  /** @type {'idle' | 'fixing' | 'done' | 'error'} */
  let fixStatus = $state('idle')
  let fixedSql = $state('')
  let fixExplanation = $state('')
  let fixErrMsg = $state('')
  /** @type {AbortController | null} */
  let fixAbort = $state(null)

  // Reset fix state when the error message or sql changes
  $effect(() => {
    // Track these two deps; read/write fixStatus outside tracking to avoid cycles
    error; sql
    untrack(() => {
      if (fixStatus !== 'idle') {
        fixAbort?.abort()
        fixStatus = 'idle'
        fixedSql = ''
        fixExplanation = ''
        fixErrMsg = ''
      }
    })
  })

  async function fixWithAi() {
    if (!error || !sql.trim()) return
    fixAbort?.abort()
    const ctrl = new AbortController()
    fixAbort = ctrl
    fixStatus = 'fixing'
    fixedSql = ''
    fixExplanation = ''
    fixErrMsg = ''

    try {
      const settings = loadAiSettings()
      const systemPrompt = schemaContext
        ? buildSystemPrompt(schemaContext)
        : 'You are an expert SQL assistant. Fix the SQL error provided. Return the corrected SQL in a ```sql code block.'

      const userMsg =
        `Fix this SQL error.\n\nError:\n${error}\n\nSQL:\n\`\`\`sql\n${sql.trim()}\n\`\`\`\n\n` +
        `Return the corrected SQL in a \`\`\`sql code block and give a brief one-sentence explanation of what was wrong.`

      let fullContent = ''

      for await (const chunk of chatCompletionStream(
        settings,
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMsg },
        ],
        null,
        ctrl.signal,
      )) {
        if (chunk.textDelta) {
          fullContent += chunk.textDelta
          // Live-extract SQL as it streams in
          const parts = parseAssistantMessage(fullContent)
          const sqlPart = parts.find((p) => p.type === 'sql')
          if (sqlPart) fixedSql = sqlPart.content
        }
      }

      const parts = parseAssistantMessage(fullContent)
      const sqlPart = parts.find((p) => p.type === 'sql')
      const textPart = parts.find((p) => p.type === 'text')

      if (!sqlPart) throw new Error('AI did not return a SQL fix')

      fixedSql = sqlPart.content
      fixExplanation = textPart?.content ?? ''
      fixStatus = 'done'
    } catch (/** @type {any} */ e) {
      if (e?.name === 'AbortError') return
      fixErrMsg = String(e)
      fixStatus = 'error'
    }
  }

  function applyFix() {
    sql = fixedSql
    fixStatus = 'idle'
  }

  function dismissFix() {
    fixAbort?.abort()
    fixStatus = 'idle'
  }

  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().includes("MAC");
  const mod = isMac ? "⌘" : "Ctrl";

  /** @param {number} height */
  function clampEditorHeight(height) {
    return clampSqlEditorHeight(height, consoleEl?.clientHeight ?? 0);
  }
</script>

<div bind:this={consoleEl} class="flex min-h-0 flex-1 flex-col">
  <div
    class="studio-chrome flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel px-3"
    data-studio-chrome
  >
    <Button
      type="button"
      variant="default"
      size="sm"
      class="h-7 shrink-0 gap-2 pl-2.5 pr-2 font-medium shadow-sm"
      disabled={loading || !sql.trim()}
      onclick={() => onrun()}
    >
      <Play class="size-3.5 shrink-0" data-icon="inline-start" />
      Run
    </Button>

    <div class="h-4 w-px shrink-0 bg-border" aria-hidden="true"></div>

    <div class="flex min-w-0 items-center gap-0.5">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        disabled={loading || !sql.trim()}
        title="Re-run query"
        onclick={() => onrun()}
      >
        <RefreshCw class="size-3.5 shrink-0" />
        <span class="text-ui-xs">Refresh</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        disabled={!sql.trim()}
        title="Format SQL"
        onclick={() => void formatSql?.()}
      >
        <Braces class="size-3.5 shrink-0" />
        <span class="text-ui-xs">Format</span>
      </Button>
    </div>

    <div class="ml-auto flex min-w-0 items-center gap-3">
      {#if queryMs > 0}
        <span class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground">
          {queryMs}ms
        </span>
      {/if}
      {#if message}
        <span class="min-w-0 truncate text-ui-xs text-muted-foreground">{message}</span>
      {/if}
    </div>
  </div>

  {#if error}
    <div class="mx-3 mt-2 shrink-0 flex flex-col gap-1.5">
      <Alert.Root variant="destructive" class="py-2.5">
        <Alert.Description class="flex items-start gap-2 text-ui-sm">
          <span class="flex-1 leading-relaxed">{error}</span>
          {#if fixStatus === 'idle' || fixStatus === 'error'}
            <button
              type="button"
              onclick={() => void fixWithAi()}
              class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-destructive-foreground/10 px-2.5 py-1 text-ui-xs font-medium text-destructive-foreground ring-1 ring-inset ring-destructive-foreground/20 transition-colors hover:bg-destructive-foreground/20"
            >
              <Wand2 class="size-3 shrink-0" />
              Fix with AI
            </button>
          {:else if fixStatus === 'fixing'}
            <button
              type="button"
              onclick={dismissFix}
              class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-destructive-foreground/10 px-2.5 py-1 text-ui-xs font-medium text-destructive-foreground/70 ring-1 ring-inset ring-destructive-foreground/20"
            >
              <Loader2 class="size-3 shrink-0 animate-spin" />
              Fixing…
            </button>
          {/if}
        </Alert.Description>
      </Alert.Root>

      {#if fixStatus === 'fixing' && fixedSql}
        <!-- Live SQL preview while streaming -->
        <div class="rounded-lg border border-border bg-muted/40 p-3">
          <p class="mb-1.5 font-mono text-ui-2xs text-muted-foreground">Generating fix…</p>
          <pre class="overflow-auto rounded bg-card px-3 py-2 font-mono text-ui-xs leading-relaxed text-foreground">{fixedSql}</pre>
        </div>
      {/if}

      {#if fixStatus === 'done'}
        <div class="rounded-lg border border-border bg-card shadow-sm">
          <div class="flex items-center gap-2 border-b border-border px-3 py-2">
            <Wand2 class="size-3.5 shrink-0 text-primary/70" />
            <span class="flex-1 text-ui-xs font-medium text-foreground">AI Fix</span>
            <button
              type="button"
              onclick={dismissFix}
              class="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Dismiss"
            >
              <X class="size-3" />
            </button>
          </div>
          {#if fixExplanation}
            <p class="px-3 pt-2.5 text-ui-xs leading-relaxed text-muted-foreground">{fixExplanation}</p>
          {/if}
          <pre class="mx-3 my-2.5 overflow-auto rounded bg-muted px-3 py-2 font-mono text-ui-xs leading-relaxed text-foreground">{fixedSql}</pre>
          <div class="flex items-center justify-end gap-2 border-t border-border px-3 py-2">
            <button
              type="button"
              onclick={dismissFix}
              class="rounded-md px-3 py-1.5 text-ui-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              Dismiss
            </button>
            <button
              type="button"
              onclick={applyFix}
              class="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-ui-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              <CheckCheck class="size-3 shrink-0" />
              Apply to editor
            </button>
          </div>
        </div>
      {/if}

      {#if fixStatus === 'error'}
        <p class="px-1 font-mono text-ui-xs text-destructive">{fixErrMsg}</p>
      {/if}
    </div>
  {/if}

  <div
    class="relative shrink-0 overflow-hidden border-b border-border bg-panel"
    style="height: {editorHeight}px"
  >
    <SqlEditor
      bind:value={sql}
      class="absolute inset-0"
      {schemaHints}
      {onmodk}
      onmodenter={onmodenter ?? (() => onrun())}
      onmodr={() => onrun()}
      {onmods}
      onactionsready={(actions) => {
        formatSql = actions.format;
      }}
    />
  </div>

  <ResizeHandle
    axis="y"
    edge="end"
    onresizestart={() => {
      resizeStartHeight = editorHeight;
    }}
    onresize={(dy) => {
      editorHeight = clampEditorHeight(resizeStartHeight + dy);
    }}
    onresizeend={() => {
      resizeStartHeight = editorHeight;
      saveLayout({ sqlEditorHeight: editorHeight });
    }}
  />

  <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
    {#if columns.length > 0}
      <DataTable {columns} {rows} {loading} bind:selected />
    {:else if loading}
      <DataTableSkeleton columnCount={6} rowCount={10} />
    {:else}
      <div class="flex h-full flex-col items-center justify-center gap-2 text-center">
        <Play class="size-6 text-muted-foreground/20" />
        <p class="font-mono text-ui-sm text-muted-foreground/50">
          Run a query to see results
        </p>
      </div>
    {/if}
  </div>
</div>
