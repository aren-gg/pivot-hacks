'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api';

function expiryLabel(iso) {
  if (!iso) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(`${iso}T00:00:00`);
  const days = Math.round((exp - today) / 86400000);
  if (days < 0) return { text: `expired ${-days}d ago`, tone: 'text-rustDark' };
  if (days === 0) return { text: 'expires today', tone: 'text-rustDark' };
  if (days <= 3) return { text: `expires in ${days}d`, tone: 'text-rustDark' };
  return { text: `expires ${iso}`, tone: 'text-muted' };
}

export default function Fridge() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ name: '', quantity: '', unit: '', expires_at: '' });
  const [busy, setBusy] = useState(false);
  const [lastDeleted, setLastDeleted] = useState(null); // { item, timer }
  const [editingId, setEditingId] = useState(null);
  const [editDate, setEditDate] = useState('');
  const editingRef = useRef(null);
  editingRef.current = editingId;

  function load() {
    api
      .getFridge()
      .then((d) => setItems(d.items))
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    load();
    // Poll so receipt scans / Discord updates show up without a manual refresh,
    // but pause while the user is editing an expiry so it isn't clobbered.
    const t = setInterval(() => {
      if (editingRef.current === null) load();
    }, 8000);
    return () => clearInterval(t);
  }, []);

  async function addItem(e) {
    e.preventDefault();
    const name = form.name.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.addFridgeItem({
        name,
        quantity: form.quantity === '' ? 1 : Number(form.quantity),
        unit: form.unit.trim(),
        expires_at: form.expires_at || null
      });
      setForm({ name: '', quantity: '', unit: '', expires_at: '' });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(item) {
    setItems((prev) => (prev ? prev.filter((it) => it.id !== item.id) : prev));
    // Keep the removed item around so it can be restored.
    if (lastDeleted?.timer) clearTimeout(lastDeleted.timer);
    const timer = setTimeout(() => setLastDeleted(null), 7000);
    setLastDeleted({ item, timer });
    try {
      await api.removeFridgeItem(item.id);
    } catch {
      load();
    }
  }

  async function undoRemove() {
    if (!lastDeleted) return;
    const { item, timer } = lastDeleted;
    if (timer) clearTimeout(timer);
    setLastDeleted(null);
    try {
      // Re-create the item with its original fields (a new id is assigned).
      await api.addFridgeItem({
        name: item.name,
        quantity: item.quantity ?? 1,
        unit: item.unit || '',
        expires_at: item.expires_at || null
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  function startEditExpiry(item) {
    setEditingId(item.id);
    setEditDate(item.expires_at || '');
  }

  async function saveExpiry(id) {
    const value = editDate || null;
    // Optimistic update
    setItems((prev) => (prev ? prev.map((it) => (it.id === id ? { ...it, expires_at: value } : it)) : prev));
    setEditingId(null);
    try {
      await api.updateFridgeItem(id, { expires_at: value });
    } catch (err) {
      setError(err.message);
      load();
    }
  }

  if (error) {
    return <div className="rounded-xl2 bg-card border border-rust px-6 py-4 text-rustDark">Couldn't load fridge: {error}</div>;
  }
  if (!items) return <p className="text-muted">Loading your fridge…</p>;

  // Sort soon-to-expire first; undated last.
  const sorted = [...items].sort((a, b) => {
    const ax = a.expires_at || '9999-12-31';
    const bx = b.expires_at || '9999-12-31';
    return ax.localeCompare(bx);
  });

  return (
    <div className="space-y-4">
      {lastDeleted && (
        <div className="flex items-center justify-between rounded-xl2 bg-ink text-white px-5 py-3">
          <span>
            Removed <strong>{lastDeleted.item.name}</strong>.
          </span>
          <button
            onClick={undoRemove}
            className="font-semibold underline underline-offset-2 hover:text-pill"
          >
            Undo
          </button>
        </div>
      )}

      <form onSubmit={addItem} className="flex flex-wrap gap-2">
        <input
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Item name"
          className="flex-1 min-w-[8rem] rounded-xl2 border border-line bg-card px-4 py-2 text-ink"
        />
        <input
          type="number"
          min="0"
          step="0.5"
          value={form.quantity}
          onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))}
          placeholder="Qty"
          className="w-20 rounded-xl2 border border-line bg-card px-3 py-2 text-ink"
        />
        <input
          value={form.unit}
          onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))}
          placeholder="Unit"
          className="w-24 rounded-xl2 border border-line bg-card px-3 py-2 text-ink"
        />
        <input
          type="date"
          value={form.expires_at}
          onChange={(e) => setForm((f) => ({ ...f, expires_at: e.target.value }))}
          className="rounded-xl2 border border-line bg-card px-3 py-2 text-ink"
        />
        <button
          type="submit"
          disabled={busy || !form.name.trim()}
          className="px-5 py-2 rounded-full bg-rust text-white font-medium hover:bg-rustDark transition-colors disabled:opacity-50"
        >
          Add
        </button>
      </form>

      {!sorted.length ? (
        <div className="rounded-xl2 bg-card border border-line px-6 py-10 text-center text-muted">
          Your fridge is empty. Add an item above, scan a receipt in Discord, or buy groceries.
        </div>
      ) : (
        <div className="rounded-xl2 bg-card border border-line px-6 py-2 divide-y divide-line">
          {sorted.map((item) => {
            const exp = expiryLabel(item.expires_at);
            return (
              <div key={item.id} className="flex items-center gap-3 py-3">
                <span className="flex-1 text-ink">{item.name}</span>
                <span className="text-sm text-muted w-24 text-right">
                  {item.quantity} {item.unit}
                </span>
                {editingId === item.id ? (
                  <span className="flex items-center gap-1">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(e) => setEditDate(e.target.value)}
                      className="rounded-xl2 border border-line bg-cream px-2 py-1 text-sm text-ink"
                    />
                    <button
                      onClick={() => saveExpiry(item.id)}
                      className="text-sm text-rust hover:text-rustDark font-medium px-1"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="text-sm text-muted hover:text-ink px-1"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => startEditExpiry(item)}
                    title="Click to edit expiration date"
                    className={`text-sm w-40 text-right underline decoration-dotted underline-offset-2 hover:text-rust ${
                      exp ? exp.tone : 'text-muted'
                    }`}
                  >
                    {exp ? exp.text : 'set expiry'}
                  </button>
                )}
                <button
                  onClick={() => removeItem(item)}
                  aria-label={`Remove ${item.name}`}
                  className="text-muted hover:text-rustDark px-1"
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
