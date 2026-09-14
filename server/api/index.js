import { app, readyPromise } from '../src/index.js';

export default async function handler(req, res) {
  await readyPromise;
  return app(req, res);
}
