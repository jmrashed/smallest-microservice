import type { SagaEvent } from '../lib/api'

const SERVICE_LABELS: Record<string, string> = {
  node: 'Node',
  python: 'Python',
  go: 'Go',
  php: 'PHP',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  } as Intl.DateTimeFormatOptions)
}

export function OrderTimeline({ events, isPending }: { events: SagaEvent[]; isPending: boolean }) {
  if (events.length === 0) {
    return <p className="py-2 pl-4 text-xs text-gray-500">Loading timeline...</p>
  }

  return (
    <ol className="space-y-1 py-2 pl-4 text-xs text-gray-700">
      {events.map((e) => (
        <li key={e.id} className="font-mono">
          <span className="font-semibold">{SERVICE_LABELS[e.source_service] ?? e.source_service}</span>
          {' → published → '}
          <span>{e.event}</span>
          {' → '}
          <span className="font-semibold">{SERVICE_LABELS[e.dest_service] ?? e.dest_service}</span>
          <span className="ml-2 text-gray-400">{formatTime(e.occurred_at)}</span>
        </li>
      ))}
      {isPending && <li className="italic text-gray-400">waiting for next step...</li>}
    </ol>
  )
}
