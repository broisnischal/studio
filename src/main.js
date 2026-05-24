import { mount } from 'svelte'
import './app.css'
import App from './App.svelte'
import { applySettings, loadSettings } from '$lib/stores/settings.js'

applySettings(loadSettings())

// ── Native-app feel ────────────────────────────────────────────────────────
// Disable browser right-click context menu everywhere.
document.addEventListener('contextmenu', (e) => e.preventDefault())

// Open external links (http/https/mailto) in the system browser via Tauri.
// capture:true ensures this fires before any element-level handlers.
document.addEventListener('click', async (e) => {
  const anchor = /** @type {Element | null} */ (e.target)?.closest('a')
  if (!anchor) return
  const href = /** @type {HTMLAnchorElement} */ (anchor).href
  if (!href) return
  const isExternal =
    href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')
  if (!isExternal) return
  e.preventDefault()
  e.stopImmediatePropagation()
  try {
    const { openUrl: open } = await import('@tauri-apps/plugin-opener')
    await open(href)
  } catch {
    // ignore in dev/browser environments without Tauri
  }
}, { capture: true })

const app = mount(App, {
  target: document.getElementById('app'),
})

export default app
