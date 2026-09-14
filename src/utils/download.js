/**
 * Een bestand aanbieden aan de gebruiker.
 *
 * Op iOS/Safari eerst via het deelmenu: alleen zo kan het bestand naar
 * Bestanden/iCloud Drive of naar Mail. Lukt dat niet (of is het een desktop),
 * dan een gewone download. Wordt het deelmenu weggetikt, dan gebeurt er niets
 * meer — de aanroeper hoort dat aan `method: 'cancelled'`.
 */
export async function downloadFile(blob, fileName, { title } = {}) {
  if (typeof File !== 'undefined' && typeof navigator !== 'undefined' && navigator.canShare) {
    const file = new File([blob], fileName, { type: blob.type || 'application/octet-stream' })
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: title ?? fileName })
        return { method: 'share', fileName }
      } catch (err) {
        if (err?.name === 'AbortError') return { method: 'cancelled', fileName }
        // Delen kan ook stukgaan op een toestel dat het wél belooft; dan downloaden.
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
  return { method: 'download', fileName }
}
