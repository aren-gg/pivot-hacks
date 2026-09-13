'use client';

import { useEffect, useState } from 'react';
import { api } from '../lib/api';

const EXPERIENCE = ['beginner', 'intermediate', 'advanced'];

export default function Preferences() {
  const [prefs, setPrefs] = useState(null);
  const [status, setStatus] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .getPreferences()
      .then((d) => setPrefs(d.preferences))
      .catch((e) => setStatus({ type: 'error', msg: e.message }));
  }, []);

  if (!prefs) {
    return <p className="text-muted">Loading preferences…</p>;
  }

  function update(field, value) {
    setPrefs((p) => ({ ...p, [field]: value }));
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const payload = {
        lifestyle: prefs.lifestyle || '',
        cooking_experience: prefs.cooking_experience || 'intermediate',
        max_price_per_serving:
          prefs.max_price_per_serving === '' || prefs.max_price_per_serving == null
            ? null
            : Number(prefs.max_price_per_serving),
        max_total_minutes:
          prefs.max_total_minutes === '' || prefs.max_total_minutes == null
            ? null
            : Number(prefs.max_total_minutes)
      };
      const d = await api.savePreferences(payload);
      setPrefs(d.preferences);
      setStatus({ type: 'ok', msg: 'Saved. Regenerate a week to apply your new preferences.' });
    } catch (e) {
      setStatus({ type: 'error', msg: e.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl2 bg-card border border-line px-6 py-6 space-y-5">
      <div>
        <label className="block text-sm font-medium text-ink mb-1">Cooking experience</label>
        <div className="flex gap-2">
          {EXPERIENCE.map((lvl) => (
            <button
              key={lvl}
              onClick={() => update('cooking_experience', lvl)}
              className={`px-4 py-2 rounded-full text-sm capitalize border transition-colors ${
                prefs.cooking_experience === lvl
                  ? 'bg-rust text-white border-rust'
                  : 'bg-card text-ink border-line hover:border-rust'
              }`}
            >
              {lvl}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1">Budget per serving (USD)</label>
        <input
          type="number"
          min="1"
          step="0.5"
          placeholder="no limit"
          value={prefs.max_price_per_serving ?? ''}
          onChange={(e) => update('max_price_per_serving', e.target.value)}
          className="w-40 rounded-xl2 border border-line bg-cream px-3 py-2 text-ink"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1">Max time per meal (minutes)</label>
        <input
          type="number"
          min="5"
          step="5"
          placeholder="no limit"
          value={prefs.max_total_minutes ?? ''}
          onChange={(e) => update('max_total_minutes', e.target.value)}
          className="w-40 rounded-xl2 border border-line bg-cream px-3 py-2 text-ink"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-ink mb-1">Lifestyle &amp; dietary needs</label>
        <textarea
          rows={3}
          placeholder="e.g. vegetarian, high-protein, no shellfish, mostly Mediterranean"
          value={prefs.lifestyle ?? ''}
          onChange={(e) => update('lifestyle', e.target.value)}
          className="w-full rounded-xl2 border border-line bg-cream px-3 py-2 text-ink"
        />
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={save}
          disabled={saving}
          className="px-5 py-2 rounded-full bg-rust text-white font-medium hover:bg-rustDark transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save preferences'}
        </button>
        {status && (
          <span className={`text-sm ${status.type === 'ok' ? 'text-muted' : 'text-rustDark'}`}>
            {status.msg}
          </span>
        )}
      </div>
    </div>
  );
}
