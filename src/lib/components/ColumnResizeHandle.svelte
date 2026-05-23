<script>
  let {
    onresizestart = () => {},
    onresize = () => {},
    onresizeend = () => {},
  } = $props()

  /** @param {PointerEvent} e */
  function handlePointerDown(e) {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    onresizestart()
    const el = /** @type {HTMLElement} */ (e.currentTarget)
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX

    /** @param {PointerEvent} ev */
    function onMove(ev) {
      onresize(ev.clientX - startX)
    }

    /** @param {PointerEvent} ev */
    function onUp(ev) {
      el.releasePointerCapture(ev.pointerId)
      el.removeEventListener('pointermove', onMove)
      el.removeEventListener('pointerup', onUp)
      el.removeEventListener('pointercancel', onUp)
      onresizeend()
    }

    el.addEventListener('pointermove', onMove)
    el.addEventListener('pointerup', onUp)
    el.addEventListener('pointercancel', onUp)
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  role="separator"
  aria-orientation="vertical"
  aria-label="Resize column"
  tabindex="-1"
  class="group/handle absolute top-0 right-0 z-20 h-full w-2 translate-x-1/2 cursor-col-resize touch-none select-none"
  onpointerdown={handlePointerDown}
>
  <div
    class="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/0 transition-colors group-hover/handle:bg-primary/40 group-active/handle:bg-primary"
  ></div>
</div>
