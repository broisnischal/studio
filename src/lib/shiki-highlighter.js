/** @typedef {'light' | 'dark'} ThemeId */

import { bundledLanguages, createHighlighter } from 'shiki'

const THEME_IDS = ['vitesse-light', 'vitesse-dark']

const LANG_IDS = [
  'sql',
  'json',
  'javascript',
  'typescript',
  'python',
  'bash',
  'shell',
  'yaml',
  'xml',
  'markdown',
  'plaintext',
]

let highlighterPromise = null

function loadHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: THEME_IDS,
      langs: LANG_IDS.map((id) => bundledLanguages[id]).filter(Boolean),
    })
  }
  return highlighterPromise
}

/** @param {ThemeId} theme */
function shikiTheme(theme) {
  return theme === 'light' ? 'vitesse-light' : 'vitesse-dark'
}

/** @param {string} [lang] */
export function resolveShikiLang(lang) {
  const id = String(lang ?? '')
    .toLowerCase()
    .trim()
  const aliases = {
    js: 'javascript',
    ts: 'typescript',
    py: 'python',
    sh: 'bash',
    shell: 'bash',
    yml: 'yaml',
    postgres: 'sql',
    postgresql: 'sql',
    psql: 'sql',
  }
  const normalized = aliases[id] ?? id
  if (normalized in bundledLanguages) return normalized
  return 'plaintext'
}

/**
 * @param {string} code
 * @param {string} [lang]
 * @param {ThemeId} [theme]
 */
export async function highlightCode(code, lang, theme = 'dark') {
  const highlighter = await loadHighlighter()
  const resolved = resolveShikiLang(lang)
  try {
    return highlighter.codeToHtml(code, {
      lang: resolved,
      theme: shikiTheme(theme),
    })
  } catch {
    return highlighter.codeToHtml(code, {
      lang: 'plaintext',
      theme: shikiTheme(theme),
    })
  }
}
