'use client';

import { useState } from 'react';

export default function MealRow({ meal, isFirst, currencySymbol = '$' }) {
  const [open, setOpen] = useState(false);

  return (
    <div className={isFirst ? '' : 'border-t border-line'}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left py-4 flex items-start justify-between gap-4"
        aria-expanded={open}
      >
        <div>
          <p className="text-xs tracking-wide text-muted font-medium">
            {meal.mealType === 'lunch' ? 'LUNCH' : 'DINNER'}
          </p>
          <p className="text-lg font-semibold text-ink mt-0.5">{meal.title}</p>
          {meal.subtitle ? <p className="text-sm italic text-muted mt-0.5">{meal.subtitle}</p> : null}
          {(meal.totalMinutes || meal.difficulty) && (
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              {meal.totalMinutes ? (
                <span className="text-xs text-muted">
                  ⏱ {meal.totalMinutes} min
                  {meal.prepMinutes != null && meal.cookMinutes != null
                    ? ` (${meal.prepMinutes} prep · ${meal.cookMinutes} cook)`
                    : ''}
                </span>
              ) : null}
              {meal.difficulty ? (
                <span className="text-xs capitalize bg-pill text-ink rounded-full px-2 py-0.5">
                  {meal.difficulty}
                </span>
              ) : null}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0 mt-0.5">
          {meal.price ? (
            <span className="text-sm bg-pill text-ink rounded-full px-3 py-1">{currencySymbol}{Number(meal.price).toFixed(2)}</span>
          ) : null}
          <span className={`text-muted transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
        </div>
      </button>

      {open && (
        <div className="pb-4 -mt-2 text-sm text-ink/90 space-y-2">
          {meal.needsDefrost && (
            <p className="text-rustDark">🧊 Defrost {meal.protein} the night before.</p>
          )}
          {meal.ingredients?.length ? (
            <ul className="list-disc list-inside text-muted">
              {meal.ingredients.map((ing, i) => (
                <li key={i}>
                  {ing.quantity} {ing.unit} {ing.name}
                </li>
              ))}
            </ul>
          ) : null}
          {meal.recipe ? <p>{meal.recipe}</p> : null}
        </div>
      )}
    </div>
  );
}
