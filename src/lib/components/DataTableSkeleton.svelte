<script>
  import Shimmer from './Shimmer.svelte'
  import { cn } from '$lib/utils.js'

  let {
    columnCount = 6,
    rowCount = 14,
  } = $props()

  const cols = $derived(Math.max(1, Math.min(columnCount, 12)))
  const cellWidths = ['w-[70%]', 'w-[55%]', 'w-[80%]', 'w-[45%]', 'w-[65%]', 'w-[90%]', 'w-[50%]']
</script>

<div
  class="flex h-full min-h-[240px] w-full min-w-full flex-col"
  role="status"
  aria-label="Loading rows"
>
  <div class="sticky top-0 z-10 flex w-full min-w-full border-b border-border bg-panel">
    <div class="flex w-9 shrink-0 items-center px-2 py-2.5">
      <Shimmer class="size-3.5 rounded-sm" rounded="sm" />
    </div>
    {#each Array(cols) as _, colIdx}
      <div
        class="min-w-[100px] flex-1 border-r border-border/50 px-3 py-2 last:border-r-0"
        style:max-width={colIdx === cols - 1 ? undefined : '220px'}
      >
        <Shimmer class="mb-1.5 h-3 w-[75%] rounded-sm" rounded="sm" />
        <Shimmer class="h-2.5 w-[45%] rounded-sm" rounded="sm" />
      </div>
    {/each}
  </div>

  <div class="flex w-full min-w-full flex-1 flex-col">
    {#each Array(rowCount) as _, rowIdx}
      <div
        class="flex w-full min-w-full border-b border-border/30"
        style:opacity={String(1 - rowIdx * 0.04)}
      >
        <div class="flex w-9 shrink-0 items-center px-2 py-2">
          <Shimmer class="size-3.5 rounded-sm" rounded="sm" />
        </div>
        {#each Array(cols) as _, colIdx}
          <div
            class="flex min-w-[100px] flex-1 items-center border-r border-border/20 px-3 py-2 last:border-r-0"
            style:max-width={colIdx === cols - 1 ? undefined : '220px'}
          >
            <Shimmer
              class={cn('h-3 rounded-sm', cellWidths[(rowIdx + colIdx) % cellWidths.length])}
              rounded="sm"
            />
          </div>
        {/each}
      </div>
    {/each}
  </div>
  <span class="sr-only">Loading rows…</span>
</div>
