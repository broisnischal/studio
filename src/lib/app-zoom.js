/** @returns {number} App UI zoom from settings (1 = 100%). */
export function getAppZoom() {
  if (typeof document === 'undefined') return 1

  const fromVar = Number(
    getComputedStyle(document.documentElement).getPropertyValue('--app-zoom'),
  )
  if (Number.isFinite(fromVar) && fromVar > 0) return fromVar

  const app = document.getElementById('app')
  if (app) {
    const fromEl = Number(getComputedStyle(app).zoom)
    if (Number.isFinite(fromEl) && fromEl > 0) return fromEl
  }

  return 1
}

/**
 * Viewport position for body-portaled overlays (context menus, etc.).
 * Use raw clientX/Y — #app zoom does not require dividing coordinates.
 * @param {number} clientX
 * @param {number} clientY
 */
export function overlayPointerPosition(clientX, clientY) {
  return { x: clientX, y: clientY }
}
