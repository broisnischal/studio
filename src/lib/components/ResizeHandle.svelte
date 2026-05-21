<script>
  let {
    /** @type {'start' | 'end'} */
    edge = 'end',
    onresizestart = () => {},
    onresize = () => {},
    onresizeend = () => {},
  } = $props()

  /** @param {PointerEvent} e */
  function handlePointerDown(e) {
    if (e.button !== 0) return
    e.preventDefault()
    onresizestart()
    const el = /** @type {HTMLElement} */ (e.currentTarget)
    el.setPointerCapture(e.pointerId)
    const startX = e.clientX

    /** @param {PointerEvent} ev */
    function onMove(ev) {
      const dx = ev.clientX - startX
      onresize(edge === 'end' ? dx : -dx)
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
  aria-label="Resize panel"
  tabindex="-1"
  class="group relative z-10 w-1 shrink-0 cursor-col-resize touch-none select-none"
  onpointerdown={handlePointerDown}
>
  <div
    class="absolute inset-y-0 w-3 transition-colors group-hover:bg-border/80 group-active:bg-border {edge ===
    'end'
      ? '-right-1'
      : '-left-1'}"
  ></div>
</div>
