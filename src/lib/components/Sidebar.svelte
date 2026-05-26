<script>
  import { onMount, untrack } from "svelte";
  import { getCurrentWindow } from "@tauri-apps/api/window";
  import Search from "@lucide/svelte/icons/search";
  import Table2 from "@lucide/svelte/icons/table-2";
  import Eye from "@lucide/svelte/icons/eye";
  import Layers from "@lucide/svelte/icons/layers";
  import ChevronDown from "@lucide/svelte/icons/chevron-down";
  import Terminal from "@lucide/svelte/icons/terminal";
  import Command from "@lucide/svelte/icons/command";
  import ListFilter from "@lucide/svelte/icons/list-filter";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Plus from "@lucide/svelte/icons/plus";
  import Settings from "@lucide/svelte/icons/settings";
  import Unplug from "@lucide/svelte/icons/unplug";
  import LayoutTemplate from "@lucide/svelte/icons/layout-template";
  import Code2 from "@lucide/svelte/icons/code-2";
  import Bot from "@lucide/svelte/icons/bot";
  import History from "@lucide/svelte/icons/history";
  import ShieldCheck from "@lucide/svelte/icons/shield-check";
  import DatabaseSwitcher from "./DatabaseSwitcher.svelte";
  import CheckCircle from "@lucide/svelte/icons/check-circle";
  import XCircle from "@lucide/svelte/icons/x-circle";
  import { ScrollArea } from "$lib/components/ui/scroll-area/index.js";
  import * as Select from "$lib/components/ui/select/index.js";
  import * as Tabs from "$lib/components/ui/tabs/index.js";
  import ResizeHandle from "./ResizeHandle.svelte";
  import { cn } from "$lib/utils.js";
  import { formatTableRowCount } from "$lib/table-list.js";
  import {
    clampNavSidebarWidth,
    loadLayout,
    saveLayout,
  } from "$lib/stores/layout.js";

  const initialLayout = loadLayout();
  let width = $state(initialLayout.navSidebarWidth);
  let resizeStartWidth = initialLayout.navSidebarWidth;

  // Detect Tauri at mount time (inside onMount) to handle any injection delay
  let isTauri = $state(false);
  let maximized = $state(false);
  let fullscreen = $state(false);

  onMount(() => {
    isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
    if (!isTauri) return;

    const win = getCurrentWindow();
    Promise.all([win.isMaximized(), win.isFullscreen()])
      .then(([m, f]) => { maximized = m; fullscreen = f; })
      .catch(() => {});

    const unlistenP = win.listen("tauri://resize", async () => {
      [maximized, fullscreen] = await Promise.all([win.isMaximized(), win.isFullscreen()]);
    });

    return () => {
      unlistenP.then((fn) => fn()).catch(() => {});
    };
  });

  async function winClose() {
    if (!isTauri) return;
    try {
      await getCurrentWindow().close();
    } catch (e) {
      console.error("winClose:", e);
    }
  }

  async function winMinimize() {
    if (!isTauri) return;
    try {
      await getCurrentWindow().minimize();
    } catch (e) {
      console.error("winMinimize:", e);
    }
  }

  async function winToggleMaximize() {
    if (!isTauri) return;
    try {
      await getCurrentWindow().toggleMaximize();
    } catch (e) {
      console.error("winToggleMaximize:", e);
    }
  }

  async function winToggleFullscreen() {
    if (!isTauri) return;
    try {
      await getCurrentWindow().setFullscreen(!fullscreen);
    } catch (e) {
      console.error("winToggleFullscreen:", e);
    }
  }

  let {
    connectionName = "",
    schemas = [],
    tables = [],
    activeSchema = $bindable("public"),
    activeTable = null,
    activeView = "table",
    tableFilter = "",
    loadingTables = false,
    onschemachange = () => {},
    onviewchange = () => {},
    onopencommand = () => {},
    ontableselect = () => {},
    ontablefilter = () => {},
    onrefresh = () => {},
    onopensettings = () => {},
    ondisconnect = () => {},
    onopenSchema = () => {},
    onopenorm = () => {},
    onopenaimode = () => {},
    aiMode = false,
    /** @type {import('$lib/stores/query-history.js').QueryHistoryEntry[]} */
    queryHistory = [],
    onqueryselect = /** @type {(sql: string) => void} */ (() => {}),
    onopensecurity = () => {},
    onopenlogs = () => {},
    /** @type {import('$lib/stores/connections.js').SavedConnection | null} */
    connection = null,
    onswitchtodb = /** @type {(db: string) => void} */ (() => {}),
  } = $props();

  let localFilter = $state(untrack(() => tableFilter));
  let filterDebounce = /** @type {ReturnType<typeof setTimeout> | null} */ (
    null
  );

  // Section open/collapsed state — persisted across sidebar toggles
  const SIDEBAR_EXPAND_KEY = 'db-studio:sidebar-sections'
  function loadSidebarSections() {
    try {
      const raw = localStorage.getItem(SIDEBAR_EXPAND_KEY)
      if (raw) return JSON.parse(raw)
    } catch {}
    return { tables: true, views: false, matViews: false }
  }
  function saveSidebarSection(key, value) {
    try {
      const current = loadSidebarSections()
      localStorage.setItem(SIDEBAR_EXPAND_KEY, JSON.stringify({ ...current, [key]: value }))
    } catch {}
  }

  const _initial = loadSidebarSections()
  let tablesOpen = $state(_initial.tables ?? true);
  let viewsOpen = $state(_initial.views ?? false);
  let matViewsOpen = $state(_initial.matViews ?? false);
  let logsOpen = $state(false);

  /** @param {number} ts */
  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000)
    if (s < 60) return `${s}s ago`
    if (s < 3600) return `${Math.floor(s / 60)}m ago`
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`
    return `${Math.floor(s / 86400)}d ago`
  }

  $effect(() => { saveSidebarSection('tables', tablesOpen) })
  $effect(() => { saveSidebarSection('views', viewsOpen) })
  $effect(() => { saveSidebarSection('matViews', matViewsOpen) })

  // Sync from parent when it resets externally (e.g. connection change)
  $effect(() => {
    localFilter = tableFilter;
  });

  /** @param {string} value */
  function handleFilterInput(value) {
    localFilter = value;
    if (filterDebounce) clearTimeout(filterDebounce);
    filterDebounce = setTimeout(() => {
      filterDebounce = null;
      ontablefilter(value);
    }, 200);
  }

  const lf = $derived(localFilter.toLowerCase());

  const regularTables = $derived(
    tables.filter(
      (t) => !t.kind || t.kind === "table" || t.kind === "foreign_table",
    ),
  );
  const views = $derived(tables.filter((t) => t.kind === "view"));
  const matViews = $derived(
    tables.filter((t) => t.kind === "materialized_view"),
  );

  const filteredRegularTables = $derived(
    regularTables.filter((t) => t.name.toLowerCase().includes(lf)),
  );
  const filteredViews = $derived(
    views.filter((t) => t.name.toLowerCase().includes(lf)),
  );
  const filteredMatViews = $derived(
    matViews.filter((t) => t.name.toLowerCase().includes(lf)),
  );
  /** Shared field chrome for schema select + table filter (aligned in sidebar grid) */
  const sidebarFieldClass =
    "h-7 w-full min-w-0 rounded-md border border-border bg-background/40 text-ui-sm text-foreground shadow-none transition-colors hover:bg-background/55 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/30";
</script>

<div
  class="flex h-full shrink-0"
  style:width="{width}px"
  data-studio-region="sidebar"
>
  <aside
    class="studio-chrome flex h-full min-w-0 flex-1 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground"
    data-studio-chrome
  >
    {#if isTauri}
      <!--
      Traffic light row: buttons sit outside the drag region so they always
      receive click events; the flex-1 filler to the right is the drag target.
    -->
      <div
        class="traffic-group flex h-9 shrink-0 items-center border-b border-sidebar-border"
      >
        <!-- buttons — NOT inside data-tauri-drag-region -->
        <div class="flex shrink-0 items-center gap-[7px] px-[14px]">
          <button
            type="button"
            class="traffic-dot traffic-close"
            onclick={winClose}
            aria-label="Close window"
            title="Close"
          >
            <svg
              class="traffic-icon"
              viewBox="0 0 8 8"
              width="7"
              height="7"
              fill="none"
            >
              <path
                d="M1.5 1.5l5 5M6.5 1.5l-5 5"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="traffic-dot traffic-minimize"
            onclick={winMinimize}
            aria-label="Minimize window"
            title="Minimize"
          >
            <svg
              class="traffic-icon"
              viewBox="0 0 8 8"
              width="7"
              height="7"
              fill="none"
            >
              <path
                d="M1 4h6"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
              />
            </svg>
          </button>
          <button
            type="button"
            class="traffic-dot traffic-maximize"
            onclick={winToggleFullscreen}
            aria-label={fullscreen ? "Exit fullscreen" : "Enter fullscreen"}
            title={fullscreen ? "Exit Fullscreen" : "Enter Fullscreen"}
          >
            {#if fullscreen}
              <!-- contract arrows -->
              <svg class="traffic-icon" viewBox="0 0 8 8" width="7" height="7" fill="none">
                <path d="M1.5 3.5h2v-2M6.5 4.5h-2v2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {:else}
              <!-- expand arrows -->
              <svg class="traffic-icon" viewBox="0 0 8 8" width="7" height="7" fill="none">
                <path d="M1.5 3.5v-2h2M6.5 4.5v2h-2" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            {/if}
          </button>
        </div>
        <!-- drag region fills the rest of the strip -->
        <div
          class="min-w-0 flex-1 self-stretch"
          data-tauri-drag-region
          role="none"
          ondblclick={winToggleMaximize}
        ></div>
      </div>
    {/if}
    <div class="flex min-h-0 flex-1 flex-col">
      {#if connectionName}
        <div
          class="flex h-9 shrink-0 items-center border-b border-sidebar-border px-2"
        >
          <Tabs.Root
            value={activeView}
            onValueChange={(v) => {
              if (v === "table" || v === "sql") onviewchange(v);
            }}
            class="w-full"
          >
            <Tabs.List class="h-7 w-full gap-0.5 rounded-md bg-muted/50 p-0.5">
              <Tabs.Trigger
                value="table"
                class="h-full flex-1 gap-1.5 rounded-sm text-ui-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground/70"
                title="Data view (⌘⇧D)"
              >
                <Table2 class="size-3 shrink-0 opacity-60" />
                Data
              </Tabs.Trigger>
              <Tabs.Trigger
                value="sql"
                class="h-full flex-1 gap-1.5 rounded-sm text-ui-xs font-medium data-[state=active]:bg-card data-[state=active]:shadow-sm data-[state=active]:text-foreground data-[state=inactive]:text-muted-foreground/70"
                title="SQL editor (⌘⇧S)"
              >
                <Terminal class="size-3 shrink-0 opacity-60" />
                SQL
              </Tabs.Trigger>
            </Tabs.List>
          </Tabs.Root>
        </div>
      {/if}

      <div
        class="flex shrink-0 flex-col gap-1.5 border-b border-sidebar-border px-2 py-2"
      >
        <div class="flex min-w-0 items-center gap-1">
          <div class="min-w-0 flex-1">
            {#if schemas.length === 0}
              <span
                class={cn(
                  sidebarFieldClass,
                  "flex items-center px-2.5 font-medium",
                )}
                id="sidebar-schema"
              >
                —
              </span>
            {:else}
              <Select.Root
                type="single"
                value={activeSchema}
                onValueChange={(v) => {
                  if (v) onschemachange(v);
                }}
              >
                <Select.Trigger
                  id="sidebar-schema"
                  size="sm"
                  class={cn(
                    sidebarFieldClass,
                    "justify-between gap-2 px-2.5 font-normal focus-visible:ring-1 data-[size=sm]:h-7 [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:text-muted-foreground",
                  )}
                >
                  <span class="truncate">{activeSchema}</span>
                </Select.Trigger>
                <Select.Content
                  sideOffset={6}
                  class="w-[var(--bits-select-anchor-width)] min-w-[var(--bits-select-anchor-width)] p-1"
                >
                  {#each schemas as schema (schema)}
                    <Select.Item
                      value={schema}
                      label={schema}
                      class="rounded-sm py-1.5 pr-8 pl-2.5 text-ui-sm"
                    />
                  {/each}
                </Select.Content>
              </Select.Root>
            {/if}
          </div>
          <button
            type="button"
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="Filter tables"
            disabled
          >
            <ListFilter class="size-3.5" />
          </button>
          <button
            type="button"
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-40"
            title="Refresh tables (⌘R)"
            disabled={loadingTables}
            onclick={onrefresh}
          >
            <RefreshCw
              class={cn("size-3.5", loadingTables && "animate-spin")}
            />
          </button>
          <button
            type="button"
            class="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title="New table"
            disabled
          >
            <Plus class="size-3.5" />
          </button>
        </div>

        <div class="relative min-w-0 w-full">
          <Search
            class="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="search"
            placeholder="Filter tables…"
            value={localFilter}
            oninput={(e) => handleFilterInput(e.currentTarget.value)}
            class={cn(sidebarFieldClass, "w-full pl-8 pr-2.5 outline-none")}
            aria-label="Filter tables"
            data-sidebar-filter
          />
        </div>
      </div>

      <div class="flex min-h-0 flex-1 flex-col">
        <ScrollArea class="min-h-0 w-full flex-1">
          {#if loadingTables}
            <div
              class="flex items-center justify-center py-8"
              role="status"
              aria-label="Loading"
            >
              <span class="inline-flex gap-1.5" aria-hidden="true">
                <span
                  class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                  style="animation-delay: 0ms"
                ></span>
                <span
                  class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                  style="animation-delay: 150ms"
                ></span>
                <span
                  class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50"
                  style="animation-delay: 300ms"
                ></span>
              </span>
            </div>
          {:else}
            <!-- ── Tables ─────────────────────────────────────────── -->
            <button
              type="button"
              class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1 text-left"
              onclick={() => {
                tablesOpen = !tablesOpen;
              }}
            >
              <ChevronDown
                class={cn(
                  "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                  !tablesOpen && "-rotate-90",
                )}
              />
              <span
                class="text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase"
                >Tables</span
              >
              {#if regularTables.length > 0}
                <span
                  class="ml-auto font-mono text-ui-2xs text-muted-foreground/60"
                  >{regularTables.length}</span
                >
              {/if}
            </button>
            {#if tablesOpen}
              <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
                {#if regularTables.length === 0}
                  <li
                    class="flex w-full flex-col items-center gap-2 px-4 py-8 text-center"
                  >
                    <Table2 class="size-7 text-muted-foreground/25" />
                    <p class="text-ui-sm text-muted-foreground">
                      No tables in {activeSchema || "schema"}
                    </p>
                  </li>
                {:else if filteredRegularTables.length === 0}
                  <li
                    class="px-3 py-3 text-center text-ui-xs text-muted-foreground"
                  >
                    No tables match
                  </li>
                {:else}
                  {#each filteredRegularTables as table (table.name)}
                    <li>
                      <button
                        type="button"
                        class={cn(
                          "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left transition-colors",
                          activeTable === table.name
                            ? "bg-sidebar-accent text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                        )}
                        onclick={() => ontableselect(table.name)}
                      >
                        <Table2 class="size-3 shrink-0 opacity-50" />
                        <span
                          class="min-w-0 truncate font-mono text-ui-sm leading-none"
                          >{table.name}</span
                        >
                        <span
                          class="shrink-0 text-right font-mono text-ui-xs leading-none tabular-nums text-muted-foreground"
                          title={table.rowCount != null
                            ? Number(table.rowCount).toLocaleString("en-US")
                            : undefined}
                        >
                          {formatTableRowCount(table.rowCount)}
                        </span>
                      </button>
                    </li>
                  {/each}
                {/if}
              </ul>
            {/if}

            <!-- ── Views ──────────────────────────────────────────── -->
            {#if views.length > 0 || filteredViews.length > 0}
              <button
                type="button"
                class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1 text-left"
                onclick={() => {
                  viewsOpen = !viewsOpen;
                }}
              >
                <ChevronDown
                  class={cn(
                    "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                    !viewsOpen && "-rotate-90",
                  )}
                />
                <span
                  class="text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase"
                  >Views</span
                >
                {#if views.length > 0}
                  <span
                    class="ml-auto font-mono text-ui-2xs text-muted-foreground/60"
                    >{views.length}</span
                  >
                {/if}
              </button>
              {#if viewsOpen}
                <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
                  {#if filteredViews.length === 0}
                    <li
                      class="px-3 py-3 text-center text-ui-xs text-muted-foreground"
                    >
                      No views match
                    </li>
                  {:else}
                    {#each filteredViews as view (view.name)}
                      <li>
                        <button
                          type="button"
                          class={cn(
                            "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                            activeTable === view.name
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                          )}
                          onclick={() => ontableselect(view.name)}
                        >
                          <Eye class="size-3 shrink-0 opacity-50" />
                          <span
                            class="min-w-0 truncate font-mono text-ui-sm leading-none"
                            >{view.name}</span
                          >
                        </button>
                      </li>
                    {/each}
                  {/if}
                </ul>
              {/if}
            {/if}

            <!-- ── Materialized Views ─────────────────────────────── -->
            {#if matViews.length > 0 || filteredMatViews.length > 0}
              <button
                type="button"
                class="flex w-full items-center gap-1 px-2.5 pt-2 pb-1 text-left"
                onclick={() => {
                  matViewsOpen = !matViewsOpen;
                }}
              >
                <ChevronDown
                  class={cn(
                    "size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150",
                    !matViewsOpen && "-rotate-90",
                  )}
                />
                <span
                  class="text-ui-2xs font-medium tracking-wide text-muted-foreground uppercase"
                  >Materialized Views</span
                >
                {#if matViews.length > 0}
                  <span
                    class="ml-auto font-mono text-ui-2xs text-muted-foreground/60"
                    >{matViews.length}</span
                  >
                {/if}
              </button>
              {#if matViewsOpen}
                <ul class="flex w-full min-w-full flex-col gap-0.5 px-1.5 pb-1">
                  {#if filteredMatViews.length === 0}
                    <li
                      class="px-3 py-3 text-center text-ui-xs text-muted-foreground"
                    >
                      No materialized views match
                    </li>
                  {:else}
                    {#each filteredMatViews as mv (mv.name)}
                      <li>
                        <button
                          type="button"
                          class={cn(
                            "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 rounded-md px-2 py-1.5 text-left transition-colors",
                            activeTable === mv.name
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-muted-foreground hover:bg-sidebar-accent/50 hover:text-foreground",
                          )}
                          onclick={() => ontableselect(mv.name)}
                        >
                          <Layers class="size-3 shrink-0 opacity-50" />
                          <span
                            class="min-w-0 truncate font-mono text-ui-sm leading-none"
                            >{mv.name}</span
                          >
                          <span
                            class="shrink-0 text-right font-mono text-ui-xs leading-none tabular-nums text-muted-foreground"
                          >
                            {formatTableRowCount(mv.rowCount)}
                          </span>
                        </button>
                      </li>
                    {/each}
                  {/if}
                </ul>
              {/if}
            {/if}


          {/if}

          <!-- ── Logs ─────────────────────────────────────────── -->
          {#if logsOpen}
            <div class="border-t border-sidebar-border">
              <div class="flex items-center">
                <button
                  type="button"
                  class="flex flex-1 items-center gap-1 px-2.5 pt-2 pb-1 text-left"
                  onclick={() => { logsOpen = false }}
                >
                  <ChevronDown class="size-3 shrink-0 text-muted-foreground/60 transition-transform duration-150" />
                  <span class="text-ui-2xs font-medium uppercase tracking-wide text-muted-foreground">Activity Log</span>
                  {#if queryHistory.length > 0}
                    <span class="ml-1 font-mono text-ui-2xs text-muted-foreground/60">{queryHistory.length}</span>
                  {/if}
                </button>
                <button
                  type="button"
                  class="mr-2 font-mono text-ui-2xs text-muted-foreground/50 hover:text-primary pt-1.5"
                  onclick={onopenlogs}
                  title="Open full activity log"
                >Open all →</button>
              </div>
              <ul class="flex w-full flex-col gap-px px-1.5 pb-2">
                {#if queryHistory.length === 0}
                  <li class="px-3 py-3 text-center text-ui-xs text-muted-foreground">No queries yet</li>
                {:else}
                  {#each queryHistory.slice(0, 50) as entry (entry.id)}
                    <li>
                      <button
                        type="button"
                        class="group flex w-full flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/50"
                        onclick={() => onqueryselect(entry.sql)}
                        title={entry.sql}
                      >
                        <div class="flex w-full items-center gap-1.5 min-w-0">
                          {#if entry.success === false}
                            <XCircle class="size-2.5 shrink-0 text-destructive" />
                          {:else}
                            <CheckCircle class="size-2.5 shrink-0 text-primary/60" />
                          {/if}
                          <span class="min-w-0 flex-1 truncate font-mono text-ui-xs text-foreground/80">{entry.title}</span>
                        </div>
                        <div class="flex items-center gap-2 pl-4">
                          <span class="font-mono text-ui-2xs text-muted-foreground/60">{timeAgo(entry.executedAt)}</span>
                          {#if entry.queryMs != null}
                            <span class="font-mono text-ui-2xs text-muted-foreground/50">{entry.queryMs}ms</span>
                          {/if}
                        </div>
                      </button>
                    </li>
                  {/each}
                {/if}
              </ul>
            </div>
          {/if}

        </ScrollArea>
      </div>
    </div>

    <footer class="flex flex-col gap-0 border-t border-sidebar-border">
      <!-- Database switcher -->
      {#if connectionName}
        <div class="px-2 pt-2 pb-1">
          <DatabaseSwitcher {connection} {onswitchtodb} />
        </div>
      {/if}

      <!-- Icon toolbar -->
      <div class="flex items-center gap-0.5 px-2 pb-2 pt-0.5">
        <button
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          title="Schema Explorer"
          onclick={onopenSchema}
        ><LayoutTemplate class="size-3.5" /></button>

        <button
          type="button"
          class={cn(
            'inline-flex size-7 items-center justify-center rounded-md transition-colors',
            logsOpen ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-muted-foreground/70 hover:bg-accent hover:text-foreground',
          )}
          title="Activity log"
          onclick={() => { logsOpen = !logsOpen }}
        ><History class="size-3.5" /></button>

        <button
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          title="Security"
          onclick={onopensecurity}
        ><ShieldCheck class="size-3.5" /></button>

        <button
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          title="ORM Runner"
          onclick={onopenorm}
        ><Code2 class="size-3.5" /></button>

        <button
          type="button"
          class={cn(
            'inline-flex size-7 items-center justify-center rounded-md transition-colors',
            aiMode ? 'bg-primary/10 text-primary hover:bg-primary/15' : 'text-muted-foreground/70 hover:bg-accent hover:text-foreground',
          )}
          title={aiMode ? 'Close AI panel (⌘⌥E)' : 'Open AI panel (⌘⌥E)'}
          onclick={onopenaimode}
        ><Bot class="size-3.5" /></button>

        <div class="flex-1"></div>

        <button
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          title="Command menu (⌘K)"
          onclick={onopencommand}
        ><Command class="size-3.5" /></button>

        <button
          type="button"
          class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground"
          title="Settings"
          onclick={onopensettings}
        ><Settings class="size-3.5" /></button>

        {#if connectionName}
          <button
            type="button"
            class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-destructive"
            title="Disconnect"
            onclick={ondisconnect}
          ><Unplug class="size-3.5" /></button>
        {/if}
      </div>
    </footer>
  </aside>
  <ResizeHandle
    edge="end"
    onresizestart={() => {
      resizeStartWidth = width;
    }}
    onresize={(dx) => {
      width = clampNavSidebarWidth(resizeStartWidth + dx);
    }}
    onresizeend={() => {
      resizeStartWidth = width;
      saveLayout({ navSidebarWidth: width });
    }}
  />
</div>

<style>
  .traffic-dot {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: none;
    cursor: default;
    flex-shrink: 0;
    transition: opacity 0.1s;
    -webkit-app-region: no-drag;
    app-region: no-drag;
  }
  .traffic-dot:active {
    opacity: 0.55;
  }

  /* Standard macOS traffic light colours */
  .traffic-close {
    background-color: #ff5f57;
    color: #7c0902;
  }
  .traffic-minimize {
    background-color: #ffbd2e;
    color: #7c4d00;
  }
  .traffic-maximize {
    background-color: #27c93f;
    color: #0a5c1d;
  }

  /* Icons hidden by default, revealed when any dot in the group is hovered */
  .traffic-icon {
    opacity: 0;
    transition: opacity 0.08s;
    pointer-events: none;
    flex-shrink: 0;
  }

  /* Hover on the button group shows all icons simultaneously */
  .traffic-group:hover .traffic-icon {
    opacity: 1;
  }

  /* Dim when window doesn't have focus / group not hovered */
  .traffic-group:not(:hover) .traffic-dot {
    opacity: 0.45;
  }
</style>
