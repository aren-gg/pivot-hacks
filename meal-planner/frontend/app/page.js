'use client';

import { useEffect, useState } from 'react';
import WeekHeader from '../components/WeekHeader';
import Tabs from '../components/Tabs';
import DayCard from '../components/DayCard';
import GroceryList from '../components/GroceryList';
import Preferences from '../components/Preferences';
import { api, addDaysISO, getCurrentWeekStart } from '../lib/api';

export default function Home() {
  const currentWeek = getCurrentWeekStart();
  const minWeek = addDaysISO(currentWeek, -7); // previous week
  const maxWeek = addDaysISO(currentWeek, 7); // next week

  const [weekStart, setWeekStart] = useState(currentWeek);
  const [tab, setTab] = useState('week');
  const [plan, setPlan] = useState(null);
  const [groceryList, setGroceryList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([api.getWeekPlan(weekStart), api.getGroceryList(weekStart)])
      .then(([planData, groceryData]) => {
        if (cancelled) return;
        setPlan(planData);
        setGroceryList(groceryData);
      })
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [weekStart]);

  return (
    <main className="min-h-screen bg-cream">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <WeekHeader
          label={plan?.label || 'Loading…'}
          weekStart={weekStart}
          canPrev={weekStart > minWeek}
          canNext={weekStart < maxWeek}
          onPrev={() => setWeekStart((w) => (w > minWeek ? addDaysISO(w, -7) : w))}
          onNext={() => setWeekStart((w) => (w < maxWeek ? addDaysISO(w, 7) : w))}
        />

        <Tabs active={tab} onChange={setTab} />

        {tab === 'preferences' && <Preferences />}

        {tab !== 'preferences' && error && (
          <div className="rounded-xl2 bg-card border border-rust px-6 py-4 text-rustDark mb-5">
            Couldn't reach the planner API: {error}. Is the backend running and{' '}
            <code>NEXT_PUBLIC_API_URL</code> set correctly?
          </div>
        )}

        {tab !== 'preferences' && loading && !error && <p className="text-muted">Loading your plan…</p>}

        {!loading && !error && tab === 'week' && (
          <>
            {!plan.hasPlan && (
              <div className="rounded-xl2 bg-card border border-line px-6 py-6 mb-5 text-muted">
                No plan generated yet for this week. Run{' '}
                <code>/plan-generate</code> in Discord, or POST to{' '}
                <code>/api/plan/generate</code>.
              </div>
            )}
            {plan.days.map((day) => (
              <DayCard key={day.date} day={day} currencySymbol={plan.currency?.symbol || '$'} />
            ))}
          </>
        )}

        {!loading && !error && tab === 'grocery' && (
          <GroceryList
            items={groceryList.items}
            total={groceryList.total || 0}
            currencySymbol={groceryList.currency?.symbol || '$'}
          />
        )}
      </div>
    </main>
  );
}
