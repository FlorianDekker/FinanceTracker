// Hangt de loader in de module-resolutie van Node. Gebruik:
//   node --import ./tests/unit/register.mjs tests/unit/<naam>.test.mjs
import { register } from 'node:module'
register('./loader.mjs', import.meta.url)
