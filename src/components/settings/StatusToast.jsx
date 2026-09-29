// Kleine statusmelding die op meerdere Instellingen-subschermen wordt
// hergebruikt (backup, CSV-import, declaraties omzetten, AI-acties, ...).
// Elk subscherm houdt zijn eigen { success | error } state bij en geeft die
// hier door; de melding verdwijnt door erop te tikken.
export function StatusToast({ status, onDismiss }) {
  if (!status || status.loading) return null
  return (
    <div
      className={`mx-4 mt-4 rounded-xl px-4 py-3 text-sm ${
        status.error ? 'bg-red/20 text-red border border-red' : 'bg-green/20 text-green border border-green'
      }`}
      onClick={onDismiss}
    >
      {status.error ?? status.success}
      <span className="float-right text-xs opacity-60">tik om te sluiten</span>
    </div>
  )
}
