<script>
  import { tick } from 'svelte'
  import { toast } from 'svelte-sonner'
  import { Checkbox } from '$lib/components/ui/checkbox/index.js'
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import { cn } from '$lib/utils.js'
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
    /** @type {{ rowIdx: number, colIdx: number, draft: string } | null} */
    editingCell = $bindable(null),
    /**
     * @param {{ rowIdx: number, colIdx: number, value: unknown }} detail
     * @returns {Promise<void>}
     */
    onsave = async () => {},
  } = $props()

  /** @type {HTMLInputElement | null} */
  let editInput = $state(null)

  function formatCell(value) {
    if (value === null || value === undefined) return 'NULL'
    if (typeof value === 'object') return JSON.stringify(value)
    return String(value)
  }

  function focusRow(rowIdx) {
    if (editingCell) return
    focusedRow = rowIdx
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

    focusedRow = rowIdx
    editingCell = {
      rowIdx,
      colIdx,
      draft: valueToEditString(rows[rowIdx]?.[colIdx]),
    }
  }

  function cancelEdit() {
    editingCell = null
  }

  async function commitEdit() {
    if (!editingCell || saving) return

    const { rowIdx, colIdx, draft } = editingCell
    const col = columns[colIdx]
    if (!col) return

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

  $effect(() => {
    if (!editingCell) return
    void tick().then(() => {
      editInput?.focus()
      editInput?.select()
    })
  })

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
  const editingRowIdx = $derived(editingCell?.rowIdx ?? null)
</script>

<div class="min-h-0 flex-1 overflow-auto bg-panel">
  <table class="w-full min-w-max border-collapse text-[12px]">
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
          <th class="min-w-[120px] max-w-[240px] border-r border-border/60 px-3 py-1.5 text-left font-normal last:border-r-0">
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
            tabindex={editingRowIdx === idx ? -1 : 0}
            class={cn(
              'border-b border-border/40 transition-colors outline-none hover:bg-accent/30',
              selected.has(idx) && 'bg-accent/50',
              focusedRow === idx &&
                editingRowIdx !== idx &&
                'bg-accent/40 ring-1 ring-ring ring-inset',
              editingRowIdx === idx && 'bg-primary/15 ring-1 ring-primary/70 ring-inset',
            )}
            onclick={() => focusRow(idx)}
            onfocus={() => focusRow(idx)}
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
              <td
                class={cn(
                  'max-w-[240px] border-r border-border/30 px-3 py-1 font-mono text-muted-foreground last:border-r-0',
                  isEditing &&
                    'bg-primary px-0 py-0 text-primary-foreground ring-2 ring-primary ring-inset',
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
                    class="block h-7 w-full min-w-[120px] border-0 bg-transparent px-3 py-1 font-mono text-[12px] text-inherit outline-none selection:bg-primary-foreground/30 selection:text-primary"
                    onclick={(e) => e.stopPropagation()}
                    onkeydown={(e) => {
                      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                        e.preventDefault()
                        void commitEdit()
                      } else if (e.key === 'Escape') {
                        e.preventDefault()
                        cancelEdit()
                      } else if (e.key === 'Enter') {
                        e.preventDefault()
                        void commitEdit()
                      }
                    }}
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
      {/if}
    </tbody>
  </table>
</div>
