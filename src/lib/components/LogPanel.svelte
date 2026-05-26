<script>
  import { tick } from 'svelte'
  import X from '@lucide/svelte/icons/x'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import CircleDot from '@lucide/svelte/icons/circle-dot'
  import ResizeHandle from './ResizeHandle.svelte'
  import { cn } from '$lib/utils.js'
  import { subscribeActivityLog, clearActivityLog, getActivityLog } from '$lib/stores/activity-log.js'
  import { clampLogPanelWidth, loadLayout, saveLayout } from '$lib/stores/layout.js'

  let { onclose = () => {} } = $props()

  const initialLayout = loadLayout()
  let width = $state(initialLayout.logPanelWidth)
  let resizeStartWidth = initialLayout.logPanelWidth

  // Single state: a generation counter bumped by the store callback.
  // The component reads getActivityLog() directly to avoid copying the array.
  let _gen = $state(0)
  let autoScroll = $state(true)
  /** @type {HTMLDivElement | null} */
  let logContainer = $state(null)
  /** @type {'all' | 'error'} */
  let filter = $state('all')

  // Subscribe only while the panel is mounted (it's only mounted when open).
  $effect(() => {
    return subscribeActivityLog(() => { _gen += 1 })
  })

  // Scroll to bottom when new entries arrive, but only if autoScroll is on.
  $effect(() => {
    const __ = _gen
    if (!autoScroll || !logContainer) return
    const el = logContainer
    // Use rAF instead of tick() to avoid layout thrashing
    requestAnimationFrame(() => {
      if (el && autoScroll) el.scrollTop = el.scrollHeight
    })
  })

  // Read the live array each render; no copy needed
  const entries = $derived.by(() => { void _gen; return getActivityLog() })
  const displayed = $derived(
    filter === 'error' ? entries.filter((e) => !e.success) : entries
  )
  const errorCount = $derived(entries.filter((e) => !e.success).length)

  /** @param {import('$lib/stores/activity-log.js').ActivityEntry} e */
  function lineColor(e) {
    if (!e.success) return 'text-destructive/90'
    if (e.type === 'connect') return 'text-primary'
    if (e.type === 'disconnect') return 'text-muted-foreground/50'
    if (e.type === 'row_delete') return 'text-orange-500 dark:text-orange-400'
    if (e.type === 'row_insert') return 'text-emerald-600 dark:text-emerald-400'
    if (e.type === 'row_save') return 'text-blue-500 dark:text-blue-400'
    if (e.type === 'sql_exec') return 'text-foreground/80'
    if (e.type === 'export') return 'text-violet-500 dark:text-violet-400'
    return 'text-muted-foreground/70'
  }

  const TYPE_TAG = /** @type {Record<string, string>} */ ({
    connect:      'CON',
    disconnect:   'DIS',
    table_open:   'TAB',
    row_fetch:    'ERR',
    row_save:     'SAV',
    row_delete:   'DEL',
    row_insert:   'INS',
    sql_exec:     'SQL',
    export:       'EXP',
    schema_change:'SCH',
    error:        'ERR',
  })

  /** @param {number} ts */
  function hms(ts) {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
    })
  }

  function handleScroll() {
    if (!logContainer) return
    const { scrollTop, scrollHeight, clientHeight } = logContainer
    autoScroll = scrollHeight - scrollTop - clientHeight < 32
  }

  function scrollToBottom() {
    autoScroll = true
    if (logContainer) logContainer.scrollTop = logContainer.scrollHeight
  }
</script>

<div
  class="flex h-full min-w-0 shrink-0 flex-col border-l border-border bg-panel"
  style="width: {width}px; min-width: {width}px; max-width: {width}px"
>
  <ResizeHandle
    edge="start"
    onresizestart={() => { resizeStartWidth = width }}
    onresize={(dx) => {
      width = clampLogPanelWidth(resizeStartWidth - dx)
      saveLayout({ logPanelWidth: width })
    }}
    onresizeend={() => { saveLayout({ logPanelWidth: width }) }}
  />

  <!-- Header -->
  <div class="studio-chrome flex h-9 shrink-0 items-center gap-1.5 border-b border-border px-3">
    <CircleDot class="size-3 shrink-0 text-primary/60" />
    <span class="flex-1 font-mono text-ui-xs font-medium text-foreground">Activity</span>

    <!-- Filter chips -->
    <button
      type="button"
      class={cn('rounded px-1.5 py-0.5 font-mono text-ui-2xs transition-colors',
        filter === 'all' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground')}
      onclick={() => { filter = 'all' }}
    >All</button>
    <button
      type="button"
      class={cn('rounded px-1.5 py-0.5 font-mono text-ui-2xs transition-colors',
        filter === 'error' ? 'bg-destructive/15 text-destructive' : 'text-muted-foreground hover:text-foreground')}
      onclick={() => { filter = 'error' }}
    >Errors</button>

    <div class="mx-1 h-3.5 w-px bg-border/60"></div>

    <button
      type="button"
      class="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-destructive disabled:opacity-30"
      title="Clear log"
      onclick={() => { clearActivityLog(); _gen += 1 }}
      disabled={entries.length === 0}
    >
      <Trash2 class="size-3" />
    </button>
    <button
      type="button"
      class="inline-flex size-6 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      title="Close log panel (⌘⇧L)"
      onclick={onclose}
    >
      <X class="size-3" />
    </button>
  </div>

  <!-- Log lines -->
  <div
    bind:this={logContainer}
    class="app-scroll min-h-0 flex-1 overflow-y-auto"
    onscroll={handleScroll}
  >
    {#if displayed.length === 0}
      <div class="flex flex-col items-center justify-center gap-2 py-12 text-center">
        <CircleDot class="size-6 text-muted-foreground/15" />
        <p class="font-mono text-ui-2xs text-muted-foreground/40">
          {entries.length === 0 ? 'Waiting for activity…' : 'No errors logged'}
        </p>
      </div>

    {:else}
      <div class="py-1">
        {#each displayed as entry (entry.id)}
          {@const color = lineColor(entry)}
          {@const tag = TYPE_TAG[entry.type] ?? '???'}
          <div
            class={cn(
              'group flex min-w-0 items-baseline gap-0 px-3 py-[2px] font-mono text-[11px] leading-5 transition-colors hover:bg-accent/15',
              !entry.success && 'bg-destructive/5 hover:bg-destructive/10',
            )}
            title={entry.detail || entry.error || entry.title}
          >
            <!-- Time -->
            <span class="w-[54px] shrink-0 select-none tabular-nums text-muted-foreground/35 text-[10px]">
              {hms(entry.timestamp)}
            </span>

            <!-- Type tag -->
            <span class={cn('w-[28px] shrink-0 select-none text-[9px] font-bold tracking-wider uppercase', color)}>
              {tag}
            </span>

            <!-- Message -->
            <span class={cn('min-w-0 flex-1 truncate', color)}>
              {entry.title}
              {#if entry.table && entry.type !== 'table_open'}
                <span class="text-muted-foreground/40"> · {entry.table}</span>
              {/if}
              {#if entry.rowCount != null}
                <span class="text-muted-foreground/40"> · {entry.rowCount.toLocaleString()}r</span>
              {/if}
            </span>

            <!-- Duration -->
            {#if entry.durationMs != null}
              <span class="ml-1.5 shrink-0 tabular-nums text-muted-foreground/30 text-[10px]">
                {entry.durationMs}ms
              </span>
            {/if}
          </div>
          {#if entry.error}
            <div class="px-3 py-0.5 font-mono text-[10px] leading-4 text-destructive/70 bg-destructive/5 truncate" title={entry.error}>
              &nbsp;&nbsp;↳ {entry.error.split('\n')[0]}
            </div>
          {/if}
        {/each}
      </div>
    {/if}
  </div>

  <!-- Footer: scroll-to-bottom + entry count -->
  <div class="flex shrink-0 items-center justify-between border-t border-border/50 px-3 py-1">
    <span class="font-mono text-ui-2xs text-muted-foreground/40 tabular-nums">
      {entries.length} events
      {#if errorCount > 0}
        · <span class="text-destructive/60">{errorCount} errors</span>
      {/if}
    </span>
    {#if !autoScroll}
      <button
        type="button"
        class="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-ui-2xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        onclick={scrollToBottom}
      >
        <ChevronDown class="size-3" />
        Latest
      </button>
    {/if}
  </div>
</div>
