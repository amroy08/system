import { app, readyPromise } from '../src/index.js';

app.use(async (req, res, next) => {
  await readyPromise;
  next();
});

export default app;
