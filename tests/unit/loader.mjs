// Laat Node de extensieloze imports van de Vite-bronnen oplossen (.js / .jsx)
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { dirname, resolve as res } from 'node:path'

const STUB = new URL('./learningStub.mjs', import.meta.url).href

export async function resolve(specifier, context, next) {
  if (specifier.endsWith('utils/merchantLearning') && context.parentURL?.endsWith('/db/db.js')) {
    return next(STUB, context)
  }
  if (specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier)) {
    const base = dirname(fileURLToPath(context.parentURL))
    for (const ext of ['.js', '.jsx', '/index.js']) {
      const p = res(base, specifier + ext)
      if (existsSync(p)) return next(pathToFileURL(p).href, context)
    }
  }
  return next(specifier, context)
}

// Node kan geen JSX parsen; sucrase (uit de node_modules van het project)
// vertaalt .jsx-bronnen on the fly zodat hooks getest kunnen worden.
const { transform } = await import('sucrase')

export async function load(url, context, next) {
  if (url.endsWith('.jsx')) {
    const { readFileSync } = await import('node:fs')
    const src = readFileSync(fileURLToPath(url), 'utf8')
    const { code } = transform(src, { transforms: ['jsx'], jsxRuntime: 'automatic', filePath: fileURLToPath(url) })
    return { format: 'module', shortCircuit: true, source: code }
  }
  return next(url, context)
}
