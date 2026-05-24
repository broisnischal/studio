const URL_RE = /^https?:\/\/\S+$/i
const IMAGE_EXT_RE = /\.(jpe?g|png|gif|webp|svg|avif|bmp|ico)(\?.*)?$/i
const PDF_EXT_RE = /\.pdf(\?.*)?$/i

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

/**
 * @param {string | null} href
 * @returns {'image' | 'pdf' | 'link' | null}
 */
export function cellUrlType(href) {
  if (!href) return null
  let path = href
  try { path = new URL(href).pathname } catch { /* use raw href */ }
  if (IMAGE_EXT_RE.test(path)) return 'image'
  if (PDF_EXT_RE.test(path)) return 'pdf'
  return 'link'
}
