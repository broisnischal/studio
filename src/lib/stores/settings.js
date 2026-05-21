import { setMode } from 'mode-watcher'

const STORAGE_KEY = 'db-studio:settings'

/** @typedef {'light' | 'dark'} Theme */
/** @typedef {{ theme: Theme, zoom: number }} AppSettings */

/** UI zoom scale (font + layout). 1 = 100%. */
export const ZOOM_STEPS = [0.8, 0.85, 0.9, 0.95, 1, 1.05, 1.1, 1.15, 1.25, 1.5]
const DEFAULT_ZOOM = 1

/** @type {AppSettings} */
export const DEFAULT_SETTINGS = {
  theme: 'dark',
  zoom: DEFAULT_ZOOM,
}

/** @returns {AppSettings} */
export function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_SETTINGS }
    const parsed = JSON.parse(raw)
    const theme = parsed.theme === 'light' ? 'light' : 'dark'
    let zoom = DEFAULT_ZOOM
    if (parsed.zoom != null) {
      zoom = Number(parsed.zoom)
    } else if (parsed.fontSize != null) {
      const fs = Number(parsed.fontSize)
      if (Number.isFinite(fs) && fs >= 10 && fs <= 24) zoom = fs / 14
    }
    if (!Number.isFinite(zoom)) zoom = DEFAULT_ZOOM
    if (!ZOOM_STEPS.includes(zoom)) {
      zoom = ZOOM_STEPS.reduce((prev, step) =>
        Math.abs(step - zoom) < Math.abs(prev - zoom) ? step : prev,
      )
    }
    return { theme, zoom }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

/** @param {AppSettings} settings */
export function saveSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}

/** @param {AppSettings} settings */
export function applySettings(settings) {
  const root = document.documentElement
  const zoom = settings.zoom
  const isDark = settings.theme === 'dark'
  root.classList.toggle('dark', isDark)
  setMode(isDark ? 'dark' : 'light')
  root.style.setProperty('--app-zoom', String(zoom))
  root.style.setProperty('--app-font-size', `${Math.round(13 * zoom)}px`)
}

let zoomListenerInstalled = false

/** @param {KeyboardEvent} e */
function handleZoomKeydown(e) {
  if (!e.ctrlKey && !e.metaKey) return
  if (e.altKey) return

  const { key, code } = e

  if (key === '0' || code === 'Digit0' || code === 'Numpad0') {
    e.preventDefault()
    e.stopPropagation()
    resetZoom()
    return
  }

  if (
    key === '=' ||
    key === '+' ||
    code === 'Equal' ||
    code === 'NumpadAdd' ||
    (e.shiftKey && code === 'Equal')
  ) {
    e.preventDefault()
    e.stopPropagation()
    increaseZoom()
    return
  }

  if (key === '-' || key === '_' || code === 'Minus' || code === 'NumpadSubtract') {
    e.preventDefault()
    e.stopPropagation()
    decreaseZoom()
    return
  }

  if (key === 'm' || key === 'M' || code === 'KeyM') {
    e.preventDefault()
    e.stopPropagation()
    toggleTheme()
  }
}

/** Block Tauri webview zoom (Ctrl/Cmd + wheel) when hotkeys are enabled in the shell. */
function handleZoomWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault()
    e.stopPropagation()
  }
}

/** Register Ctrl/Cmd +/-/0 zoom shortcuts (capture phase, works in inputs). */
export function installZoomShortcuts() {
  if (zoomListenerInstalled || typeof window === 'undefined') return
  zoomListenerInstalled = true
  window.addEventListener('keydown', handleZoomKeydown, true)
  window.addEventListener('wheel', handleZoomWheel, { capture: true, passive: false })
}

/** @param {Partial<AppSettings>} patch */
export function updateSettings(patch) {
  const next = { ...loadSettings(), ...patch }
  saveSettings(next)
  applySettings(next)
  return next
}

export function increaseZoom() {
  const current = loadSettings()
  const idx = ZOOM_STEPS.indexOf(current.zoom)
  if (idx < ZOOM_STEPS.length - 1) {
    return updateSettings({ zoom: ZOOM_STEPS[idx + 1] })
  }
  return current
}

export function decreaseZoom() {
  const current = loadSettings()
  const idx = ZOOM_STEPS.indexOf(current.zoom)
  if (idx > 0) {
    return updateSettings({ zoom: ZOOM_STEPS[idx - 1] })
  }
  return current
}

export function resetZoom() {
  return updateSettings({ zoom: DEFAULT_ZOOM })
}

export function toggleTheme() {
  const current = loadSettings()
  const theme = current.theme === 'dark' ? 'light' : 'dark'
  return updateSettings({ theme })
}

export function canIncreaseZoom(zoom) {
  return ZOOM_STEPS.indexOf(zoom) < ZOOM_STEPS.length - 1
}

export function canDecreaseZoom(zoom) {
  return ZOOM_STEPS.indexOf(zoom) > 0
}
