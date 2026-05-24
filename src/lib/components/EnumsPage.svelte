<script>
  import Tags from '@lucide/svelte/icons/tags'
  import RefreshCw from '@lucide/svelte/icons/refresh-cw'
  import { Button } from '$lib/components/ui/button/index.js'

  let {
    /** @type {{ name: string, values: string[] }[]} */
    enums = [],
    loading = false,
    onrefresh = () => {},
  } = $props()
</script>

<div class="flex min-h-0 flex-1 flex-col overflow-hidden">
  <!-- Toolbar -->
  <div class="studio-chrome flex h-9 shrink-0 items-center gap-2 border-b border-border bg-panel px-3" data-studio-chrome>
    <Tags class="size-4 shrink-0 text-muted-foreground" />
    <span class="font-mono text-ui-sm font-medium">Enums</span>
    {#if enums.length > 0}
      <span class="font-mono text-ui-xs text-muted-foreground">({enums.length})</span>
    {/if}
    <div class="ml-auto flex items-center gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="h-7 gap-1.5 px-2 text-muted-foreground hover:text-foreground"
        disabled={loading}
        title="Refresh enums"
        onclick={onrefresh}
      >
        <RefreshCw class={loading ? 'size-3.5 animate-spin' : 'size-3.5'} />
        <span class="text-ui-xs">Refresh</span>
      </Button>
    </div>
  </div>

  <!-- Content -->
  <div class="min-h-0 flex-1 overflow-y-auto p-4">
    {#if enums.length === 0}
      <div class="flex h-full flex-col items-center justify-center gap-3 text-center">
        <Tags class="size-10 text-muted-foreground/20" />
        <div>
          <p class="font-mono text-ui text-muted-foreground">No enum types</p>
          <p class="mt-1 text-ui-xs text-muted-foreground/60">
            Enum types defined in this schema will appear here
          </p>
        </div>
      </div>
    {:else}
      <div class="grid gap-3" style="grid-template-columns: repeat(auto-fill, minmax(280px, 1fr))">
        {#each enums as e (e.name)}
          <div class="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
            <div class="flex items-center gap-2">
              <Tags class="size-4 shrink-0 text-muted-foreground/60" />
              <span class="min-w-0 truncate font-mono text-ui-sm font-medium">{e.name}</span>
              <span class="ml-auto shrink-0 rounded-full bg-muted px-2 py-0.5 font-mono text-ui-2xs text-muted-foreground">
                {e.values.length}
              </span>
            </div>
            {#if e.values.length > 0}
              <div class="flex flex-wrap gap-1.5 border-t border-border pt-2">
                {#each e.values as val (val)}
                  <span class="rounded-md border border-border bg-muted/50 px-2 py-0.5 font-mono text-ui-xs text-foreground">
                    {val}
                  </span>
                {/each}
              </div>
            {:else}
              <p class="border-t border-border pt-2 text-ui-xs text-muted-foreground/50">No values</p>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
