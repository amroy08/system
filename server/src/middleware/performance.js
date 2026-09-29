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

// HTTP cache headers for GET API responses
// Only truly static public settings can be cached by the browser.
// All business data (subjects, classes, students, fees, etc.) must use no-cache
// so edits immediately reflect across the application without browser stale cache.
const STATIC_CACHE_ROUTES = ['/api/public/settings'];

export function apiCacheHeaders(req, res, next) {
  if (req.method !== 'GET' || !req.originalUrl?.startsWith('/api')) return next();

  if (STATIC_CACHE_ROUTES.some((r) => req.originalUrl.startsWith(r))) {
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=60');
    return next();
  }

  // All other API responses: no-cache so updates are immediately visible
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
}
