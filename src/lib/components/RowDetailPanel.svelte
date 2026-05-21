<script>
  import X from '@lucide/svelte/icons/x'
  import ShikiBlock from './ShikiBlock.svelte'
  import * as Tabs from '$lib/components/ui/tabs/index.js'
  import {
    formatJsonValue,
    formatNormalValue,
    formatNormalRecord,
    formatNormalRecords,
    rowToRecord,
    rowsToJsonPayload,
  } from '$lib/row-inspector.js'

  /**
   * @typedef {{ kind: 'cell', rowIdx: number, colIdx: number } | { kind: 'row', rowIdx: number } | { kind: 'rows', rowIndices: number[] }} InspectorTarget
   */

  let {
    columns = [],
    rows = [],
    target = null,
    onclose = () => {},
  } = $props()

  /** @type {'normal' | 'json'} */
  let viewMode = $state('normal')

  const meta = $derived.by(() => {
    if (!target || columns.length === 0) return null

    if (target.kind === 'cell') {
      const col = columns[target.colIdx]
      if (!col) return null
      const value = rows[target.rowIdx]?.[target.colIdx]
      return {
        title: col.name,
        subtitle: col.dataType ?? col.data_type ?? 'unknown',
        badge: `Row ${target.rowIdx + 1}`,
        normalText: formatNormalValue(value),
        jsonText: formatJsonValue(value),
      }
    }

    if (target.kind === 'row') {
      const record = rowToRecord(columns, rows[target.rowIdx] ?? [])
      return {
        title: 'Row',
        subtitle: `${columns.length} fields`,
        badge: `Row ${target.rowIdx + 1}`,
        normalText: formatNormalRecord(record),
        jsonText: formatJsonValue(record),
      }
    }

    const payload = rowsToJsonPayload(columns, rows, target.rowIndices)
    const records = target.rowIndices.map((idx) => rowToRecord(columns, rows[idx] ?? []))
    return {
      title: 'Selection',
      subtitle: `${target.rowIndices.length} rows`,
      badge: null,
      normalText: formatNormalRecords(records),
      jsonText: formatJsonValue(payload),
    }
  })

  const displayCode = $derived(
    meta ? (viewMode === 'json' ? meta.jsonText : meta.normalText) : '',
  )
  const shikiLang = $derived(viewMode === 'json' ? 'json' : 'plaintext')
</script>

{#if target && meta}
  <aside
    class="flex h-full w-[300px] shrink-0 flex-col border-l border-border bg-sidebar text-sidebar-foreground"
  >
    <header class="flex shrink-0 items-start gap-2 border-b border-sidebar-border px-3 py-2.5">
      <div class="min-w-0 flex-1">
        <p class="truncate font-mono text-[12px] font-medium text-foreground">{meta.title}</p>
        <p class="truncate font-mono text-[10px] text-muted-foreground">{meta.subtitle}</p>
        {#if meta.badge}
          <p class="mt-0.5 font-mono text-[10px] text-muted-foreground">{meta.badge}</p>
        {/if}
      </div>
      <button
        type="button"
        class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        title="Close panel"
        onclick={onclose}
      >
        <X class="size-3.5" />
      </button>
    </header>

    <Tabs.Root bind:value={viewMode} class="flex min-h-0 flex-1 flex-col">
      <Tabs.List class="mx-2 mt-2 h-8 w-auto shrink-0">
        <Tabs.Trigger value="normal" class="px-3 text-[11px]">Normal</Tabs.Trigger>
        <Tabs.Trigger value="json" class="px-3 text-[11px]">JSON</Tabs.Trigger>
      </Tabs.List>

      <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
        <ShikiBlock code={displayCode} lang={shikiLang} />
      </div>
    </Tabs.Root>
  </aside>
{/if}
