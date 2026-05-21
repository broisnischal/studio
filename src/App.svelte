<script>
  import { createHotkey } from '@tanstack/svelte-hotkeys'
  import StudioShell from './lib/components/StudioShell.svelte'
  import {
    increaseZoom,
    decreaseZoom,
    resetZoom,
    loadSettings,
    applySettings,
  } from '$lib/stores/settings.js'

  $effect(() => {
    applySettings(loadSettings())
  })

  createHotkey('Mod+=', (e) => {
    e.preventDefault()
    increaseZoom()
  })
  createHotkey('Mod+-', (e) => {
    e.preventDefault()
    decreaseZoom()
  })
  createHotkey('Mod+0', (e) => {
    e.preventDefault()
    resetZoom()
  })
</script>

<StudioShell />
