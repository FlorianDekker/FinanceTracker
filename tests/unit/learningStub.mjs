// fake-indexeddb commit de db.on('ready')-transactie voordat bootstrapFromHistory
// klaar is (dynamische import = macrotask), waardoor db.open() blijft hangen.
// In de tests vervangen we alleen die bootstrap door een no-op; de loader stuurt
// de import van db/db.js hierheen.
export * from '../../src/utils/merchantLearning.js'
export async function bootstrapFromHistory() {}
