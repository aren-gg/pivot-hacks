const BASE = process.env.API_BASE_URL || 'http://localhost:4000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${options.method || 'GET'} ${path} -> ${res.status}: ${text}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

module.exports = {
  parseMessage: (text) => request('/api/parse', { method: 'POST', body: JSON.stringify({ text }) }),
  addFridgeItem: (item) => request('/api/fridge', { method: 'POST', body: JSON.stringify(item) }),
  removeFridgeItem: (name) =>
    request('/api/fridge/remove-by-name', { method: 'POST', body: JSON.stringify({ name }) }),
  getFridge: () => request('/api/fridge'),
  uploadReceipt: (imageBase64, mimeType) =>
    request('/api/receipt', { method: 'POST', body: JSON.stringify({ imageBase64, mimeType }) }),
  voiceFeedback: (audioBase64, mimeType) =>
    request('/api/voice-feedback', { method: 'POST', body: JSON.stringify({ audioBase64, mimeType }) }),
  getPreferences: () => request('/api/preferences'),
  savePreferences: (prefs) => request('/api/preferences', { method: 'PUT', body: JSON.stringify(prefs) }),
  addGrocery: (item) => request('/api/groceries', { method: 'POST', body: JSON.stringify(item) }),
  addCraving: (text) => request('/api/cravings', { method: 'POST', body: JSON.stringify({ text }) }),
  getCurrentPlan: () => request('/api/plan/current'),
  swapMeal: (weekStart, dayDate, mealType) =>
    request(`/api/plan/${weekStart}/swap`, { method: 'POST', body: JSON.stringify({ dayDate, mealType }) }),
  generatePlan: (weekStart) =>
    request('/api/plan/generate', { method: 'POST', body: JSON.stringify(weekStart ? { weekStart } : {}) }),
  getGroceryList: (weekStart) => request(`/api/plan/${weekStart}/grocery-list`),
  addGroceryToBuy: (weekStart, item) =>
    request(`/api/plan/${weekStart}/grocery-list`, { method: 'POST', body: JSON.stringify(item) }),
  getDueDefrostReminders: () => request('/api/notifications/defrost-due'),
  ackDefrostReminders: (mealIds) =>
    request('/api/notifications/defrost-due/ack', { method: 'POST', body: JSON.stringify({ mealIds }) })
};
