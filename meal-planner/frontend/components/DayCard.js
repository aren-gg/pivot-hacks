import MealRow from './MealRow';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function formatDate(iso) {
  const d = new Date(`${iso}T00:00:00Z`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function DayCard({ day }) {
  const dayName = DAY_NAMES[new Date(`${day.date}T00:00:00Z`).getUTCDay()];

  return (
    <div
      className={`rounded-xl2 bg-card px-6 pb-1 pt-5 mb-5 border ${
        day.isToday ? 'border-rust' : 'border-line'
      }`}
    >
      <div className="flex items-center gap-3 mb-1">
        <h2 className="text-xl font-semibold text-ink">{dayName}</h2>
        <span className="text-muted">{formatDate(day.date)}</span>
        {day.isToday && (
          <span className="text-xs font-semibold tracking-wide bg-rust text-white rounded-full px-2.5 py-1">
            TODAY
          </span>
        )}
      </div>

      {day.meals.length ? (
        day.meals
          .slice()
          .sort((a, b) => (a.mealType === 'lunch' ? -1 : 1))
          .map((meal, i) => <MealRow key={meal.id ?? i} meal={meal} isFirst={i === 0} />)
      ) : (
        <p className="py-4 text-sm text-muted">No meals planned yet.</p>
      )}
    </div>
  );
}
