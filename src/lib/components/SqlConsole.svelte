<script>
  import Play from "@lucide/svelte/icons/play";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Braces from "@lucide/svelte/icons/braces";
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

  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().includes("MAC");
  const mod = isMac ? "⌘" : "Ctrl";

  const kbdOnPrimary =
    "inline-flex h-5 min-w-5 items-center justify-center rounded border border-primary-foreground/25 bg-primary-foreground/15 px-1.5 font-mono text-[10px] leading-none text-primary-foreground/90 shadow-[0_1px_0_0_rgba(0,0,0,0.12)]";
  const kbdMuted =
    "inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1.5 font-mono text-[10px] leading-none text-foreground/70 shadow-[0_1px_0_0_var(--border)]";

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
      <!-- <kbd class={kbdOnPrimary}>{mod}↵</kbd> -->
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
        <!-- <kbd class={kbdMuted}>{mod}S</kbd> -->
      </Button>
    </div>

    <div class="ml-auto flex min-w-0 items-center gap-3">
      {#if queryMs > 0}
        <span
          class="shrink-0 font-mono text-ui-xs tabular-nums text-muted-foreground"
        >
          {queryMs}ms
        </span>
      {/if}
      {#if message}
        <span class="min-w-0 truncate text-ui-xs text-muted-foreground"
          >{message}</span
        >
      {/if}
    </div>
  </div>

  {#if error}
    <Alert.Root variant="destructive" class="mx-3 mt-2 shrink-0">
      <Alert.Description class="text-ui-sm">{error}</Alert.Description>
    </Alert.Root>
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
      <div
        class="flex h-full flex-col items-center justify-center gap-2 text-center"
      >
        <Play class="size-6 text-muted-foreground/20" />
        <p class="font-mono text-ui-sm text-muted-foreground/50">
          Run a query to see results
        </p>
      </div>
    {/if}
  </div>
</div>
