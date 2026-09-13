'use client';

function formatRange(weekStart) {
  const start = new Date(`${weekStart}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const opts = { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' };
  return `${start.toLocaleDateString('en-US', opts)} – ${end.toLocaleDateString('en-US', opts)}`;
}

export default function WeekHeader({ label, weekStart, onPrev, onNext, canPrev = true, canNext = true }) {
  const edgeBtn =
    'h-11 w-11 shrink-0 rounded-full border border-line bg-card text-ink flex items-center justify-center transition-colors';
  const enabled = 'hover:border-rust';
  const disabled = 'opacity-30 cursor-not-allowed';

  return (
    <div className="flex items-center justify-between mb-8">
      <button
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Previous week"
        className={`${edgeBtn} ${canPrev ? enabled : disabled}`}
      >
        ←
      </button>

      <div className="text-center">
        <h1 className="text-2xl font-semibold text-rust">{label}</h1>
        <p className="text-sm text-muted mt-1">{formatRange(weekStart)}</p>
      </div>

      <button
        onClick={onNext}
        disabled={!canNext}
        aria-label="Next week"
        className={`${edgeBtn} ${canNext ? enabled : disabled}`}
      >
        →
      </button>
    </div>
  );
}
