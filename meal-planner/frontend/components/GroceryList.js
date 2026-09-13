'use client';

import { useState } from 'react';
import { api } from '../lib/api';

export default function GroceryList({ items: initialItems, total = 0, currencySymbol = '$' }) {
  const [items, setItems] = useState(initialItems);

  async function toggle(id) {
    const next = items.map((it) => (it.id === id ? { ...it, checked: it.checked ? 0 : 1 } : it));
    setItems(next);
    const item = next.find((it) => it.id === id);
    try {
      await api.setGroceryChecked(id, !!item.checked);
    } catch {
      // revert on failure
      setItems(items);
    }
  }

  if (!items.length) {
    return (
      <div className="rounded-xl2 bg-card border border-line px-6 py-10 text-center text-muted">
        Nothing needed this week — your fridge already covers the plan.
      </div>
    );
  }

  const money = (n) => `${currencySymbol}${Number(n).toFixed(2)}`;

  return (
    <div className="rounded-xl2 bg-card border border-line px-6 py-2 divide-y divide-line">
      {items.map((item) => (
        <label key={item.id} className="flex items-center gap-3 py-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={!!item.checked}
            onChange={() => toggle(item.id)}
            className="h-5 w-5 accent-rust rounded"
          />
          <span className={`flex-1 ${item.checked ? 'line-through text-muted' : 'text-ink'}`}>
            {item.name}
            {item.package_size ? <span className="text-muted text-sm"> · {item.package_size}</span> : null}
          </span>
          <span className="text-sm text-muted w-24 text-right">
            {item.quantity} {item.unit}
          </span>
          <span className={`text-sm w-20 text-right ${item.checked ? 'text-muted' : 'text-ink'}`}>
            {item.price != null ? money(item.price) : '—'}
          </span>
        </label>
      ))}

      <div className="flex items-center justify-between py-4 font-semibold text-ink">
        <span>Estimated total</span>
        <span>{money(total)}</span>
      </div>
    </div>
  );
}
