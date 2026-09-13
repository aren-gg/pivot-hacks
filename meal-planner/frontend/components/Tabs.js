'use client';

export default function Tabs({ active, onChange }) {
  const tabs = [
    { id: 'week', label: 'This Week' },
    { id: 'grocery', label: 'Grocery List' },
    { id: 'fridge', label: 'Fridge' },
    { id: 'preferences', label: 'Preferences' }
  ];

  return (
    <div className="flex border-b border-line mb-6">
      {tabs.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={`px-1 mr-8 pb-3 text-base font-medium border-b-2 -mb-px transition-colors ${
            active === t.id ? 'text-rust border-rust' : 'text-muted border-transparent hover:text-ink'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
