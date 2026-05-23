<script>
  import { onMount } from 'svelte'
  import { Toaster } from '$lib/components/ui/sonner/index.js'
  import StudioShell from './lib/components/StudioShell.svelte'
  import { loadSettings, applySettings, installZoomShortcuts } from '$lib/stores/settings.js'
  import { installPlatformClass } from '$lib/platform.js'

  onMount(() => {
    installPlatformClass()
    applySettings(loadSettings())
    installZoomShortcuts()
  })
</script>

<Toaster position="top-right" offset="12px" expand closeButton />
<StudioShell />
