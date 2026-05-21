/** @returns {'windows' | 'macos' | 'linux'} */
export function detectOs() {
  if (typeof navigator === 'undefined') return 'linux'

  const ua = navigator.userAgent ?? ''
  const platform = navigator.userAgentData?.platform ?? navigator.platform ?? ''

  if (/Win/i.test(platform) || /Windows/i.test(ua)) return 'windows'
  if (/Mac/i.test(platform) || /Macintosh|Mac OS/i.test(ua)) return 'macos'
  return 'linux'
}

/** Sets `data-os` on `<html>` for OS-specific CSS (e.g. Windows scrollbars). */
export function installPlatformClass() {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.os = detectOs()
}
