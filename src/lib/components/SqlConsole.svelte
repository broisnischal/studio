<script>
  import Play from '@lucide/svelte/icons/play'
  import SqlEditor from './SqlEditor.svelte'
  import DataTable from './DataTable.svelte'
  import DataTableSkeleton from './DataTableSkeleton.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Alert from '$lib/components/ui/alert/index.js'
  import { cn } from '$lib/utils.js'

  /** @typedef {import('$lib/monaco-sql-complete.js').SqlSchemaHints} SqlSchemaHints */

  let {
    sql = $bindable('SELECT 1;'),
    columns = [],
    rows = [],
    queryMs = 0,
    message = '',
    loading = false,
    error = '',
    schemaHints = /** @type {SqlSchemaHints} */ ({}),
    onrun = () => {},
    onmodk = undefined,
    onmodenter = undefined,
    onmods = undefined,
  } = $props()

  let selected = $state(new Set())

  const hintKbd =
    'rounded border border-border bg-muted/50 px-1 py-px font-mono text-ui-2xs leading-none text-muted-foreground'
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div
    class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-panel px-3 py-1.5"
  >
    <Button
      type="button"
      variant="default"
      size="sm"
      class="h-7 shrink-0 gap-1.5 px-2.5 text-sm font-medium"
      disabled={loading || !sql.trim()}
      onclick={() => onrun()}
    >
      <Play data-icon="inline-start" />
      Run
      <span
        class={cn(
          'ml-0.5 rounded border  px-1 py-px font-mono text-ui-2xs leading-none',
        )}
        >⌘↵</span
      >
    </Button>

    <div class="flex items-center gap-3 text-ui-xs text-muted-foreground">
      <span class="inline-flex items-center gap-1 font-mono">
        <kbd class={hintKbd}>⌘R</kbd>
        refresh
      </span>
      <span class="inline-flex items-center gap-1 font-mono">
        <kbd class={hintKbd}>⌘S</kbd>
        format
      </span>
    </div>

    {#if queryMs > 0}
      <span class="font-mono text-ui-xs tabular-nums text-muted-foreground">
        {queryMs}ms
      </span>
    {/if}
    {#if message}
      <span class="min-w-0 truncate text-ui-sm text-muted-foreground">{message}</span>
    {/if}
  </div>

  {#if error}
    <Alert.Root variant="destructive" class="mx-3 mt-2 shrink-0">
      <Alert.Description class="text-ui-sm">{error}</Alert.Description>
    </Alert.Root>
  {/if}

  <div class="shrink-0 basis-[42%] border-b border-border bg-panel p-2">
    <div class="relative min-h-[200px] h-full">
      <SqlEditor
        bind:value={sql}
        class="absolute inset-0"
        {schemaHints}
        {onmodk}
        onmodenter={onmodenter ?? (() => onrun())}
        {onmods}
      />
    </div>
  </div>

  <div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-background">
    {#if columns.length > 0}
      <DataTable {columns} {rows} {loading} bind:selected />
    {:else if loading}
      <DataTableSkeleton columnCount={6} rowCount={10} />
    {:else}
      <p class="px-4 py-6 font-mono text-ui-sm text-muted-foreground">
        Results appear here after you run a query.
      </p>
    {/if}
  </div>
</div>
