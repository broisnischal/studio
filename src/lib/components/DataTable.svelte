<script>
  import { tick } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import * as ContextMenu from '$lib/components/ui/context-menu/index.js'
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import Copy from '@lucide/svelte/icons/copy'
  import Pencil from '@lucide/svelte/icons/pencil'
  import CircleSlash from '@lucide/svelte/icons/circle-slash'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Braces from '@lucide/svelte/icons/braces'
  import CheckSquare from '@lucide/svelte/icons/check-square'
  import PanelRight from '@lucide/svelte/icons/panel-right'
  import Table2 from '@lucide/svelte/icons/table-2'
  import DataTableSkeleton from './DataTableSkeleton.svelte'
  import { overlayPointerPosition } from '$lib/app-zoom.js'
  import { cn } from '$lib/utils.js'
  import {
    formatJsonValue,
    formatNormalValue,
    rowToRecord,
  } from '$lib/row-inspector.js'
  import {
    isEditableType,
    parseCellInput,
    valueToEditString,
  } from '$lib/cell-value.js'

  let {
    columns = [],
    rows = [],
    loading = false,
    primaryKey = [],
    saving = false,
    selected = $bindable(new Set()),
    /** @type {number | null} */
    focusedRow = $bindable(null),
    /** @type {number | null} */
    inspectorRow = $bindable(null),
    /** @type {{ rowIdx: number, colIdx: number, draft: string, original: string } | null} */
    editingCell = $bindable(null),
    /**
     * @param {{ rowIdx: number, colIdx: number, value: unknown }} detail
     * @returns {Promise<void>}
     */
    onsave = async () => {},
    /**
     * @param {{ rowIndices: number[] }} detail
     * @returns {Promise<void>}
     */
    ondelete = async () => {},
  } = $props()

  /** @type {HTMLInputElement | null} */
  let editInput = $state(null)
  let contextRowIdx = $state(0)
  let contextColIdx = $state(0)
  let contextMenuOpen = $state(false)
  let pendingContextMenu = $state(false)
  /** @type {{ x: number, y: number } | null} */
  let contextMenuPointer = $state(null)
  /** Block item activation from the right-click pointerup that opened the menu */
  let suppressMenuSelect = $state(false)

  /** Anchor for portaled menu — coords adjusted when #app uses CSS zoom */
  const contextMenuAnchor = {
    getBoundingClientRect() {
      const p = contextMenuPointer
      if (!p) return new DOMRect(0, 0, 0, 0)
      return new DOMRect(p.x, p.y, 0, 0)
    },
  }

  function canEditColumn(colIdx) {
    const col = columns[colIdx]
    if (!col || !primaryKey.length) return false
    return isEditableType(col.dataType ?? col.data_type ?? '')
  }

  const menuColName = $derived(columns[contextColIdx]?.name ?? 'cell')
  const menuEditable = $derived(canEditColumn(contextColIdx))
  const menuCellNull = $derived(
    rows[contextRowIdx]?.[contextColIdx] === null ||
      rows[contextRowIdx]?.[contextColIdx] === undefined,
  )

  function formatCell(value) {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  function focusRow(rowIdx) {
    if (editingCell) return
    focusedRow = rowIdx
  }

  function openInInspector(rowIdx) {
    focusRow(rowIdx)
    inspectorRow = rowIdx
  }

  /** @param {() => void} action */
  function runMenuAction(action) {
    if (suppressMenuSelect) return
    action()
  }

  function armMenuSelectGuard() {
    suppressMenuSelect = true
    const release = () => {
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      setTimeout(() => {
        suppressMenuSelect = false
      }, 0)
    }
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
  }

  /** @param {MouseEvent} e */
  function prepareContextMenu(e) {
    const target = e.target
    if (!(target instanceof Element)) return

    const rowEl = target.closest('[data-row-idx]')
    if (!rowEl) {
      e.preventDefault()
      e.stopPropagation()
      return
    }

    const rowIdx = Number(rowEl.getAttribute('data-row-idx'))
    if (!Number.isFinite(rowIdx)) return

    pendingContextMenu = true
    contextRowIdx = rowIdx

    const cellEl = target.closest('td[data-col-idx]')
    contextColIdx = cellEl ? Number(cellEl.getAttribute('data-col-idx')) || 0 : 0
    contextMenuPointer = overlayPointerPosition(e.clientX, e.clientY)
  }

  function startEdit(rowIdx, colIdx) {
    const col = columns[colIdx]
    if (!col) return

    if (!primaryKey.length) {
      toast.error('Cannot edit', {
        description: 'This table has no primary key.',
      })
      return
    }

    const dataType = col.dataType ?? col.data_type ?? ''
    if (!isEditableType(dataType)) {
      toast.error('Cannot edit column', {
        description: `${col.name} (${dataType}) is not editable.`,
      })
      return
    }

    focusRow(rowIdx)
    const original = valueToEditString(rows[rowIdx]?.[colIdx])
    editingCell = {
      rowIdx,
      colIdx,
      draft: original,
      original,
    }
  }

  function cancelEdit() {
    if (!editingCell) return
    editingCell = null
  }

  async function commitEdit() {
    if (!editingCell || saving) return

    const { rowIdx, colIdx, draft } = editingCell
    const col = columns[colIdx]
    if (!col) return

    if (draft === editingCell.original) {
      editingCell = null
      return
    }

    const parsed = parseCellInput(draft, col.dataType ?? col.data_type ?? 'text')
    if (!parsed.ok) {
      toast.error('Invalid value', { description: parsed.message })
      return
    }

    try {
      await onsave({ rowIdx, colIdx, value: parsed.value })
      editingCell = null
      toast.success('Saved', { description: `${col.name} updated` })
    } catch (err) {
      toast.error('Save failed', { description: String(err) })
    }
  }

  async function copyCellValue(rowIdx, colIdx) {
    const value = rows[rowIdx]?.[colIdx]
    try {
      await navigator.clipboard.writeText(formatNormalValue(value))
      toast.success('Copied')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  async function copyRowJson(rowIdx) {
    const record = rowToRecord(columns, rows[rowIdx] ?? [])
    try {
      await navigator.clipboard.writeText(formatJsonValue(record))
      toast.success('Copied row as JSON')
    } catch {
      toast.error('Could not copy to clipboard')
    }
  }

  async function setCellNull(rowIdx, colIdx) {
    const col = columns[colIdx]
    if (!col || !canEditColumn(colIdx)) return
    if (rows[rowIdx]?.[colIdx] === null) {
      toast.message('Already NULL')
      return
    }
    try {
      await onsave({ rowIdx, colIdx, value: null })
      toast.success('Set to NULL', { description: col.name })
    } catch (err) {
      toast.error('Update failed', { description: String(err) })
    }
  }

  /** @param {number} rowIdx */
  function rowIndicesToDelete(rowIdx) {
    if (selected.size > 0 && selected.has(rowIdx)) {
      return [...selected].sort((a, b) => a - b)
    }
    return [rowIdx]
  }

  /** @param {number} rowIdx */
  async function deleteRow(rowIdx) {
    if (!primaryKey.length) {
      toast.error('Cannot delete', {
        description: 'This table has no primary key.',
      })
      return
    }
    const rowIndices = rowIndicesToDelete(rowIdx)
    try {
      await ondelete({ rowIndices })
      const n = rowIndices.length
      toast.success(n === 1 ? 'Row deleted' : `${n} rows deleted`)
    } catch (err) {
      toast.error('Delete failed', { description: String(err) })
    }
  }

  $effect(() => {
    if (!editingCell) return
    void tick().then(() => {
      const el = editInput
      if (!el) return
      el.focus()
      const len = el.value.length
      el.setSelectionRange(len, len)
    })
  })

  /** @param {KeyboardEvent} e */
  function handleEditKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancelEdit()
      return
    }
    if (e.key === 'Enter' && !(e.shiftKey || e.altKey)) {
      e.preventDefault()
      void commitEdit()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault()
      void commitEdit()
    }
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
  const hasPrimaryKey = $derived(primaryKey.length > 0)

  /** @param {number} idx */
  function rowClass(idx) {
    const isFocused = focusedRow === idx
    const isSelected = selected.has(idx)
    return cn(
      'border-b border-border/40 outline-none transition-colors hover:bg-accent/25',
      isSelected && 'bg-accent/20',
      isFocused && !isSelected && 'bg-accent/15',
      isFocused && isSelected && 'ring-1 ring-ring/60 ring-inset',
    )
  }

  /** @param {string} dataType */
  function cellMaxWidthClass(dataType) {
    const t = dataType.toLowerCase()
    if (t.includes('json') || t === 'jsonb') return 'max-w-md'
    if (t.includes('text') || t.includes('char') || t.includes('uuid')) return 'max-w-sm'
    return 'max-w-xs'
  }
</script>

{#if loading}
  <div class="app-scroll min-h-0 flex-1 overflow-auto bg-panel">
    <DataTableSkeleton columnCount={columns.length || 6} />
  </div>
{:else}
  <ContextMenu.Root
    onOpenChange={(open) => {
      contextMenuOpen = open
      if (open) {
        armMenuSelectGuard()
      } else {
        pendingContextMenu = false
        contextMenuPointer = null
        suppressMenuSelect = false
      }
    }}
  >
    <ContextMenu.Trigger disabled={rows.length === 0}>
      {#snippet child({ props })}
        <div
          {...props}
          class="app-scroll relative min-h-0 flex-1 overflow-auto bg-panel"
          oncontextmenucapture={prepareContextMenu}
        >
          <table class="w-max min-w-full border-collapse text-[12px]">
            <thead class="sticky top-0 z-10 bg-panel">
              <tr class="border-b border-border">
                <th class="w-9 px-2 py-1.5 text-left font-normal">
                  <Checkbox
                    checked={allSelected}
                    indeterminate={someSelected}
                    onCheckedChange={(v) => toggleAll(v === true)}
                  />
                </th>
                {#each columns as col}
                  <th
                    class={cn(
                      'whitespace-nowrap border-r border-border/60 px-3 py-1.5 text-left font-normal last:border-r-0',
                      cellMaxWidthClass(col.dataType ?? col.data_type ?? ''),
                    )}
                  >
                    <div class="flex items-start gap-2">
                      <div class="flex flex-col gap-0.5">
                        <span class="font-mono text-[12px] text-foreground" data-font="mono"
                          >{col.name}</span
                        >
                        <span class="font-mono text-[10px] text-muted-foreground" data-font="mono"
                          >{col.dataType}</span
                        >
                      </div>
                      <ArrowUpDown class="mt-0.5 size-3 shrink-0 opacity-30" />
                    </div>
                  </th>
                {/each}
              </tr>
            </thead>
            {#if rows.length > 0}
            <tbody>
                {#each rows as row, idx}
                  <tr
                    data-row-idx={idx}
                    tabindex={editingCell ? -1 : 0}
                    class={rowClass(idx)}
                    onclick={(e) => {
                      if (e.button !== 0) return
                      if (editingCell) cancelEdit()
                      focusRow(idx)
                    }}
                    onfocus={() => {
                      if (contextMenuOpen || pendingContextMenu) return
                      focusRow(idx)
                    }}
                  >
                    <td class="w-9 px-2 py-1" onclick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(idx)}
                        onCheckedChange={() => toggleRow(idx)}
                      />
                    </td>
                    {#each row as cell, colIdx}
                      {@const isEditing =
                        editingCell?.rowIdx === idx && editingCell?.colIdx === colIdx}
                      {@const col = columns[colIdx]}
                      <td
                        data-col-idx={colIdx}
                        class={cn(
                          'border-r border-border/30 font-mono last:border-r-0',
                          col && cellMaxWidthClass(col.dataType ?? col.data_type ?? ''),
                          isEditing
                            ? 'relative p-0 align-middle ring-2 ring-inset ring-primary bg-background'
                            : 'whitespace-nowrap px-3 py-1 text-muted-foreground',
                        )}
                        data-font="mono"
                        ondblclick={(e) => {
                          e.preventDefault()
                          startEdit(idx, colIdx)
                        }}
                        onkeydown={(e) => {
                          if (isEditing) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            startEdit(idx, colIdx)
                          }
                        }}
                      >
                        {#if isEditing && editingCell}
                          <input
                            bind:this={editInput}
                            bind:value={editingCell.draft}
                            disabled={saving}
                            aria-label="Edit {col?.name ?? 'cell'}"
                            class="box-border block h-7 w-full min-w-0 max-w-full overflow-x-auto border-0 bg-transparent px-3 py-1 font-mono text-[12px] text-foreground outline-none [field-sizing:fixed] selection:bg-primary/20"
                            onclick={(e) => e.stopPropagation()}
                            onkeydown={handleEditKeydown}
                          />
                        {:else}
                          <span class="block truncate" title={formatCell(cell)}>
                            {formatCell(cell)}
                          </span>
                        {/if}
                      </td>
                    {/each}
                  </tr>
                {/each}
            </tbody>
            {/if}
          </table>
          {#if rows.length === 0}
            <div
              class="pointer-events-none absolute inset-0 flex items-center justify-center"
              role="status"
              aria-live="polite"
            >
              <div class="flex flex-col items-center gap-2 px-4 text-center">
                <Table2 class="size-8 text-muted-foreground/25" />
                <p class="text-[12px] text-muted-foreground">No rows in this table</p>
              </div>
            </div>
          {/if}
        </div>
      {/snippet}
    </ContextMenu.Trigger>

    <ContextMenu.Content
      customAnchor={contextMenuAnchor}
      strategy="fixed"
      side="bottom"
      align="start"
      sideOffset={4}
      onOpenAutoFocus={(e) => e.preventDefault()}
      class={cn(
        'w-max min-w-32 p-0.5 text-[11px]',
        '[&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-[11px]',
        '[&_[data-slot=context-menu-shortcut]]:text-[10px]',
        '[&_[data-slot=context-menu-item]_svg]:size-3.5',
      )}
    >
      <ContextMenu.Item onSelect={() => runMenuAction(() => openInInspector(contextRowIdx))}>
        <PanelRight />
        Open
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item
        disabled={!menuEditable}
        onSelect={() => runMenuAction(() => startEdit(contextRowIdx, contextColIdx))}
      >
        <Pencil />
        Edit {menuColName}
        <ContextMenu.Shortcut>Enter</ContextMenu.Shortcut>
      </ContextMenu.Item>
      <ContextMenu.Item
        onSelect={() => runMenuAction(() => copyCellValue(contextRowIdx, contextColIdx))}
      >
        <Copy />
        Copy
        <ContextMenu.Shortcut>⌘C</ContextMenu.Shortcut>
      </ContextMenu.Item>
      <ContextMenu.Item
        disabled={!menuEditable || menuCellNull}
        onSelect={() => runMenuAction(() => setCellNull(contextRowIdx, contextColIdx))}
      >
        <CircleSlash />
        Set NULL
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={() => runMenuAction(() => copyRowJson(contextRowIdx))}>
        <Braces />
        Copy row JSON
      </ContextMenu.Item>
      <ContextMenu.Item onSelect={() => runMenuAction(() => toggleRow(contextRowIdx))}>
        <CheckSquare />
        {selected.has(contextRowIdx) ? 'Deselect row' : 'Select row'}
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item
        variant="destructive"
        disabled={!hasPrimaryKey || saving}
        onSelect={() => runMenuAction(() => deleteRow(contextRowIdx))}
      >
        <Trash2 />
        {selected.size > 1 && selected.has(contextRowIdx)
          ? `Delete ${selected.size} rows`
          : 'Delete row'}
        <ContextMenu.Shortcut>⌘⌫</ContextMenu.Shortcut>
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Root>
{/if}
