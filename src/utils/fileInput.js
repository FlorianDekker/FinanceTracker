// Bestanden uit een <input type="file"> veilig overnemen.
//
// iOS Safari trekt de toegang tot een gekozen bestand in zodra het veld wordt
// geleegd (`input.value = ''`) of opnieuw gerenderd. Lees je het bestand daarna
// pas, dan krijg je "The object can not be found here". Daarom kopiëren we de
// inhoud eerst naar het geheugen en maken we het veld pas daarna leeg, zodat
// hetzelfde bestand later opnieuw gekozen kan worden.

async function readBuffer(file) {
  try {
    return await file.arrayBuffer()
  } catch {
    // Oudere WebKit-versies: FileReader als vangnet
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = () => reject(reader.error ?? new Error('Bestand kon niet worden gelezen'))
      reader.readAsArrayBuffer(file)
    })
  }
}

/**
 * Neemt alle gekozen bestanden over als in-memory kopieën en leegt het veld.
 * @param {Event} e change-event van een <input type="file">
 * @returns {Promise<File[]>}
 */
export async function takeFiles(e) {
  const input = e.target
  const originals = Array.from(input?.files ?? [])
  const copies = []
  try {
    for (const f of originals) {
      const buf = await readBuffer(f)
      copies.push(new File([buf], f.name, { type: f.type, lastModified: f.lastModified }))
    }
  } catch (err) {
    const msg = String(err?.message ?? err)
    throw new Error(
      /not be found|NotFound/i.test(msg)
        ? 'Het bestand kon niet worden gelezen. Staat het in iCloud? Download het eerst (geen wolkje in Bestanden) of bewaar het onder "Op mijn iPhone" en probeer opnieuw.'
        : `Het bestand kon niet worden gelezen: ${msg}`
    )
  } finally {
    if (input) input.value = ''
  }
  return copies
}

/** Eén bestand; null als er niets gekozen is. */
export async function takeFile(e) {
  const [file] = await takeFiles(e)
  return file ?? null
}
