<script>
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import History from '@lucide/svelte/icons/history'
  import ListFilter from '@lucide/svelte/icons/list-filter'
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import Plus from '@lucide/svelte/icons/plus'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal'
  import { cn } from '$lib/utils.js'

  let {
    queryMs = 0,
    page = 1,
    pageSize = 50,
    total = 0,
    loading = false,
    onrefresh = () => {},
    onprev = () => {},
    onnext = () => {},
  } = $props()

  const from = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1)
  const to = $derived(Math.min(page * pageSize, total))
  const canPrev = $derived(page > 1)
  const canNext = $derived(page * pageSize < total)

  const iconBtn =
    'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30'
</script>

<header
  class="flex h-10 shrink-0 items-center justify-between gap-3 border-b border-border bg-panel px-3"
>
  <!-- Left: view + navigation -->
  <div class="flex items-center gap-0.5">
    <button type="button" class={iconBtn} title="Toggle sidebar" disabled>
      <PanelLeft class="size-3.5" />
    </button>
    <span class="mx-0.5 h-4 w-px bg-border"></span>
    <button type="button" class={iconBtn} disabled={!canPrev} onclick={onprev} aria-label="Back">
      <ChevronLeft class="size-3.5" />
    </button>
    <button type="button" class={iconBtn} disabled={!canNext} onclick={onnext} aria-label="Forward">
      <ChevronRight class="size-3.5" />
    </button>
    <button type="button" class={iconBtn} title="History" disabled>
      <History class="size-3.5" />
    </button>
  </div>

  <!-- Center: data actions -->
  <div class="flex items-center gap-1">
    <button type="button" class={iconBtn} title="Filter" disabled>
      <ListFilter class="size-3.5" />
    </button>
    <button type="button" class={iconBtn} title="Sort" disabled>
      <ArrowUpDown class="size-3.5" />
    </button>
    <button
      type="button"
      class="ml-1 inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-[12px] font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      disabled
    >
      <Plus class="size-3.5" />
      Add record
    </button>
  </div>

  <!-- Right: perf + pagination -->
  <div class="flex items-center gap-1.5">
    <span class="font-mono text-[11px] text-muted-foreground tabular-nums" data-font="mono">{queryMs}ms</span>
    <span class="text-[12px] text-muted-foreground tabular-nums">
      {from} – {to} of {total}
    </span>
    <button
      type="button"
      class={iconBtn}
      disabled={!canPrev || loading}
      onclick={onprev}
      aria-label="Previous page"
    >
      <ChevronLeft class="size-3.5" />
    </button>
    <button
      type="button"
      class={iconBtn}
      disabled={!canNext || loading}
      onclick={onnext}
      aria-label="Next page"
    >
      <ChevronRight class="size-3.5" />
    </button>
    <button
      type="button"
      class={iconBtn}
      disabled={loading}
      onclick={onrefresh}
      aria-label="Refresh data"
    >
      <RefreshCw class={cn('size-3.5', loading && 'animate-spin')} />
    </button>
    <button type="button" class={iconBtn} title="More" disabled>
      <MoreHorizontal class="size-3.5" />
    </button>
  </div>
</header>
