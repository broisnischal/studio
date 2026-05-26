<script>
  import ScrollText from '@lucide/svelte/icons/scroll-text'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Table2 from '@lucide/svelte/icons/table-2'
  import Terminal from '@lucide/svelte/icons/terminal'
  import Pencil from '@lucide/svelte/icons/pencil'
  import Trash from '@lucide/svelte/icons/trash'
  import Plus from '@lucide/svelte/icons/plus'
  import FileDown from '@lucide/svelte/icons/file-down'
  import Unplug from '@lucide/svelte/icons/unplug'
  import Database from '@lucide/svelte/icons/database'
  import Search from '@lucide/svelte/icons/search'
  import X from '@lucide/svelte/icons/x'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import { cn } from '$lib/utils.js'
  import { subscribeActivityLog, clearActivityLog, getActivityLog } from '$lib/stores/activity-log.js'

  let _gen = $state(0)
  let search = $state('')
  /** @type {import('$lib/stores/activity-log.js').ActivityType | 'all' | 'error'} */
  let typeFilter = $state('all')
  /** @type {string | null} */
  let expanded = $state(null)

  $effect(() => subscribeActivityLog(() => { _gen += 1 }))

  const entries = $derived.by(() => { void _gen; return getActivityLog() })

  const FILTER_GROUPS = [
    { id: 'all',       label: 'All' },
    { id: 'sql_exec',  label: 'SQL' },
    { id: 'table_open',label: 'Tables' },
    { id: 'row_save',  label: 'Edits' },
    { id: 'row_delete',label: 'Deletes' },
    { id: 'row_insert',label: 'Inserts' },
    { id: 'connect',   label: 'Connections' },
    { id: 'error',     label: 'Errors' },
  ]

  const TYPE_LABEL = /** @type {Record<string,string>} */ ({
    connect:      'CONNECT',
    disconnect:   'DISCONNECT',
    table_open:   'TABLE',
    row_fetch:    'FETCH',
    row_save:     'SAVE',
    row_delete:   'DELETE',
    row_insert:   'INSERT',
    sql_exec:     'SQL',
    export:       'EXPORT',
    schema_change:'SCHEMA',
    filter:       'FILTER',
    error:        'ERROR',
  })

  const filtered = $derived.by(() => {
    let list = entries
    if (typeFilter === 'error') {
      list = list.filter((e) => !e.success)
    } else if (typeFilter === 'connect') {
      list = list.filter((e) => e.type === 'connect' || e.type === 'disconnect')
    } else if (typeFilter !== 'all') {
      list = list.filter((e) => e.type === typeFilter)
    }
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((e) =>
        e.title.toLowerCase().includes(q) ||
        e.detail?.toLowerCase().includes(q) ||
        e.table?.toLowerCase().includes(q) ||
        e.error?.toLowerCase().includes(q)
      )
    }
    return list
  })

  const errorCount  = $derived(entries.filter((e) => !e.success).length)
  const timed       = $derived(entries.filter((e) => e.durationMs != null))
  const avgMs       = $derived(timed.length > 0
    ? Math.round(timed.reduce((s, e) => s + (e.durationMs ?? 0), 0) / timed.length)
    : null)

  /** @param {import('$lib/stores/activity-log.js').ActivityType} t */
  function typeIcon(t) {
    if (t === 'connect' || t === 'disconnect') return Unplug
    if (t === 'table_open' || t === 'row_fetch') return Table2
    if (t === 'row_save')   return Pencil
    if (t === 'row_delete') return Trash
    if (t === 'row_insert') return Plus
    if (t === 'sql_exec')   return Terminal
    if (t === 'export')     return FileDown
    if (t === 'schema_change') return Database
    return Terminal
  }

  /** @param {import('$lib/stores/activity-log.js').ActivityEntry} e */
  function rowAccent(e) {
    if (!e.success) return 'border-l-destructive/50 bg-destructive/[0.03]'
    if (e.type === 'connect')    return 'border-l-primary/40'
    if (e.type === 'row_delete') return 'border-l-orange-400/50'
    if (e.type === 'row_insert') return 'border-l-emerald-500/50'
    if (e.type === 'row_save')   return 'border-l-blue-400/40'
    if (e.type === 'sql_exec')   return 'border-l-violet-400/40'
    return 'border-l-transparent'
  }

  /** @param {import('$lib/stores/activity-log.js').ActivityEntry} e */
  function typeChipColor(e) {
    if (!e.success)              return 'bg-destructive/10 text-destructive'
    if (e.type === 'connect')    return 'bg-primary/10 text-primary'
    if (e.type === 'disconnect') return 'bg-muted text-muted-foreground'
    if (e.type === 'row_delete') return 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
    if (e.type === 'row_insert') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
    if (e.type === 'row_save')   return 'bg-blue-500/10 text-blue-600 dark:text-blue-400'
    if (e.type === 'sql_exec')   return 'bg-violet-500/10 text-violet-600 dark:text-violet-400'
    return 'bg-muted text-muted-foreground'
  }

  /** @param {number} ts */
  function fmt(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  }
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel">
  <!-- Header -->
  <div class="studio-chrome flex h-9 shrink-0 items-center gap-2 border-b border-border px-3">
    <ScrollText class="size-3.5 shrink-0 text-muted-foreground/70" />
    <span class="font-mono text-ui-sm font-medium text-foreground">Activity Log</span>
    {#if entries.length > 0}
      <span class="rounded-full bg-muted px-1.5 py-px font-mono text-ui-2xs text-muted-foreground">{entries.length}</span>
    {/if}
    <div class="flex-1"></div>
    {#if errorCount > 0}
      <span class="rounded-full bg-destructive/10 px-2 py-px font-mono text-ui-2xs text-destructive">{errorCount} error{errorCount === 1 ? '' : 's'}</span>
    {/if}
    <button
      type="button"
      class="inline-flex size-6 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-accent hover:text-destructive disabled:opacity-30"
      title="Clear all"
      onclick={() => { clearActivityLog(); _gen += 1 }}
      disabled={entries.length === 0}
    >
      <Trash2 class="size-3.5" />
    </button>
  </div>

  <!-- Filter bar -->
  <div class="flex shrink-0 items-center gap-2 border-b border-border/60 px-3 py-2">
    <!-- Search -->
    <div class="relative flex min-w-0 flex-1 items-center">
      <Search class="pointer-events-none absolute left-2.5 size-3 text-muted-foreground/40" />
      <input
        type="text"
        placeholder="Search…"
        class="h-7 w-full rounded-md border border-border/50 bg-background/60 pl-7 pr-2 font-mono text-ui-xs text-foreground placeholder:text-muted-foreground/30 outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
        bind:value={search}
      />
      {#if search}
        <button
          type="button"
          class="absolute right-1.5 inline-flex size-4 items-center justify-center rounded text-muted-foreground/50 hover:text-foreground"
          onclick={() => { search = '' }}
        ><X class="size-3" /></button>
      {/if}
    </div>
    <!-- Chips -->
    <div class="flex shrink-0 items-center gap-0.5">
      {#each FILTER_GROUPS as g (g.id)}
        <button
          type="button"
          class={cn(
            'rounded-full px-2 py-0.5 font-mono text-ui-2xs transition-colors',
            typeFilter === g.id
              ? 'bg-primary/12 text-primary'
              : 'text-muted-foreground/60 hover:bg-accent/60 hover:text-foreground',
          )}
          onclick={() => { typeFilter = /** @type {any} */ (g.id) }}
        >{g.label}</button>
      {/each}
    </div>
  </div>

  <!-- Feed -->
  <div class="app-scroll min-h-0 flex-1 overflow-y-auto">
    {#if filtered.length === 0}
      <div class="flex flex-col items-center justify-center gap-3 py-24 text-center">
        <ScrollText class="size-9 text-muted-foreground/10" />
        <p class="font-mono text-ui-sm text-muted-foreground/50">
          {entries.length === 0 ? 'No activity yet' : 'No entries match'}
        </p>
      </div>
    {:else}
      {#each filtered as entry (entry.id)}
        {@const Icon = typeIcon(entry.type)}
        {@const isExpanded = expanded === entry.id}
        {@const hasDetail = !!(entry.detail || entry.error)}
        <div class={cn('border-l-2 border-b border-border/20 transition-colors', rowAccent(entry))}>
          <!-- Main row -->
          <button
            type="button"
            class={cn(
              'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-accent/10',
              isExpanded && 'bg-accent/10',
              !hasDetail && 'cursor-default',
            )}
            onclick={() => { if (hasDetail) expanded = isExpanded ? null : entry.id }}
            disabled={!hasDetail}
          >
            <!-- Time -->
            <span class="w-[66px] shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/40">{fmt(entry.timestamp)}</span>

            <!-- Type chip -->
            <span class={cn('inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wider', typeChipColor(entry))}>
              <Icon class="size-2.5" />
              {TYPE_LABEL[entry.type] ?? entry.type}
            </span>

            <!-- Message -->
            <span class="min-w-0 flex-1 truncate font-mono text-ui-xs text-foreground/80">{entry.title}</span>

            <!-- Table badge -->
            {#if entry.table}
              <span class="shrink-0 rounded bg-muted/60 px-1.5 py-px font-mono text-[10px] text-muted-foreground/60">
                {entry.schema ? `${entry.schema}.` : ''}{entry.table}
              </span>
            {/if}

            <!-- Row count -->
            {#if entry.rowCount != null}
              <span class="shrink-0 font-mono text-[10px] tabular-nums text-muted-foreground/40">{entry.rowCount.toLocaleString()}r</span>
            {/if}

            <!-- Duration -->
            {#if entry.durationMs != null}
              <span class="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted-foreground/40">{entry.durationMs}ms</span>
            {/if}

            <!-- Expand indicator -->
            {#if hasDetail}
              <ChevronRight class={cn('size-3 shrink-0 text-muted-foreground/30 transition-transform', isExpanded && 'rotate-90')} />
            {:else}
              <span class="size-3 shrink-0"></span>
            {/if}
          </button>

          <!-- Expanded detail -->
          {#if isExpanded}
            <div class="border-t border-border/30 bg-muted/30 px-4 py-3">
              <div class="mb-2 flex items-center gap-3 font-mono text-[10px] text-muted-foreground/50">
                <span>{new Date(entry.timestamp).toLocaleString()}</span>
                {#if entry.durationMs != null}<span>{entry.durationMs}ms</span>{/if}
                {#if entry.schema || entry.table}
                  <span>{[entry.schema, entry.table].filter(Boolean).join('.')}</span>
                {/if}
              </div>
              {#if entry.detail}
                <pre class="app-scroll max-h-40 overflow-auto rounded-md border border-border/40 bg-background/80 p-2.5 font-mono text-[11px] leading-relaxed text-foreground/90 [white-space:pre-wrap]">{entry.detail}</pre>
              {/if}
              {#if entry.error}
                <pre class="app-scroll mt-2 max-h-28 overflow-auto rounded-md border border-destructive/20 bg-destructive/5 p-2.5 font-mono text-[11px] leading-relaxed text-destructive/90 [white-space:pre-wrap]">{entry.error}</pre>
              {/if}
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>

  <!-- Status bar -->
  <div class="flex shrink-0 items-center gap-3 border-t border-border/40 px-3 py-1">
    <span class="font-mono text-[10px] text-muted-foreground/40 tabular-nums">
      {filtered.length} of {entries.length}
    </span>
    {#if avgMs !== null}
      <span class="font-mono text-[10px] text-muted-foreground/30">avg {avgMs}ms</span>
    {/if}
  </div>
</div>
