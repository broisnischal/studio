<script>
  import X from '@lucide/svelte/icons/x'
  import Copy from '@lucide/svelte/icons/copy'
  import ShikiBlock from './ShikiBlock.svelte'
  import ResizeHandle from './ResizeHandle.svelte'
  import * as Tabs from '$lib/components/ui/tabs/index.js'
  import { toast } from 'svelte-sonner'
  import {
    formatJsonValue,
    formatNormalValue,
    formatNormalRecord,
    formatNormalRecords,
    rowToRecord,
    rowsToJsonPayload,
  } from '$lib/row-inspector.js'
  import {
    clampInspectorWidth,
    loadLayout,
    saveLayout,
  } from '$lib/stores/layout.js'
  import { formatCompactCount } from '$lib/table-list.js'
  import { cellLinkHref, cellUrlType } from '$lib/cell-display.js'
  import ExternalLink from '@lucide/svelte/icons/external-link'

  /**
   * @typedef {{ kind: 'cell', rowIdx: number, colIdx: number } | { kind: 'row', rowIdx: number } | { kind: 'rows', rowIndices: number[] }} InspectorTarget
   */

  let {
    columns = [],
    rows = [],
    target = null,
    onclose = () => {},
  } = $props()

  const initialLayout = loadLayout()
  let width = $state(initialLayout.inspectorWidth)
  let resizeStartWidth = initialLayout.inspectorWidth
  /** @type {'normal' | 'json' | 'preview'} */
  let viewMode = $state(initialLayout.inspectorView)

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
      subtitle: `${formatCompactCount(target.rowIndices.length)} rows`,
      badge: null,
      normalText: formatNormalRecords(records),
      jsonText: formatJsonValue(payload),
    }
  })

  const displayCode = $derived(
    meta ? (viewMode === 'json' ? meta.jsonText : meta.normalText) : '',
  )
  const shikiLang = $derived(viewMode === 'json' ? 'json' : 'plaintext')

  // Detect if the inspected cell value is a previewable URL
  const cellPreviewHref = $derived.by(() => {
    if (!target || target.kind !== 'cell') return null
    const value = rows[target.rowIdx]?.[target.colIdx]
    if (typeof value !== 'string') return null
    return cellLinkHref(value)
  })
  const cellPreviewType = $derived(cellUrlType(cellPreviewHref))
  const hasPreview = $derived(cellPreviewType === 'image' || cellPreviewType === 'pdf')

  // Fall back from preview tab when navigating to a non-previewable cell
  $effect(() => {
    if (viewMode === 'preview' && !hasPreview) viewMode = 'normal'
  })

  $effect(() => {
    if (viewMode !== 'preview') saveLayout({ inspectorView: viewMode })
  })

  async function openPreviewExternal() {
    if (!cellPreviewHref) return
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
    if (isTauri) {
      const { openUrl: open } = await import('@tauri-apps/plugin-opener')
      await open(cellPreviewHref)
    } else {
      window.open(cellPreviewHref, '_blank', 'noopener,noreferrer')
    }
  }

  async function copyJson() {
    if (!meta?.jsonText) return
    try {
      await navigator.clipboard.writeText(meta.jsonText)
      toast.success('Copied JSON')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }
</script>

{#if target && meta}
  <div class="flex h-full shrink-0" style:width="{width}px">
    <ResizeHandle
      edge="start"
      onresizestart={() => {
        resizeStartWidth = width
      }}
      onresize={(dx) => {
        width = clampInspectorWidth(resizeStartWidth + dx)
      }}
      onresizeend={() => {
        resizeStartWidth = width
        saveLayout({ inspectorWidth: width })
      }}
    />
    <aside
      class="flex h-full min-w-0 flex-1 flex-col border-l border-border bg-sidebar text-sidebar-foreground"
    >
      <header
        class="studio-chrome flex shrink-0 items-start gap-2 border-b border-sidebar-border px-3 py-2.5"
        data-studio-chrome
      >
        <div class="min-w-0 flex-1">
          <p class="truncate font-mono text-ui-sm font-medium text-foreground">{meta.title}</p>
          <p class="truncate font-mono text-ui-2xs text-muted-foreground">{meta.subtitle}</p>
          {#if meta.badge}
            <p class="mt-0.5 font-mono text-ui-2xs text-muted-foreground">{meta.badge}</p>
          {/if}
        </div>
        <button
          type="button"
          class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Copy JSON"
          onclick={copyJson}
        >
          <Copy class="size-3.5" />
        </button>
        <button
          type="button"
          class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          title="Close panel (Esc)"
          onclick={onclose}
        >
          <X class="size-3.5" />
        </button>
      </header>

      <Tabs.Root bind:value={viewMode} class="flex min-h-0 flex-1 flex-col">
        <Tabs.List class="studio-chrome mx-2 mt-2 h-8 w-auto shrink-0" data-studio-chrome>
          <Tabs.Trigger value="normal" class="px-3 text-ui-xs">Normal</Tabs.Trigger>
          <Tabs.Trigger value="json" class="px-3 text-ui-xs">JSON</Tabs.Trigger>
          {#if hasPreview}
            <Tabs.Trigger value="preview" class="px-3 text-ui-xs">Preview</Tabs.Trigger>
          {/if}
        </Tabs.List>

        <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
          {#if viewMode === 'preview' && cellPreviewHref}
            <div class="flex min-h-0 flex-1 flex-col items-center justify-start gap-3 overflow-auto p-3">
              {#if cellPreviewType === 'image'}
                <img
                  src={cellPreviewHref}
                  alt=""
                  class="max-w-full rounded border border-border object-contain shadow-sm"
                  style="max-height: calc(100% - 2.5rem)"
                />
              {:else if cellPreviewType === 'pdf'}
                <div class="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 px-6 py-8 text-center">
                  <svg class="size-10 text-muted-foreground/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <path d="M9 13h1.5a1.5 1.5 0 0 1 0 3H9v-3z"/>
                    <path d="M13 13h2v1.5h-2V13z"/>
                    <path d="M16 13v3"/>
                  </svg>
                  <p class="text-ui-sm font-medium text-foreground">PDF Document</p>
                  <p class="text-ui-xs text-muted-foreground">Opens in your system PDF viewer</p>
                </div>
              {/if}
              <button
                type="button"
                class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-ui-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onclick={openPreviewExternal}
              >
                <ExternalLink class="size-3" />
                Open in browser
              </button>
            </div>
          {:else}
            <ShikiBlock
              code={displayCode}
              lang={shikiLang}
              jsonInteractive={viewMode === 'json'}
            />
          {/if}
        </div>
      </Tabs.Root>
    </aside>
  </div>
{/if}
