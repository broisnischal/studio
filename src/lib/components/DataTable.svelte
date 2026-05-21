<script>
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import { cn } from '$lib/utils.js'

  let {
    columns = [],
    rows = [],
    loading = false,
    selected = $bindable(new Set()),
  } = $props()

  function formatCell(value) {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  function toggleAll(checked) {
    selected = checked ? new Set(rows.map((_, i) => i)) : new Set()
  }

  function toggleRow(idx) {
    const next = new Set(selected)
    if (next.has(idx)) next.delete(idx)
    else next.add(idx)
    selected = next
  }

  const allSelected = $derived(rows.length > 0 && selected.size === rows.length)
  const someSelected = $derived(selected.size > 0 && selected.size < rows.length)
</script>

<div class="min-h-0 flex-1 overflow-auto bg-panel">
  <table class="w-full min-w-max border-collapse text-[12px]">
    <thead class="sticky top-0 z-10 bg-panel">
      <tr class="border-b border-border">
        <th class="w-9 px-2 py-2 text-left font-normal">
          <Checkbox
            checked={allSelected}
            indeterminate={someSelected}
            onCheckedChange={(v) => toggleAll(v === true)}
          />
        </th>
        {#each columns as col}
          <th class="min-w-[120px] max-w-[240px] border-r border-border/60 px-3 py-2 text-left font-normal last:border-r-0">
            <div class="flex items-start justify-between gap-2">
              <div class="flex min-w-0 flex-col gap-0.5">
                <span class="truncate font-mono text-[12px] text-foreground" data-font="mono">{col.name}</span>
                <span class="truncate font-mono text-[10px] text-muted-foreground" data-font="mono">{col.dataType}</span>
              </div>
              <ArrowUpDown class="mt-0.5 size-3 shrink-0 opacity-30" />
            </div>
          </th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#if loading}
        <tr>
          <td colspan={columns.length + 1} class="px-4 py-16 text-center text-muted-foreground">
            Loading rows…
          </td>
        </tr>
      {:else if rows.length === 0}
        <tr>
          <td colspan={columns.length + 1} class="px-4 py-16 text-center text-muted-foreground">
            No rows in this table
          </td>
        </tr>
      {:else}
        {#each rows as row, idx}
          <tr
            class={cn(
              'border-b border-border/40 transition-colors hover:bg-accent/30',
              selected.has(idx) && 'bg-accent/50',
            )}
          >
            <td class="w-9 px-2 py-1.5">
              <Checkbox
                checked={selected.has(idx)}
                onCheckedChange={() => toggleRow(idx)}
              />
            </td>
            {#each row as cell}
              <td
                class="max-w-[240px] border-r border-border/30 px-3 py-1.5 font-mono text-muted-foreground last:border-r-0"
                data-font="mono"
              >
                <span class="block truncate" title={formatCell(cell)}>{formatCell(cell)}</span>
              </td>
            {/each}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
