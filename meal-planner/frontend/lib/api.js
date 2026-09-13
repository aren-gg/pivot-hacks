const BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function patch(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`);
}

async function put(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`PUT ${path} failed: ${res.status} ${t}`);
  }
  return res.json();
}

export function addDaysISO(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function getCurrentWeekStart() {
  const d = new Date();
  const utc = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  utc.setUTCDate(utc.getUTCDate() - utc.getUTCDay());
  return utc.toISOString().slice(0, 10);
}

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`POST ${path} failed: ${res.status} ${t}`);
  }
  return res.json();
}

async function del(path) {
  const res = await fetch(`${BASE}${path}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`DELETE ${path} failed: ${res.status}`);
}

export const api = {
  getWeekPlan: (weekStart) => get(`/api/plan/${weekStart}`),
  getGroceryList: (weekStart) => get(`/api/plan/${weekStart}/grocery-list`),
  setGroceryChecked: (id, checked) => patch(`/api/plan/grocery-list/${id}`, { checked }),
  addGroceryItem: (weekStart, item) => post(`/api/plan/${weekStart}/grocery-list`, item),
  removeGroceryItem: (id) => del(`/api/plan/grocery-list/${id}`),
  getFridge: () => get('/api/fridge'),
  addFridgeItem: (item) => post('/api/fridge', item),
  removeFridgeItem: (id) => del(`/api/fridge/${id}`),
  getPreferences: () => get('/api/preferences'),
  savePreferences: (prefs) => put('/api/preferences', prefs)
};
