<script>
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import ChevronLeft from '@lucide/svelte/icons/chevron-left'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import History from '@lucide/svelte/icons/history'
  import ListFilter from '@lucide/svelte/icons/list-filter'
  import ArrowUpDown from '@lucide/svelte/icons/arrow-up-down'
  import ArrowUp from '@lucide/svelte/icons/arrow-up'
  import ArrowDown from '@lucide/svelte/icons/arrow-down'
  import Plus from '@lucide/svelte/icons/plus'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import MoreHorizontal from '@lucide/svelte/icons/more-horizontal'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Search from '@lucide/svelte/icons/search'
  import X from '@lucide/svelte/icons/x'
  import * as DropdownMenu from '$lib/components/ui/dropdown-menu/index.js'
  import * as Select from '$lib/components/ui/select/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { cn } from '$lib/utils.js'
  import {
    FILTER_OPS,
    PAGE_SIZE_OPTIONS,
    activeFilters,
    createFilter,
  } from '$lib/table-query.js'

  /** @typedef {import('$lib/table-query.js').TableSort} TableSort */
  /** @typedef {import('$lib/table-query.js').TableFilter} TableFilter */
  /** @typedef {import('$lib/table-query.js').FilterOp} FilterOp */

  let {
    sidebarOpen = true,
    queryMs = 0,
    page = 1,
    pageSize = 50,
    total = 0,
    loading = false,
    selectedCount = 0,
    hasPrimaryKey = false,
    deleting = false,
    columns = [],
    rowSearch = '',
    rowSort = null,
    rowFilters = [],
    ontogglesidebar = () => {},
    onrefresh = () => {},
    onprev = () => {},
    onnext = () => {},
    onpagechange = () => {},
    onpagesizechange = () => {},
    onsearchchange = () => {},
    onsortchange = () => {},
    onfilterschange = () => {},
    ondeleteselected = () => {},
  } = $props()

  const deleteLabel = $derived(
    selectedCount === 1 ? 'Delete 1 row' : `Delete ${selectedCount} rows`,
  )

  const from = $derived(total === 0 ? 0 : (page - 1) * pageSize + 1)
  const to = $derived(Math.min(page * pageSize, total))
  const pageCount = $derived(Math.max(1, Math.ceil(total / pageSize) || 1))
  const canPrev = $derived(page > 1)
  const canNext = $derived(page * pageSize < total)

  const filterCount = $derived(activeFilters(rowFilters).length)
  const sortLabel = $derived(
    rowSort?.column
      ? `${rowSort.column} ${rowSort.direction === 'desc' ? '↓' : '↑'}`
      : 'Sort',
  )

  let filterMenuOpen = $state(false)
  let sortMenuOpen = $state(false)
  /** @type {HTMLInputElement | null} */
  let searchInputRef = $state(null)

  export function focusRowSearch() {
    searchInputRef?.focus()
    searchInputRef?.select()
  }

  /** Page numbers shown in the page dropdown (windowed when many pages). */
  const pageMenuItems = $derived.by(() => {
    const n = pageCount
    if (n <= 40) return Array.from({ length: n }, (_, i) => i + 1)
    const lo = Math.max(1, page - 15)
    const hi = Math.min(n, page + 15)
    return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i)
  })

  const iconBtn =
    'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30'

  /** Matches the “more actions” / delete menu panel */
  const menuContent = 'w-44 text-ui-sm'

  /** Compact shadcn select trigger for pagination */
  const pageSelectTrigger =
    'h-7 min-w-0 gap-1 px-2 text-ui-sm font-normal tabular-nums shadow-none'

  const filterSelectTrigger =
    'h-7 min-w-0 flex-1 gap-1 px-2 text-ui-sm font-normal shadow-none'

  const filterOpTrigger = 'h-7 w-[7.5rem] shrink-0 gap-1 px-2 text-ui-sm font-normal shadow-none'

  /** @param {FilterOp} op */
  function filterOpLabel(op) {
    return FILTER_OPS.find((o) => o.value === op)?.label ?? op
  }

  /** @param {string} id */
  function filterNeedsValue(id) {
    const f = rowFilters.find((x) => x.id === id)
    if (!f) return true
    return FILTER_OPS.find((o) => o.value === f.op)?.needsValue ?? true
  }

  /** @param {string} value */
  function handleSearchInput(value) {
    onsearchchange(value)
  }

  function clearSearch() {
    onsearchchange('')
  }

  function addFilter() {
    const col = columns[0]?.name ?? ''
    onfilterschange([...rowFilters, createFilter(col)])
    filterMenuOpen = true
  }

  /** @param {string} id */
  function removeFilter(id) {
    onfilterschange(rowFilters.filter((f) => f.id !== id))
  }

  function clearFilters() {
    onfilterschange([])
  }

  /** @param {TableFilter[]} next */
  function updateFilters(next) {
    onfilterschange(next)
  }

  /** @param {string} id @param {Partial<TableFilter>} patch */
  function patchFilter(id, patch) {
    updateFilters(rowFilters.map((f) => (f.id === id ? { ...f, ...patch } : f)))
  }

  function clearSort() {
    onsortchange(null)
  }

  /** @param {string} column @param {'asc' | 'desc'} direction */
  function applySort(column, direction) {
    onsortchange(/** @type {TableSort} */ ({ column, direction }))
    sortMenuOpen = false
  }

</script>

<header
  class="flex h-9 shrink-0 items-center justify-between gap-2 border-b border-border bg-panel px-3"
>
  <!-- Left -->
  <div class="flex shrink-0 items-center gap-0.5">
    <button
      type="button"
      class={cn(iconBtn, !sidebarOpen && 'bg-accent text-foreground')}
      title="Toggle sidebar (⌘B)"
      aria-pressed={sidebarOpen}
      onclick={ontogglesidebar}
    >
      <PanelLeft class="size-3.5" />
    </button>
    <span class="mx-0.5 h-4 w-px bg-border"></span>
    <button type="button" class={iconBtn} disabled title="History (soon)">
      <History class="size-3.5" />
    </button>
  </div>

  <!-- Center: search + filter + sort -->
  <div class="flex min-w-0 flex-1 items-center justify-center gap-1">
    <div class="relative flex h-7 min-w-0 max-w-sm flex-1 items-center">
      <Search class="pointer-events-none absolute left-2 size-3.5 text-muted-foreground" />
      <Input
        bind:ref={searchInputRef}
        type="text"
        role="searchbox"
        aria-label="Search all columns"
        class={cn(
          'h-7 w-full min-w-[9rem] border-input bg-input/30 pl-7 pr-7 text-ui-sm shadow-none focus-visible:ring-2',
          rowSearch.trim() && 'border-ring/40',
        )}
        placeholder="Search all columns…"
        value={rowSearch}
        disabled={loading || columns.length === 0}
        oninput={(e) => handleSearchInput(e.currentTarget.value)}
      />
      <button
        type="button"
        class={cn(
          'absolute right-1 inline-flex size-5 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground',
          rowSearch ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        aria-label="Clear search"
        tabindex={rowSearch ? 0 : -1}
        onclick={clearSearch}
      >
        <X class="size-3" />
      </button>
    </div>

    <DropdownMenu.Root bind:open={filterMenuOpen}>
      <DropdownMenu.Trigger
        class={cn(
          iconBtn,
          'relative',
          (filterCount > 0 || filterMenuOpen) && 'bg-accent text-foreground',
        )}
        title="Filter rows"
        disabled={loading || columns.length === 0}
      >
        <ListFilter class="size-3.5" />
        {#if filterCount > 0}
          <span
            class="absolute -top-0.5 -right-0.5 flex size-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-ui-3xs font-medium text-primary-foreground"
            aria-hidden="true"
          >
            {filterCount}
          </span>
        {/if}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content
        align="center"
        class="w-[min(22rem,calc(100vw-1.5rem))] p-0 text-ui-sm"
        onInteractOutside={(e) => {
          const t = /** @type {HTMLElement | null} */ (e.target)
          if (t?.closest('[data-slot="select-content"]')) e.preventDefault()
        }}
      >
        <div class="border-b border-border px-3 py-2.5">
          <p class="font-medium text-foreground">Filters</p>
          <p class="mt-0.5 text-ui-xs leading-snug text-muted-foreground">
            Rules apply once a column, condition, and value (if needed) are set.
          </p>
        </div>

        {#if columns.length === 0}
          <p class="px-3 py-4 text-ui-xs text-muted-foreground">Open a table to filter rows.</p>
        {:else}
          <div class="max-h-72 overflow-y-auto p-2">
            {#if rowFilters.length === 0}
              <p class="px-2 py-6 text-center text-ui-xs text-muted-foreground">
                No filters yet. Add a rule to narrow results.
              </p>
            {:else}
              <ul class="flex flex-col gap-2">
                {#each rowFilters as filter (filter.id)}
                  <li
                    class="flex items-start gap-1.5 rounded-lg border border-border/70 bg-muted/15 p-2"
                  >
                    <div class="flex min-w-0 flex-1 flex-col gap-1.5">
                      <div class="flex min-w-0 items-center gap-1.5">
                        <Select.Root
                          type="single"
                          value={filter.column}
                          onValueChange={(v) => {
                            if (v) patchFilter(filter.id, { column: v })
                          }}
                        >
                          <Select.Trigger
                            size="sm"
                            class={filterSelectTrigger}
                            title="Column"
                          >
                            <span class="truncate">{filter.column || 'Column'}</span>
                          </Select.Trigger>
                          <Select.Content class="max-h-56">
                            {#each columns as col (col.name)}
                              <Select.Item value={col.name} label={col.name} />
                            {/each}
                          </Select.Content>
                        </Select.Root>

                        <Select.Root
                          type="single"
                          value={filter.op}
                          onValueChange={(v) => {
                            if (v) patchFilter(filter.id, { op: /** @type {FilterOp} */ (v) })
                          }}
                        >
                          <Select.Trigger size="sm" class={filterOpTrigger} title="Condition">
                            <span class="truncate">{filterOpLabel(filter.op)}</span>
                          </Select.Trigger>
                          <Select.Content class="max-h-56">
                            {#each FILTER_OPS as op (op.value)}
                              <Select.Item value={op.value} label={op.label} />
                            {/each}
                          </Select.Content>
                        </Select.Root>
                      </div>

                      {#if filterNeedsValue(filter.id)}
                        <Input
                          class="h-7 border-input bg-input/30 text-ui-sm shadow-none"
                          value={filter.value}
                          placeholder="Value…"
                          oninput={(e) =>
                            patchFilter(filter.id, { value: e.currentTarget.value })}
                        />
                      {/if}
                    </div>

                    <button
                      type="button"
                      class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                      aria-label="Remove filter"
                      onclick={() => removeFilter(filter.id)}
                    >
                      <X class="size-3.5" />
                    </button>
                  </li>
                {/each}
              </ul>
            {/if}
          </div>

          <div
            class="flex items-center justify-between gap-2 border-t border-border px-2 py-2"
          >
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-ui-sm text-foreground hover:bg-accent"
              onclick={addFilter}
            >
              <Plus class="size-3.5" />
              Add filter
            </button>
            {#if rowFilters.length > 0}
              <button
                type="button"
                class="inline-flex h-7 items-center gap-1 rounded-md px-2 text-ui-sm text-muted-foreground hover:bg-accent hover:text-foreground"
                onclick={clearFilters}
              >
                Clear all
              </button>
            {/if}
          </div>
        {/if}
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <DropdownMenu.Root bind:open={sortMenuOpen}>
      <DropdownMenu.Trigger
        class={cn(
          iconBtn,
          (rowSort?.column || sortMenuOpen) && 'bg-accent text-foreground',
        )}
        title={sortLabel}
        disabled={loading || columns.length === 0}
      >
        <ArrowUpDown class="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="center" class={cn(menuContent, 'max-h-64 overflow-y-auto')}>
        <DropdownMenu.Label>Sort by</DropdownMenu.Label>
        {#if rowSort?.column}
          <DropdownMenu.Item onSelect={clearSort}>
            <X class="size-3.5" />
            Clear sort
          </DropdownMenu.Item>
          <DropdownMenu.Separator />
        {/if}
        {#each columns as col (col.name)}
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger>
              <span class="truncate">{col.name}</span>
              {#if rowSort?.column === col.name}
                <span class="ml-auto text-muted-foreground">
                  {rowSort.direction === 'desc' ? '↓' : '↑'}
                </span>
              {/if}
            </DropdownMenu.SubTrigger>
            <DropdownMenu.SubContent class={menuContent}>
              <DropdownMenu.Item onSelect={() => applySort(col.name, 'asc')}>
                <ArrowUp class="size-3.5" />
                Ascending
              </DropdownMenu.Item>
              <DropdownMenu.Item onSelect={() => applySort(col.name, 'desc')}>
                <ArrowDown class="size-3.5" />
                Descending
              </DropdownMenu.Item>
            </DropdownMenu.SubContent>
          </DropdownMenu.Sub>
        {/each}
      </DropdownMenu.Content>
    </DropdownMenu.Root>

    <button
      type="button"
      class="ml-0.5 inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-ui-sm font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
      disabled
      title="Add record (soon)"
    >
      <Plus class="size-3.5" />
      <span class="hidden sm:inline">Add record</span>
    </button>
  </div>

  <!-- Right: perf + pagination -->
  <div class="flex shrink-0 items-center gap-1">
    <span
      class="hidden font-mono text-ui-xs text-muted-foreground tabular-nums lg:inline"
      data-font="mono">{queryMs}ms</span
    >
    <span class="hidden text-ui-sm text-muted-foreground tabular-nums sm:inline">
      {from}–{to} of {total}
    </span>

    <span class="mx-0.5 hidden h-4 w-px bg-border sm:inline"></span>

    <Select.Root
      type="single"
      value={String(pageSize)}
      onValueChange={(v) => {
        if (v) onpagesizechange(Number(v))
      }}
      disabled={loading}
    >
      <Select.Trigger
        size="sm"
        class={pageSelectTrigger}
        title="Rows per page"
        aria-label="Rows per page"
      >
        {pageSize}
      </Select.Trigger>
      <Select.Content align="end" class="min-w-0">
        {#each PAGE_SIZE_OPTIONS as size (size)}
          <Select.Item value={String(size)} label={String(size)} />
        {/each}
      </Select.Content>
    </Select.Root>

    <Select.Root
      type="single"
      value={String(page)}
      onValueChange={(v) => {
        if (v) onpagechange(Number(v))
      }}
      disabled={loading || total === 0}
    >
      <Select.Trigger
        size="sm"
        class={pageSelectTrigger}
        title="Go to page"
        aria-label="Go to page"
      >
        {page}
      </Select.Trigger>
      <Select.Content align="end" class="max-h-56">
        {#each pageMenuItems as p (p)}
          <Select.Item value={String(p)} label={String(p)} />
        {/each}
      </Select.Content>
    </Select.Root>

    <span class="text-ui-xs text-muted-foreground tabular-nums">of {pageCount}</span>

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
      title="Refresh data (⌘R)"
      aria-label="Refresh data"
    >
      <RefreshCw class={cn('size-3.5', loading && 'animate-spin')} />
    </button>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        class={cn(iconBtn, selectedCount > 0 && 'text-foreground')}
        title="More actions"
        disabled={loading || deleting}
      >
        <MoreHorizontal class="size-3.5" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="end" class={menuContent}>
        <DropdownMenu.Item
          variant="destructive"
          disabled={selectedCount === 0 || !hasPrimaryKey || deleting}
          onSelect={ondeleteselected}
        >
          <Trash2 />
          {deleteLabel}
          <DropdownMenu.Shortcut>⌘⌫</DropdownMenu.Shortcut>
        </DropdownMenu.Item>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  </div>
</header>
