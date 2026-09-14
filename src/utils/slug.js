// Slug-generatie voor categorie- en subcategorie-sleutels.
// Een key is onveranderlijk zodra hij bestaat: hernoemen wijzigt alleen het label.

export function slugify(label) {
  const base = String(label ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')   // diakrieten weg
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
    .replace(/_+$/g, '')
  return base || 'categorie'
}

// Geeft een slug die nog niet in `taken` voorkomt; bij botsing volgt _2, _3, ...
export function uniqueSlug(label, taken) {
  const takenSet = taken instanceof Set ? taken : new Set(taken ?? [])
  const base = slugify(label)
  if (!takenSet.has(base)) return base
  let i = 2
  while (takenSet.has(`${base}_${i}`)) i++
  return `${base}_${i}`
}
