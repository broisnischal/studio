<script>
  import Table2 from '@lucide/svelte/icons/table-2'
  import Terminal from '@lucide/svelte/icons/terminal'
  import FileText from '@lucide/svelte/icons/file-text'
  import X from '@lucide/svelte/icons/x'
  import Plus from '@lucide/svelte/icons/plus'
  import { cn } from '$lib/utils.js'
  import { tabDisplayTitle } from '$lib/studio-tabs.js'

  /** @typedef {import('$lib/studio-tabs.js').StudioTab} StudioTab */

  let {
    tabs = [],
    activeTabId = null,
    onselect = () => {},
    onclose = () => {},
    onnew = () => {},
  } = $props()

  /** @param {StudioTab} tab */
  function tabIcon(tab) {
    if (tab.kind === 'sql') return Terminal
    if (tab.kind === 'table') return Table2
    return FileText
  }
</script>

<header
  class="flex h-9 shrink-0 items-stretch gap-0 border-b border-border bg-panel"
  role="tablist"
  aria-label="Open editors"
>
  <div class="app-scroll flex min-w-0 flex-1 items-stretch overflow-x-auto">
    {#each tabs as tab (tab.id)}
      {@const Icon = tabIcon(tab)}
      {@const active = tab.id === activeTabId}
      <div
        class={cn(
          'group/tab flex max-w-[220px] min-w-0 shrink-0 items-stretch border-r border-border',
          active ? 'bg-background' : 'bg-panel hover:bg-muted/40',
        )}
      >
        <button
          type="button"
          role="tab"
          aria-selected={active}
          title={tabDisplayTitle(tab)}
          class={cn(
            'flex min-w-0 flex-1 items-center gap-1.5 px-2.5 text-left text-[12px] transition-colors',
            active ? 'text-foreground' : 'text-muted-foreground',
          )}
          onclick={() => onselect(tab.id)}
        >
          <Icon class="size-3 shrink-0 opacity-60" />
          <span class="truncate font-mono leading-none">{tabDisplayTitle(tab)}</span>
        </button>
        <button
          type="button"
          class={cn(
            'inline-flex w-7 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
            active ? 'opacity-100' : 'opacity-0 group-hover/tab:opacity-100',
          )}
          title="Close tab"
          aria-label="Close tab"
          onclick={(e) => {
            e.stopPropagation()
            onclose(tab.id)
          }}
        >
          <X class="size-3" />
        </button>
      </div>
    {/each}
  </div>

  <button
    type="button"
    class="inline-flex w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
    title="New tab"
    aria-label="New tab"
    onclick={onnew}
  >
    <Plus class="size-3.5" />
  </button>
</header>
