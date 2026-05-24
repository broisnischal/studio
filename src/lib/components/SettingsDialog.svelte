<script>
  import Settings from '@lucide/svelte/icons/settings'
  import Sun from '@lucide/svelte/icons/sun'
  import Moon from '@lucide/svelte/icons/moon'
  import Minus from '@lucide/svelte/icons/minus'
  import Plus from '@lucide/svelte/icons/plus'
  import Server from '@lucide/svelte/icons/server'
  import ArrowRight from '@lucide/svelte/icons/arrow-right'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import * as Dialog from '$lib/components/ui/dialog/index.js'
  import {
    loadSettings,
    updateSettings,
    increaseZoom,
    decreaseZoom,
    resetZoom,
    canIncreaseZoom,
    canDecreaseZoom,
  } from '$lib/stores/settings.js'

  let {
    open = $bindable(false),
    onopenmcp = () => {},
  } = $props()

  let settings = $state(loadSettings())

  function refreshSettings() {
    settings = loadSettings()
  }

  /** @param {boolean} next */
  function handleOpenChange(next) {
    if (next) refreshSettings()
  }

  function setTheme(theme) {
    settings = updateSettings({ theme })
  }

  function bumpZoom(delta) {
    settings = delta > 0 ? increaseZoom() : decreaseZoom()
  }

  function toggleMcpAutoStart() {
    settings = updateSettings({ mcpAutoStart: !settings.mcpAutoStart })
  }

  const zoomLabel = $derived(`${Math.round(settings.zoom * 100)}%`)
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
  <Dialog.Content class="flex max-w-sm flex-col gap-0 overflow-hidden p-0 sm:max-w-sm">
    <Dialog.Header class="border-b border-border px-6 py-5">
      <div class="flex items-center gap-3">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Settings class="size-4 text-muted-foreground" />
        </div>
        <div class="flex flex-col gap-1">
          <Dialog.Title class="text-base font-semibold">Settings</Dialog.Title>
          <Dialog.Description class="text-sm text-muted-foreground">
            Appearance, zoom, and integrations
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="flex flex-col gap-6 px-6 py-5">
      <!-- Theme -->
      <div class="flex flex-col gap-3">
        <Label>Theme</Label>
        <div class="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant={settings.theme === 'light' ? 'default' : 'outline'}
            class="justify-start gap-2"
            onclick={() => setTheme('light')}
          >
            <Sun class="size-4" />
            Light
          </Button>
          <Button
            type="button"
            variant={settings.theme === 'dark' ? 'default' : 'outline'}
            class="justify-start gap-2"
            onclick={() => setTheme('dark')}
          >
            <Moon class="size-4" />
            Dark
          </Button>
        </div>
      </div>

      <!-- Zoom -->
      <div class="flex flex-col gap-3">
        <Label>Zoom</Label>
        <div class="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Zoom out"
            disabled={!canDecreaseZoom(settings.zoom)}
            onclick={() => bumpZoom(-1)}
          >
            <Minus class="size-4" />
          </Button>
          <button
            type="button"
            class="min-w-16 flex-1 text-center font-mono text-sm tabular-nums text-foreground hover:underline"
            onclick={() => (settings = resetZoom())}
            title="Reset to 100%"
          >
            {zoomLabel}
          </button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Zoom in"
            disabled={!canIncreaseZoom(settings.zoom)}
            onclick={() => bumpZoom(1)}
          >
            <Plus class="size-4" />
          </Button>
        </div>
        <p class="text-xs text-muted-foreground">
          Shortcuts: Ctrl + M theme; Ctrl + Plus, Ctrl + Minus, Ctrl + 0 zoom
        </p>
      </div>

      <!-- MCP Server -->
      <div class="flex flex-col gap-3">
        <Label class="flex items-center gap-1.5">
          <Server class="size-3.5 text-muted-foreground" />
          MCP Server
        </Label>
        <div class="rounded-lg border border-border bg-muted/20 p-3">
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-medium text-foreground">Auto-start on connect</p>
              <p class="mt-0.5 text-[11px] text-muted-foreground">
                Start the MCP server automatically when a database is connected
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.mcpAutoStart}
              class="relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 {settings.mcpAutoStart ? 'bg-foreground' : 'bg-input'}"
              onclick={toggleMcpAutoStart}
            >
              <span
                class="pointer-events-none block size-4 rounded-full bg-background shadow-lg ring-0 transition-transform {settings.mcpAutoStart ? 'translate-x-4' : 'translate-x-0'}"
              ></span>
            </button>
          </div>

          <button
            type="button"
            class="mt-3 flex w-full items-center justify-between rounded-md border border-border/70 bg-background px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            onclick={() => { open = false; onopenmcp() }}
          >
            <span class="flex items-center gap-2">
              <Server class="size-3.5" />
              Configure MCP Server
            </span>
            <ArrowRight class="size-3.5" />
          </button>
        </div>
      </div>
    </div>

    <div class="shrink-0 border-t border-border bg-card px-6 py-4">
      <Button type="button" class="w-full" onclick={() => (open = false)}>Done</Button>
    </div>
  </Dialog.Content>
</Dialog.Root>
