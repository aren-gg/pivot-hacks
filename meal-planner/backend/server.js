require('dotenv').config();
const express = require('express');
const cors = require('cors');

const fridgeRoutes = require('./routes/fridge');
const groceriesRoutes = require('./routes/groceries');
const cravingsRoutes = require('./routes/cravings');
const planRoutes = require('./routes/plan');
const notificationsRoutes = require('./routes/notifications');
const parseRoutes = require('./routes/parse');
const preferencesRoutes = require('./routes/preferences');
const receiptRoutes = require('./routes/receipt');
const voiceFeedbackRoutes = require('./routes/voiceFeedback');

const app = express();
const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';

app.use(cors({ origin: CORS_ORIGIN.split(',').map((s) => s.trim()) }));
app.use(express.json({ limit: '15mb' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/fridge', fridgeRoutes);
app.use('/api/groceries', groceriesRoutes);
app.use('/api/cravings', cravingsRoutes);
app.use('/api/plan', planRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/parse', parseRoutes);
app.use('/api/preferences', preferencesRoutes);
app.use('/api/receipt', receiptRoutes);
app.use('/api/voice-feedback', voiceFeedbackRoutes);

app.use((req, res) => res.status(404).json({ error: 'not found' }));

app.listen(PORT, () => {
  console.log(`meal-planner backend listening on :${PORT}`);
});
