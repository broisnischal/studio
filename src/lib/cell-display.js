const URL_RE = /^https?:\/\/\S+$/i

/**
 * @param {string} text
 * @returns {string | null} href for http(s) cells only (emails stay plain text)
 */
export function cellLinkHref(text) {
  const t = text.trim()
  if (!t) return null
  if (URL_RE.test(t)) return t
  return null
}
