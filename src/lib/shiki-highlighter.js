/** @typedef {'light' | 'dark'} ThemeId */

let highlighterPromise = null

function loadHighlighter() {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-dark', 'github-light'],
        langs: ['json', 'plaintext'],
      }),
    )
  }
  return highlighterPromise
}

/** @param {ThemeId} theme */
function shikiTheme(theme) {
  return theme === 'light' ? 'github-light' : 'github-dark'
}

/**
 * @param {string} code
 * @param {'json' | 'plaintext'} lang
 * @param {ThemeId} [theme]
 */
export async function highlightCode(code, lang, theme = 'dark') {
  const highlighter = await loadHighlighter()
  return highlighter.codeToHtml(code, {
    lang,
    theme: shikiTheme(theme),
  })
}
