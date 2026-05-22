const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i
const URL_RE = /^https?:\/\/\S+$/i

/**
 * @param {string} text
 * @returns {string | null} href for mailto/http(s) cells, else null
 */
export function cellLinkHref(text) {
  const t = text.trim()
  if (!t) return null
  if (EMAIL_RE.test(t)) return `mailto:${t}`
  if (URL_RE.test(t)) return t
  return null
}
