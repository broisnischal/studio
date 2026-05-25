<script>
  import { tick } from "svelte";
  import { toast } from "svelte-sonner";
  import { Checkbox } from "$lib/components/ui/checkbox/index.js";
  import * as ContextMenu from "$lib/components/ui/context-menu/index.js";
  import ArrowUpDown from "@lucide/svelte/icons/arrow-up-down";
  import ChevronRight from "@lucide/svelte/icons/chevron-right";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Copy from "@lucide/svelte/icons/copy";
  import Pencil from "@lucide/svelte/icons/pencil";
  import CircleSlash from "@lucide/svelte/icons/circle-slash";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Braces from "@lucide/svelte/icons/braces";
  import CheckSquare from "@lucide/svelte/icons/check-square";
  import PanelRight from "@lucide/svelte/icons/panel-right";
  import Table2 from "@lucide/svelte/icons/table-2";
  import ExternalLink from "@lucide/svelte/icons/external-link";
  import {
    findForeignKeyForColumn,
    foreignKeyTargetLabel,
  } from "$lib/foreign-key-nav.js";
  import TableLoading from "./TableLoading.svelte";
  import MiniJsonViewer from "./MiniJsonViewer.svelte";
  import ColumnResizeHandle from "./ColumnResizeHandle.svelte";
  import {
    loadColumnWidths,
    saveColumnWidths,
  } from "$lib/stores/table-column-widths.js";
  import {
    clampColumnWidth,
    defaultColumnWidth,
  } from "$lib/table-column-widths.js";
  import { formatCompactCount } from "$lib/table-list.js";
  import { cn } from "$lib/utils.js";
  import {
    formatJsonValue,
    formatNormalValue,
    rowToRecord,
  } from "$lib/row-inspector.js";
  import {
    getColumnEnumValues,
    isBooleanType,
    isEditableType,
    parseCellInput,
    valueToEditString,
  } from "$lib/cell-value.js";
  import { cellLinkHref, cellUrlType } from "$lib/cell-display.js";
  import UrlPreviewTooltip from "./UrlPreviewTooltip.svelte";
  import MediaLightbox from "./MediaLightbox.svelte";

  let {
    columns = [],
    rows = [],
    loading = false,
    primaryKey = [],
    foreignKeys = [],
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
    /** @param {{ rowIdx: number, colIdx: number }} detail */
    onfollowforeignkey = () => {},
    /** Compact layout for AI chat / nested panels */
    embedded = false,
    showSelection = true,
    showRowExpand = true,
    /** Persist column widths per table, e.g. "public.users" */
    columnWidthsKey = undefined,
    /** Set of column names to hide. Controlled externally (toolbar). */
    hiddenColumns = /** @type {Set<string>} */ (new Set()),
  } = $props();

  /** @type {HTMLInputElement | HTMLSelectElement | HTMLButtonElement | null} */
  let editInput = $state(null);
  let contextRowIdx = $state(0);
  let contextColIdx = $state(0);
  let contextMenuOpen = $state(false);
  let pendingContextMenu = $state(false);
  /** Block item activation from the right-click pointerup that opened the menu */
  let suppressMenuSelect = $state(false);
  /** Row indices with inline JSON detail open */
  let expandedRows = $state(new Set());
  /** @type {Record<string, number>} */
  let columnWidths = $state({});
  /** @type {string | null} */
  let resizingColName = $state(null);
  let resizeStartWidth = 0;

  // ── URL preview / lightbox ────────────────────────────────────────────────
  /** @type {string | null} */
  let previewUrl = $state(null);
  /** @type {'image' | 'pdf' | 'link' | null} */
  let previewType = $state(null);
  /** @type {DOMRect | null} */
  let previewAnchorRect = $state(null);
  /** @type {ReturnType<typeof setTimeout> | null} */
  let previewShowTimer = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let previewHideTimer = null;

  /** @type {string | null} */
  let lightboxUrl = $state(null);
  /** @type {'image' | 'pdf'} */
  let lightboxType = $state("image");

  /** @param {string} href @param {'image'|'pdf'|'link'} type @param {DOMRect} rect */
  function showUrlPreview(href, type, rect) {
    if (previewHideTimer) {
      clearTimeout(previewHideTimer);
      previewHideTimer = null;
    }
    if (previewShowTimer) clearTimeout(previewShowTimer);
    if (type === "link") return;
    previewShowTimer = setTimeout(() => {
      previewUrl = href;
      previewType = type;
      previewAnchorRect = rect;
      previewShowTimer = null;
    }, 350);
  }

  function scheduleHidePreview() {
    if (previewShowTimer) {
      clearTimeout(previewShowTimer);
      previewShowTimer = null;
    }
    if (previewHideTimer) return;
    previewHideTimer = setTimeout(() => {
      previewUrl = null;
      previewHideTimer = null;
    }, 250);
  }

  function cancelHidePreview() {
    if (previewHideTimer) {
      clearTimeout(previewHideTimer);
      previewHideTimer = null;
    }
  }

  async function openExternal(/** @type {string} */ url) {
    try {
      const isTauri =
        typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
      if (isTauri) {
        const { openUrl: open } = await import("@tauri-apps/plugin-opener");
        await open(url);
      } else {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      const { toast } = await import("svelte-sonner");
      toast.error(`Could not open URL: ${String(err)}`);
    }
  }

  function canEditColumn(colIdx) {
    const col = columns[colIdx];
    if (!col || !primaryKey.length) return false;
    return isEditableType(col.dataType ?? col.data_type ?? "");
  }

  const menuColName = $derived(columns[contextColIdx]?.name ?? "cell");
  const menuForeignKey = $derived(
    menuColName ? findForeignKeyForColumn(foreignKeys, menuColName) : null,
  );
  const menuForeignKeyLabel = $derived(
    menuForeignKey ? foreignKeyTargetLabel(menuForeignKey) : "",
  );
  const menuEditable = $derived(canEditColumn(contextColIdx));
  const menuCellNull = $derived(
    rows[contextRowIdx]?.[contextColIdx] === null ||
      rows[contextRowIdx]?.[contextColIdx] === undefined,
  );

  const CELL_DISPLAY_LIMIT = 400

  function formatCell(value) {
    if (value === null || value === undefined) return "NULL";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  /** Truncated version for DOM rendering — keeps long values out of the render tree */
  function displayCell(value) {
    const s = formatCell(value);
    return s.length > CELL_DISPLAY_LIMIT ? s.slice(0, CELL_DISPLAY_LIMIT) + "…" : s;
  }

  function focusRow(rowIdx) {
    if (editingCell) return;
    focusedRow = rowIdx;
  }

  const fkByColumn = $derived(
    Object.fromEntries(columns.map((c) => [c.name, findForeignKeyForColumn(foreignKeys, c.name)])),
  );

  /** @param {number} rowIdx @param {number} colIdx */
  function foreignKeyForCell(rowIdx, colIdx) {
    const col = columns[colIdx];
    if (!col) return null;
    return fkByColumn[col.name] ?? null;
  }

  /**
   * @param {number} rowIdx
   * @param {number} colIdx
   * @param {MouseEvent} [e]
   * @param {{ requireModifier?: boolean }} [opts]
   */
  function tryFollowForeignKey(rowIdx, colIdx, e, opts = {}) {
    if (!foreignKeyForCell(rowIdx, colIdx)) return false;
    const cellValue = rows[rowIdx]?.[colIdx];
    if (cellValue === null || cellValue === undefined) return false;
    if (opts.requireModifier && e && !(e.metaKey || e.ctrlKey || e.altKey))
      return false;
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    onfollowforeignkey({ rowIdx, colIdx });
    return true;
  }

  function openInInspector(rowIdx) {
    focusRow(rowIdx);
    inspectorRow = rowIdx;
  }

  /** @param {() => void} action */
  function runMenuAction(action) {
    if (suppressMenuSelect) return;
    action();
  }

  function armMenuSelectGuard() {
    suppressMenuSelect = true;
    const release = () => {
      window.removeEventListener("pointerdown", release);
      window.removeEventListener("pointercancel", release);
      suppressMenuSelect = false;
    };
    // pointerdown fires before click/pointerup, so the guard is always cleared
    // before onSelect fires. On Linux, contextmenu fires on right-click pointerup,
    // meaning armMenuSelectGuard runs after that pointerup has already passed —
    // listening for pointerup would catch the menu item's own pointerup and the
    // setTimeout(0) would still be pending when onSelect fired, blocking all items.
    window.addEventListener("pointerdown", release);
    window.addEventListener("pointercancel", release);
  }

  /** @param {MouseEvent} e */

  function startEdit(rowIdx, colIdx) {
    const col = columns[colIdx];
    if (!col) return;

    if (!primaryKey.length) {
      toast.error("Cannot edit", {
        description: "This table has no primary key.",
      });
      return;
    }

    const dataType = col.dataType ?? col.data_type ?? "";
    if (!isEditableType(dataType)) {
      toast.error("Cannot edit column", {
        description: `${col.name} (${dataType}) is not editable.`,
      });
      return;
    }

    focusRow(rowIdx);
    const original = valueToEditString(rows[rowIdx]?.[colIdx]);
    editingCell = {
      rowIdx,
      colIdx,
      draft: original,
      original,
    };
  }

  function cancelEdit() {
    if (!editingCell) return;
    editingCell = null;
  }

  async function commitEdit() {
    if (!editingCell || saving) return;

    const { rowIdx, colIdx, draft } = editingCell;
    const col = columns[colIdx];
    if (!col) return;

    if (draft === editingCell.original) {
      editingCell = null;
      return;
    }

    const parsed = parseCellInput(
      draft,
      col.dataType ?? col.data_type ?? "text",
      getColumnEnumValues(col),
    );
    if (!parsed.ok) {
      toast.error("Invalid value", { description: parsed.message });
      return;
    }

    try {
      await onsave({ rowIdx, colIdx, value: parsed.value });
      editingCell = null;
      toast.success("Saved", { description: `${col.name} updated` });
    } catch (err) {
      toast.error("Save failed", { description: String(err) });
    }
  }

  async function copyCellValue(rowIdx, colIdx) {
    const value = rows[rowIdx]?.[colIdx];
    try {
      await navigator.clipboard.writeText(formatNormalValue(value));
      toast.success("Copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  async function copyRowJson(rowIdx) {
    const record = rowToRecord(columns, rows[rowIdx] ?? []);
    try {
      await navigator.clipboard.writeText(formatJsonValue(record));
      toast.success("Copied row as JSON");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  async function setCellNull(rowIdx, colIdx) {
    const col = columns[colIdx];
    if (!col || !canEditColumn(colIdx)) return;
    if (rows[rowIdx]?.[colIdx] === null) {
      toast.message("Already NULL");
      return;
    }
    try {
      await onsave({ rowIdx, colIdx, value: null });
      toast.success("Set to NULL", { description: col.name });
    } catch (err) {
      toast.error("Update failed", { description: String(err) });
    }
  }

  /** @param {number} rowIdx */
  function rowIndicesToDelete(rowIdx) {
    if (selected.size > 0 && selected.has(rowIdx)) {
      return [...selected].sort((a, b) => a - b);
    }
    return [rowIdx];
  }

  /** @param {number} rowIdx */
  async function deleteRow(rowIdx) {
    if (!primaryKey.length) {
      toast.error("Cannot delete", {
        description: "This table has no primary key.",
      });
      return;
    }
    const rowIndices = rowIndicesToDelete(rowIdx);
    try {
      await ondelete({ rowIndices });
      const n = rowIndices.length;
      toast.success(
        n === 1 ? "Row deleted" : `${formatCompactCount(n)} rows deleted`,
      );
    } catch (err) {
      toast.error("Delete failed", { description: String(err) });
    }
  }

  $effect(() => {
    if (!editingCell) return;
    void tick().then(() => {
      const el = editInput;
      if (!el) return;
      el.focus();
      if (el instanceof HTMLInputElement) {
        el.select();
      }
    });
  });

  /** @param {KeyboardEvent} e */
  function handleEditKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      cancelEdit();
      return;
    }
    if (e.key === "Enter" && !(e.shiftKey || e.altKey)) {
      e.preventDefault();
      void commitEdit();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      void commitEdit();
    }
  }

  function toggleAll(checked) {
    selected = checked ? new Set(rows.map((_, i) => i)) : new Set();
    lastSelectAnchor = null;
  }

  function toggleRow(idx) {
    const next = new Set(selected);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    selected = next;
  }

  /** Last row index clicked without Shift — the anchor for range selection. */
  let lastSelectAnchor = $state(/** @type {number | null} */ (null));

  /**
   * @param {number} idx
   * @param {boolean} shiftKey
   */
  function handleRowSelect(idx, shiftKey) {
    if (shiftKey && lastSelectAnchor !== null) {
      const lo = Math.min(lastSelectAnchor, idx);
      const hi = Math.max(lastSelectAnchor, idx);
      const next = new Set(selected);
      for (let i = lo; i <= hi; i++) next.add(i);
      selected = next;
    } else {
      toggleRow(idx);
      lastSelectAnchor = idx;
    }
  }

  /** @param {number} rowIdx */
  function isRowExpanded(rowIdx) {
    return expandedRows.has(rowIdx);
  }

  /** @param {number} rowIdx */
  function toggleRowExpand(rowIdx) {
    const next = new Set(expandedRows);
    if (next.has(rowIdx)) next.delete(rowIdx);
    else next.add(rowIdx);
    expandedRows = next;
  }

  const ROW_EXPAND_COL_WIDTH = 34;
  /** Fits 16px checkbox with equal inset; no extra horizontal padding in cells */
  const ROW_SELECT_COL_WIDTH = 32;
  const visibleColumns = $derived(
    columns.filter((c) => !hiddenColumns.has(c.name)),
  );
  const dataColSpan = $derived(visibleColumns.length);

  const allSelected = $derived(
    rows.length > 0 && selected.size === rows.length,
  );
  const someSelected = $derived(
    selected.size > 0 && selected.size < rows.length,
  );
  const hasPrimaryKey = $derived(primaryKey.length > 0);

  /** @param {number} idx */
  function rowClass(idx) {
    const isFocused = focusedRow === idx;
    const isSelected = selected.has(idx);
    const isExpanded = isRowExpanded(idx);
    return cn(
      "group/row outline-none hover:bg-accent/25",
      isExpanded && "[&>td]:border-b-0",
      isSelected && "bg-accent/20",
      isFocused && !isSelected && "bg-accent/15",
      isFocused && isSelected && "ring-1 ring-ring/60 ring-inset",
    );
  }

  /** @param {string} name @param {string} dataType */
  function widthForColumn(name, dataType) {
    return columnWidths[name] ?? defaultColumnWidth(dataType);
  }

  $effect(() => {
    const key = columnWidthsKey;
    const cols = columns;
    const stored = key ? loadColumnWidths(key) : {};
    /** @type {Record<string, number>} */
    const next = {};
    for (const col of cols) {
      const dt = col.dataType ?? col.data_type ?? "";
      next[col.name] = clampColumnWidth(
        stored[col.name] ?? defaultColumnWidth(dt),
      );
    }
    columnWidths = next;
  });

  /** @param {string} colName */
  function startColumnResize(colName) {
    resizingColName = colName;
    resizeStartWidth = columnWidths[colName] ?? defaultColumnWidth("");
  }

  // Batch column resize updates to animation frames — pointermove can fire at
  // 120Hz+, but we only need to update the DOM at 60fps.
  let _resizeRafId = 0;
  let _pendingResizeWidth = 0;

  /** @param {number} dx */
  function applyColumnResize(dx) {
    if (!resizingColName) return;
    _pendingResizeWidth = clampColumnWidth(resizeStartWidth + dx);
    if (_resizeRafId) return;
    _resizeRafId = requestAnimationFrame(() => {
      _resizeRafId = 0;
      if (!resizingColName) return;
      columnWidths = { ...columnWidths, [resizingColName]: _pendingResizeWidth };
    });
  }

  function endColumnResize() {
    if (_resizeRafId) {
      cancelAnimationFrame(_resizeRafId);
      _resizeRafId = 0;
      // Commit the last pending width synchronously
      if (resizingColName) {
        columnWidths = { ...columnWidths, [resizingColName]: _pendingResizeWidth };
      }
    }
    if (resizingColName && columnWidthsKey) {
      saveColumnWidths(columnWidthsKey, columnWidths);
    }
    resizingColName = null;
  }
</script>

{#if loading}
  <TableLoading {embedded} />
{:else}
  <ContextMenu.Root
    onOpenChange={(open) => {
      contextMenuOpen = open;
      if (open) {
        armMenuSelectGuard();
      } else {
        pendingContextMenu = false;
        suppressMenuSelect = false;
      }
    }}
  >
    <ContextMenu.Trigger disabled={rows.length === 0}>
      {#snippet child({ props })}
        {@const bitsContextMenu = props.oncontextmenu}
        <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
        <div
          {...props}
          tabindex={-1}
          class={cn(
            "app-scroll relative overflow-auto bg-panel select-none [scrollbar-gutter:stable] [contain:layout] [will-change:scroll-position]",
            embedded ? "max-h-80" : "min-h-0 flex-1",
            resizingColName && "cursor-col-resize",
          )}
          oncontextmenu={(e) => {
            const target = e.target;
            if (!(target instanceof Element)) {
              e.preventDefault();
              return;
            }
            const rowEl = target.closest("[data-row-idx]");
            if (!rowEl) {
              e.preventDefault();
              return;
            }
            const rowIdx = Number(rowEl.getAttribute("data-row-idx"));
            if (!Number.isFinite(rowIdx)) {
              e.preventDefault();
              return;
            }
            // Capture which row/col was right-clicked
            pendingContextMenu = true;
            contextRowIdx = rowIdx;
            const cellEl = target.closest("td[data-col-idx]");
            contextColIdx = cellEl
              ? Number(cellEl.getAttribute("data-col-idx")) || 0
              : 0;
            // Hand off to bits-ui to open the menu
            bitsContextMenu?.(e);
          }}
          onkeydown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "a") e.preventDefault();
          }}
        >
          <table
            class="studio-data-table w-max min-w-full table-fixed text-ui-sm"
          >
            <colgroup>
              {#if showRowExpand}
                <col style="width: {ROW_EXPAND_COL_WIDTH}px" />
              {/if}
              {#if showSelection}
                <col style="width: {ROW_SELECT_COL_WIDTH}px" />
              {/if}
              {#each visibleColumns as col (col.name)}
                <col
                  style="width: {widthForColumn(
                    col.name,
                    col.dataType ?? col.data_type ?? '',
                  )}px"
                />
              {/each}
            </colgroup>
            <thead class="studio-chrome sticky top-0 z-10 bg-panel">
              <tr>
                {#if showRowExpand}
                  <th
                    class="studio-table-gutter"
                    style="width: {ROW_EXPAND_COL_WIDTH}px; min-width: {ROW_EXPAND_COL_WIDTH}px; max-width: {ROW_EXPAND_COL_WIDTH}px"
                    aria-label="Expand row"
                  ></th>
                {/if}
                {#if showSelection}
                  <th
                    class="studio-table-gutter font-normal"
                    style="width: {ROW_SELECT_COL_WIDTH}px; min-width: {ROW_SELECT_COL_WIDTH}px; max-width: {ROW_SELECT_COL_WIDTH}px"
                  >
                    <div class="studio-table-gutter-inner">
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected}
                        onCheckedChange={(v) => toggleAll(v === true)}
                      />
                    </div>
                  </th>
                {/if}
                {#each visibleColumns as col (col.name)}
                  {@const colW = widthForColumn(
                    col.name,
                    col.dataType ?? col.data_type ?? "",
                  )}
                  <th
                    class={cn(
                      "group/th relative overflow-hidden px-3 py-1 text-left font-normal",
                      resizingColName === col.name && "bg-accent/30",
                    )}
                    style="width: {colW}px; min-width: {colW}px; max-width: {colW}px"
                  >
                    <div class="flex min-w-0 items-center gap-1.5">
                      <div class="flex min-w-0 flex-1 flex-col gap-px leading-tight">
                        <span
                          class="block truncate font-mono text-ui-sm text-foreground"
                          data-font="mono"
                          title={col.name}>{col.name}</span
                        >
                        <span
                          class="block truncate font-mono text-ui-2xs text-muted-foreground"
                          data-font="mono"
                          title={col.dataType ?? col.data_type}
                          >{col.dataType ?? col.data_type}</span
                        >
                      </div>
                      <ArrowUpDown class="size-3 shrink-0 opacity-30" />
                    </div>
                    <ColumnResizeHandle
                      onresizestart={() => startColumnResize(col.name)}
                      onresize={applyColumnResize}
                      onresizeend={endColumnResize}
                    />
                  </th>
                {/each}
              </tr>
            </thead>
            {#if rows.length > 0}
              <tbody>
                {#each rows as row, idx}
                  <tr
                    data-row-idx={idx}
                    class={rowClass(idx)}
                    onclick={(e) => {
                      if (e.button !== 0) return;
                      if (editingCell) cancelEdit();
                      focusRow(idx);
                    }}
                    onauxclick={(e) => {
                      if (e.button !== 1) return;
                      const cellEl =
                        e.target instanceof Element
                          ? e.target.closest("td[data-col-idx]")
                          : null;
                      if (!cellEl) return;
                      const colIdx =
                        Number(cellEl.getAttribute("data-col-idx")) || 0;
                      if (tryFollowForeignKey(idx, colIdx, e)) return;
                    }}
                  >
                    {#if showRowExpand}
                      <td
                        class="studio-table-gutter studio-table-expand-gutter"
                        style="width: {ROW_EXPAND_COL_WIDTH}px; min-width: {ROW_EXPAND_COL_WIDTH}px; max-width: {ROW_EXPAND_COL_WIDTH}px"
                        aria-expanded={isRowExpanded(idx)}
                        aria-label={isRowExpanded(idx)
                          ? "Collapse row JSON"
                          : "Expand row JSON"}
                        title={isRowExpanded(idx)
                          ? "Collapse row"
                          : "Expand row as JSON"}
                        onclick={(e) => {
                          e.stopPropagation()
                          toggleRowExpand(idx)
                        }}
                      >
                        <div class="studio-table-gutter-inner">
                          <span
                            class={cn(
                              "studio-row-expand-icon inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                              isRowExpanded(idx)
                                ? "opacity-100"
                                : "opacity-0 group-hover/row:opacity-100",
                            )}
                            aria-hidden="true"
                          >
                            {#if isRowExpanded(idx)}
                              <ChevronDown class="size-3.5" />
                            {:else}
                              <ChevronRight class="size-3.5" />
                            {/if}
                          </span>
                        </div>
                      </td>
                    {/if}
                    {#if showSelection}
                      <td
                        class="studio-table-gutter"
                        style="width: {ROW_SELECT_COL_WIDTH}px; min-width: {ROW_SELECT_COL_WIDTH}px; max-width: {ROW_SELECT_COL_WIDTH}px"
                        onclick={(e) => {
                          e.stopPropagation()
                          handleRowSelect(idx, e.shiftKey)
                        }}
                      >
                        <div class="studio-table-gutter-inner">
                          <Checkbox
                            tabindex={-1}
                            checked={selected.has(idx)}
                            onCheckedChange={() => {}}
                          />
                        </div>
                      </td>
                    {/if}
                    {#each row as cell, colIdx}
                      {#if hiddenColumns.has(columns[colIdx]?.name)}<!-- skip hidden -->
                      {:else}
                        {@const isEditing =
                          editingCell?.rowIdx === idx &&
                          editingCell?.colIdx === colIdx}
                        {@const col = columns[colIdx]}
                        {@const colType = col?.dataType ?? col?.data_type ?? ""}
                        {@const enumValues = getColumnEnumValues(col)}
                        {@const cellFk = foreignKeyForCell(idx, colIdx)}
                        {@const cellIsNull = row[colIdx] === null || row[colIdx] === undefined}
                        {@const activeFk = cellFk && !cellIsNull}
                        <td
                          data-col-idx={colIdx}
                          class={cn(
                            "overflow-hidden font-mono",
                            isEditing
                              ? "relative p-0 align-middle ring-2 ring-inset ring-primary bg-background"
                              : "whitespace-nowrap px-3 py-0.5 text-muted-foreground",
                            activeFk &&
                              !isEditing &&
                              "group/fk cursor-pointer bg-accent/15 transition-colors hover:bg-accent/30",
                          )}
                          style={isEditing ? "border: 0" : undefined}
                          data-font="mono"
                          onclick={(e) => {
                            if (
                              tryFollowForeignKey(idx, colIdx, e, {
                                requireModifier: true,
                              })
                            )
                              return;
                          }}
                          ondblclick={(e) => {
                            e.preventDefault();
                            if (activeFk) {
                              tryFollowForeignKey(idx, colIdx, e);
                              return;
                            }
                            startEdit(idx, colIdx);
                          }}
                          onkeydown={(e) => {
                            if (isEditing) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              startEdit(idx, colIdx);
                            }
                          }}
                        >
                          {#if isEditing && editingCell}
                            {@const isNullable = col?.nullable ?? true}
                            {#if enumValues}
                              <select
                                bind:this={editInput}
                                bind:value={editingCell.draft}
                                disabled={saving}
                                aria-label="Edit {col?.name ?? 'cell'}"
                                class="box-border block h-7 w-full min-w-0 max-w-full cursor-pointer appearance-none border-0 bg-transparent px-3 py-1 font-mono text-ui-sm text-foreground outline-none"
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={handleEditKeydown}
                                onchange={() => void commitEdit()}
                              >
                                {#if isNullable}
                                  <option value="">NULL</option>
                                {/if}
                                {#if editingCell.original && !enumValues.includes(editingCell.original)}
                                  <option value={editingCell.original}
                                    >{editingCell.original}</option
                                  >
                                {/if}
                                {#each enumValues as option (option)}
                                  <option value={option}>{option}</option>
                                {/each}
                              </select>
                            {:else if isBooleanType(colType)}
                              {@const isOn = editingCell.draft === "true"}
                              {@const isNull =
                                isNullable &&
                                editingCell.draft !== "true" &&
                                editingCell.draft !== "false"}
                              <button
                                type="button"
                                bind:this={editInput}
                                disabled={saving}
                                aria-label="Toggle {col?.name ?? 'cell'}"
                                class="flex h-7 w-full items-center gap-2.5 px-3 font-mono text-ui-sm text-foreground outline-none"
                                onclick={async (e) => {
                                  e.stopPropagation();
                                  editingCell.draft =
                                    editingCell.draft === "true"
                                      ? "false"
                                      : "true";
                                  await commitEdit();
                                }}
                                onkeydown={handleEditKeydown}
                              >
                                <span
                                  class={cn(
                                    "relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors duration-150",
                                    isOn
                                      ? "bg-primary/80"
                                      : "bg-muted-foreground/30",
                                  )}
                                >
                                  <span
                                    class="absolute size-3 rounded-full bg-white shadow-sm transition-transform duration-150"
                                    style={isOn
                                      ? "transform: translateX(14px)"
                                      : "transform: translateX(2px)"}
                                  ></span>
                                </span>
                                <span
                                  class={isNull ? "text-muted-foreground" : ""}
                                  >{isNull
                                    ? "NULL"
                                    : editingCell.draft === "true"
                                      ? "true"
                                      : "false"}</span
                                >
                              </button>
                            {:else}
                              <input
                                bind:this={editInput}
                                bind:value={editingCell.draft}
                                disabled={saving}
                                aria-label="Edit {col?.name ?? 'cell'}"
                                class="box-border block h-7 w-full min-w-0 max-w-full overflow-x-auto border-0 bg-transparent px-3 py-1 font-mono text-ui-sm text-foreground outline-none [field-sizing:fixed] selection:bg-primary/20"
                                onclick={(e) => e.stopPropagation()}
                                onkeydown={handleEditKeydown}
                              />
                            {/if}
                          {:else}
                            {@const cellText = formatCell(cell)}
                            {@const cellDisplay = displayCell(cell)}
                            {@const cellHref = !activeFk
                              ? cellLinkHref(cellText)
                              : null}
                            {@const urlType = cellUrlType(cellHref)}
                            <span
                              class={cn(
                                "flex items-center gap-1.5 truncate",
                                activeFk && "text-foreground",
                              )}
                              title={activeFk
                                ? `${cellText} — Ctrl/⌘-click or double-click to open ${foreignKeyTargetLabel(cellFk)}`
                                : cellText}
                            >
                              {#if cellHref}
                                <a
                                  href={cellHref}
                                  data-cell-url
                                  tabindex={-1}
                                  class={cn(
                                    "truncate",
                                    urlType === "image" && "cursor-zoom-in",
                                  )}
                                  onclick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                                      void openExternal(cellHref);
                                    } else if (
                                      urlType === "image" ||
                                      urlType === "pdf"
                                    ) {
                                      lightboxUrl = cellHref;
                                      lightboxType =
                                        /** @type {'image'|'pdf'} */ (urlType);
                                    } else {
                                      void openExternal(cellHref);
                                    }
                                  }}
                                  onmouseenter={(e) => {
                                    if (urlType)
                                      showUrlPreview(
                                        cellHref,
                                        urlType,
                                        e.currentTarget.getBoundingClientRect(),
                                      );
                                  }}
                                  onmouseleave={scheduleHidePreview}
                                >
                                  {cellDisplay}
                                </a>
                              {:else}
                                <span class="truncate">{cellDisplay}</span>
                              {/if}
                              {#if activeFk}
                                <ExternalLink
                                  class="size-3 shrink-0 text-ring/80 transition-colors group-hover/fk:text-foreground"
                                  aria-hidden="true"
                                />
                              {/if}
                            </span>
                          {/if}
                        </td>
                      {/if}
                    {/each}
                  </tr>
                  {#if showRowExpand && isRowExpanded(idx)}
                    <tr class="bg-muted/15">
                      <td
                        class="studio-table-gutter"
                        style="width: {ROW_EXPAND_COL_WIDTH}px; min-width: {ROW_EXPAND_COL_WIDTH}px; max-width: {ROW_EXPAND_COL_WIDTH}px"
                        aria-hidden="true"
                      ></td>
                      {#if showSelection}
                        <td
                          class="studio-table-gutter"
                          style="width: {ROW_SELECT_COL_WIDTH}px; min-width: {ROW_SELECT_COL_WIDTH}px; max-width: {ROW_SELECT_COL_WIDTH}px"
                          aria-hidden="true"
                        ></td>
                      {/if}
                      <td colspan={dataColSpan} class="p-0 align-top">
                        <div class="px-2 py-2 sm:px-3">
                          <MiniJsonViewer
                            class="max-w-none"
                            value={rowToRecord(columns, row)}
                            maxHeight={embedded
                              ? "min(40vh, 12rem)"
                              : "min(50vh, 20rem)"}
                          />
                        </div>
                      </td>
                    </tr>
                  {/if}
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
                <p class="text-ui-sm text-muted-foreground">
                  No rows in this table
                </p>
              </div>
            </div>
          {/if}
        </div>
      {/snippet}
    </ContextMenu.Trigger>

    <ContextMenu.Content
      onOpenAutoFocus={(e) => e.preventDefault()}
      class={cn(
        "w-max min-w-32 p-0.5 text-ui-xs",
        "[&_[data-slot=context-menu-item]]:gap-1.5 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1 [&_[data-slot=context-menu-item]]:text-ui-xs",
        "[&_[data-slot=context-menu-shortcut]]:text-ui-2xs",
        "[&_[data-slot=context-menu-item]_svg]:size-3.5",
      )}
    >
      <ContextMenu.Item
        onSelect={() => runMenuAction(() => openInInspector(contextRowIdx))}
      >
        <PanelRight />
        Open
      </ContextMenu.Item>
      {#if menuForeignKey && !menuCellNull}
        <ContextMenu.Item
          onSelect={() =>
            runMenuAction(() =>
              onfollowforeignkey({
                rowIdx: contextRowIdx,
                colIdx: contextColIdx,
              }),
            )}
        >
          <ExternalLink />
          Open {menuForeignKeyLabel}
          <ContextMenu.Shortcut>⌘↵</ContextMenu.Shortcut>
        </ContextMenu.Item>
      {/if}
      <ContextMenu.Separator />
      <ContextMenu.Item
        disabled={!menuEditable}
        onSelect={() =>
          runMenuAction(() => startEdit(contextRowIdx, contextColIdx))}
      >
        <Pencil />
        Edit
        <ContextMenu.Shortcut>Enter</ContextMenu.Shortcut>
      </ContextMenu.Item>
      <ContextMenu.Item
        onSelect={() =>
          runMenuAction(() => copyCellValue(contextRowIdx, contextColIdx))}
      >
        <Copy />
        Copy
        <ContextMenu.Shortcut>⌘C</ContextMenu.Shortcut>
      </ContextMenu.Item>
      <ContextMenu.Item
        disabled={!menuEditable || menuCellNull}
        onSelect={() =>
          runMenuAction(() => setCellNull(contextRowIdx, contextColIdx))}
      >
        <CircleSlash />
        Set NULL
      </ContextMenu.Item>
      {#if showRowExpand}
        <ContextMenu.Item
          onSelect={() => runMenuAction(() => toggleRowExpand(contextRowIdx))}
        >
          <Braces />
          {isRowExpanded(contextRowIdx)
            ? "Collapse row JSON"
            : "Expand"}
        </ContextMenu.Item>
      {/if}
      <ContextMenu.Separator />
      <ContextMenu.Item
        onSelect={() => runMenuAction(() => copyRowJson(contextRowIdx))}
      >
        <Braces />
        Copy row JSON
      </ContextMenu.Item>
      <ContextMenu.Item
        onSelect={() => runMenuAction(() => toggleRow(contextRowIdx))}
      >
        <CheckSquare />
        {selected.has(contextRowIdx) ? "Deselect row" : "Select row"}
      </ContextMenu.Item>
      <ContextMenu.Separator />
      <ContextMenu.Item
        variant="destructive"
        disabled={!hasPrimaryKey || saving}
        onSelect={() => runMenuAction(() => deleteRow(contextRowIdx))}
      >
        <Trash2 />
        {selected.size > 1 && selected.has(contextRowIdx)
          ? `Delete ${formatCompactCount(selected.size)} rows`
          : "Delete row"}
        <ContextMenu.Shortcut>⌘⌫</ContextMenu.Shortcut>
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Root>
{/if}

{#if previewUrl && previewType && previewAnchorRect}
  <UrlPreviewTooltip
    url={previewUrl}
    type={previewType}
    anchorRect={previewAnchorRect}
    onmouseenter={cancelHidePreview}
    onmouseleave={scheduleHidePreview}
    onopen={() => void openExternal(previewUrl)}
    onexpand={() => {
      if (previewType === "image" || previewType === "pdf") {
        lightboxUrl = previewUrl;
        lightboxType = /** @type {'image'|'pdf'} */ (previewType);
        previewUrl = null;
      }
    }}
  />
{/if}

<MediaLightbox
  url={lightboxUrl}
  type={lightboxType}
  onclose={() => {
    lightboxUrl = null;
  }}
/>
