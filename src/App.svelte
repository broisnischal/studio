<script>
  import { onMount } from 'svelte'
  import { Toaster } from '$lib/components/ui/sonner/index.js'
  import StudioShell from './lib/components/StudioShell.svelte'
  import { loadSettings, applySettings, installZoomShortcuts } from '$lib/stores/settings.js'

  onMount(() => {
    applySettings(loadSettings())
    installZoomShortcuts()
  })
</script>

<Toaster richColors closeButton position="bottom-right" />
<StudioShell />
