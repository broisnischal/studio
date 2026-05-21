<script>
  import Settings from '@lucide/svelte/icons/settings'
  import Sun from '@lucide/svelte/icons/sun'
  import Moon from '@lucide/svelte/icons/moon'
  import Minus from '@lucide/svelte/icons/minus'
  import Plus from '@lucide/svelte/icons/plus'
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

  let { open = $bindable(false) } = $props()

  let settings = $state(loadSettings())

  function refreshSettings() {
    settings = loadSettings()
  }

  $effect(() => {
    if (open) refreshSettings()
  })

  function setTheme(theme) {
    settings = updateSettings({ theme })
  }

  function bumpZoom(delta) {
    settings = delta > 0 ? increaseZoom() : decreaseZoom()
  }

  const zoomLabel = $derived(`${Math.round(settings.zoom * 100)}%`)
</script>

<Dialog.Root bind:open>
  <Dialog.Content class="max-w-sm gap-0 p-0 sm:max-w-sm">
    <Dialog.Header class="border-b border-border px-6 py-5">
      <div class="flex items-center gap-3">
        <div class="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Settings class="size-4 text-muted-foreground" />
        </div>
        <div class="flex flex-col gap-1">
          <Dialog.Title class="text-base font-semibold">Settings</Dialog.Title>
          <Dialog.Description class="text-sm text-muted-foreground">
            Theme and zoom. Use Ctrl + / Ctrl − to zoom anytime.
          </Dialog.Description>
        </div>
      </div>
    </Dialog.Header>

    <div class="flex flex-col gap-6 px-6 py-5">
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
          Shortcuts: Ctrl + Plus, Ctrl + Minus, Ctrl + 0 to reset
        </p>
      </div>
    </div>

    <Dialog.Footer class="border-t border-border px-6 py-4">
      <Button type="button" class="w-full" onclick={() => (open = false)}>Done</Button>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
