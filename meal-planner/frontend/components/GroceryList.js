'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

export default function GroceryList({ items: initialItems, total = 0, currencySymbol = '$', weekStart, onChanged, onItemChecked }) {
  const [items, setItems] = useState(initialItems);
  const [newName, setNewName] = useState('');
  const [adding, setAdding] = useState(false);
  const [lastDeleted, setLastDeleted] = useState(null); // { item, timer }

  useEffect(() => {
    setItems(initialItems);
  }, [initialItems]);

  async function toggle(id) {
    const next = items.map((it) => (it.id === id ? { ...it, checked: it.checked ? 0 : 1 } : it));
    setItems(next);
    const item = next.find((it) => it.id === id);
    try {
      await api.setGroceryChecked(id, !!item.checked);
      // Update parent state IN PLACE (do not recompute the list — recomputing
      // would subtract the just-added fridge stock and make the item vanish).
      onItemChecked && onItemChecked(id, !!item.checked);
    } catch {
      setItems(items);
    }
  }

  async function addItem(e) {
    e.preventDefault();
    const name = newName.trim();
    if (!name || !weekStart) return;
    setAdding(true);
    try {
      await api.addGroceryItem(weekStart, { name, quantity: 1, unit: '' });
      setNewName('');
      onChanged && (await onChanged());
    } catch (err) {
      console.error(err);
    } finally {
      setAdding(false);
    }
  }

  async function remove(item) {
    setItems((prev) => prev.filter((it) => it.id !== item.id));
    if (lastDeleted?.timer) clearTimeout(lastDeleted.timer);
    const timer = setTimeout(() => setLastDeleted(null), 7000);
    setLastDeleted({ item, timer });
    try {
      await api.removeGroceryItem(item.id);
      onChanged && (await onChanged());
    } catch {
      onChanged && onChanged();
    }
  }

  async function undoRemove() {
    if (!lastDeleted) return;
    const { item, timer } = lastDeleted;
    if (timer) clearTimeout(timer);
    setLastDeleted(null);
    if (!weekStart) return;
    try {
      await api.addGroceryItem(weekStart, {
        name: item.name,
        quantity: item.quantity ?? 1,
        unit: item.unit || ''
      });
      onChanged && (await onChanged());
    } catch (err) {
      console.error(err);
    }
  }

  const money = (n) => `${currencySymbol}${Number(n).toFixed(2)}`;

  return (
    <div className="space-y-4">
      {lastDeleted && (
        <div className="flex items-center justify-between rounded-xl2 bg-ink text-white px-5 py-3">
          <span>
            Removed <strong>{lastDeleted.item.name}</strong> from the list.
          </span>
          <button
            onClick={undoRemove}
            className="font-semibold underline underline-offset-2 hover:text-pill"
          >
            Undo
          </button>
        </div>
      )}

      <form onSubmit={addItem} className="flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Add an item to buy…"
          className="flex-1 rounded-xl2 border border-line bg-card px-4 py-2 text-ink"
        />
        <button
          type="submit"
          disabled={adding || !newName.trim()}
          className="px-5 py-2 rounded-full bg-rust text-white font-medium hover:bg-rustDark transition-colors disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {!items.length ? (
        <div className="rounded-xl2 bg-card border border-line px-6 py-10 text-center text-muted">
          Nothing on the list yet — add an item above, or generate a plan.
        </div>
      ) : (
        <div className="rounded-xl2 bg-card border border-line px-6 py-2 divide-y divide-line">
          {items.map((item) => (
            <div key={item.id} className="flex items-center gap-3 py-3">
              <input
                type="checkbox"
                checked={!!item.checked}
                onChange={() => toggle(item.id)}
                className="h-5 w-5 accent-rust rounded cursor-pointer"
              />
              <span className={`flex-1 ${item.checked ? 'line-through text-muted' : 'text-ink'}`}>
                {item.name}
                {item.package_size ? <span className="text-muted text-sm"> · {item.package_size}</span> : null}
                {item.source === 'manual' ? <span className="text-muted text-xs"> · added</span> : null}
              </span>
              <span className="text-sm text-muted w-20 text-right">
                {item.quantity} {item.unit}
              </span>
              <span className={`text-sm w-16 text-right ${item.checked ? 'text-muted' : 'text-ink'}`}>
                {item.price != null ? money(item.price) : '—'}
              </span>
              <button
                onClick={() => remove(item)}
                aria-label={`Remove ${item.name}`}
                className="text-muted hover:text-rustDark px-1"
              >
                ×
              </button>
            </div>
          ))}

          <div className="flex items-center justify-between py-4 font-semibold text-ink">
            <span>Estimated total</span>
            <span>{money(total)}</span>
          </div>
        </div>
      )}
    </div>
  );
}
