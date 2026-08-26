const SLOW_REQUEST_MS = Number(process.env.SLOW_REQUEST_MS || 800);

export function requestTiming(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    if (!req.originalUrl?.startsWith('/api')) return;
    const durationMs = Number(process.hrtime.bigint() - start) / 1_000_000;
    const rounded = Math.round(durationMs);
    const level = durationMs >= SLOW_REQUEST_MS ? 'warn' : 'log';
    console[level](`[api] ${req.method} ${req.originalUrl} ${res.statusCode} ${rounded}ms`);
  });
  next();
}
