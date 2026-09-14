import { app, readyPromise } from '../src/index.js';

app.use(async (req, res, next) => {
  try {
    await readyPromise;
    next();
  } catch (err) {
    console.error('[Vercel Serverless] DB connection failed:', err);
    res.status(500).json({ error: 'Database connection failed', details: err.message });
  }
});

export default app;
