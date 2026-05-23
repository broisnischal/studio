/** @typedef {'light' | 'dark'} ThemeId */

import { highlightCode, resolveShikiLang } from '$lib/shiki-highlighter.js'

/** @param {string} className */
function langFromCodeClass(className) {
  const match = className.match(/language-([\w-]+)/i)
  return match?.[1] ?? ''
}

/**
 * Highlight fenced code blocks inside HTML produced by marked.
 * @param {string} html
 * @param {ThemeId} [theme]
 */
export async function highlightMarkdownHtml(html, theme = 'dark') {
  if (typeof document === 'undefined') return html

  const doc = new DOMParser().parseFromString(`<div id="md-root">${html}</div>`, 'text/html')
  const root = doc.getElementById('md-root')
  if (!root) return html

  const pres = [...root.querySelectorAll('pre')]
  await Promise.all(
    pres.map(async (pre) => {
      const code = pre.querySelector('code')
      if (!code) return
      const lang = langFromCodeClass(code.className)
      const source = code.textContent ?? ''
      if (!source.trim()) return
      try {
        const highlighted = await highlightCode(source, resolveShikiLang(lang), theme)
        const holder = doc.createElement('div')
        holder.innerHTML = highlighted
        const replacement = holder.firstElementChild
        if (replacement) pre.replaceWith(replacement)
      } catch {
        /* keep marked output */
      }
    }),
  )

  return root.innerHTML
}
