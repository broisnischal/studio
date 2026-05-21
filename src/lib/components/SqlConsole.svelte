<script>
  import Play from '@lucide/svelte/icons/play'
  import SqlEditor from './SqlEditor.svelte'
  import DataTable from './DataTable.svelte'
  import DataTableSkeleton from './DataTableSkeleton.svelte'
  import { Button } from '$lib/components/ui/button/index.js'
  import * as Alert from '$lib/components/ui/alert/index.js'

  let {
    sql = $bindable('SELECT 1;'),
    columns = [],
    rows = [],
    queryMs = 0,
    message = '',
    loading = false,
    error = '',
    onrun = () => {},
    onmodk = undefined,
    onmodenter = undefined,
    onmods = undefined,
  } = $props()

  let selected = $state(new Set())
</script>

<div class="flex min-h-0 flex-1 flex-col">
  <div
    class="flex shrink-0 items-center gap-2 border-b border-border bg-panel px-3 py-2"
  >
    <Button
      type="button"
      size="sm"
      class="h-7 gap-1.5 px-2.5 text-[12px]"
      disabled={loading || !sql.trim()}
      onclick={() => onrun()}
    >
      <Play class="size-3.5" />
      Run
      <span class="font-mono text-[10px] text-muted-foreground">⌘↵</span>
    </Button>
    <span class="font-mono text-[10px] text-muted-foreground">⌘R refresh</span>
    <span class="font-mono text-[10px] text-muted-foreground">⌘S format</span>
    {#if queryMs > 0}
      <span class="font-mono text-[11px] tabular-nums text-muted-foreground">
        {queryMs}ms
      </span>
    {/if}
    {#if message}
      <span class="truncate text-[12px] text-muted-foreground">{message}</span>
    {/if}
  </div>

  {#if error}
    <Alert.Root variant="destructive" class="mx-3 mt-2 shrink-0">
      <Alert.Description class="text-[12px]">{error}</Alert.Description>
    </Alert.Root>
  {/if}

  <div class="min-h-[200px] shrink-0 basis-[42%] border-b border-border p-2">
    <SqlEditor
      bind:value={sql}
      class="h-full"
      {onmodk}
      onmodenter={onmodenter ?? (() => onrun())}
      {onmods}
    />
  </div>

  <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
    {#if columns.length > 0}
      <DataTable {columns} {rows} {loading} bind:selected />
    {:else if loading}
      <DataTableSkeleton columnCount={6} rowCount={10} />
    {:else}
      <p class="px-4 py-6 font-mono text-[12px] text-muted-foreground">
        Results appear here after you run a query.
      </p>
    {/if}
  </div>
</div>
