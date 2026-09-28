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

// HTTP cache headers for GET API responses — avoids redundant network fetches
// on back-navigation and tab switching without stale data risk
const LONG_CACHE_ROUTES = ['/api/classes', '/api/subjects', '/api/settings', '/api/public/settings'];
const MEDIUM_CACHE_ROUTES = ['/api/students', '/api/fees', '/api/dashboard', '/api/teachers', '/api/parents'];
const NO_CACHE_ROUTES = ['/api/auth'];

export function apiCacheHeaders(req, res, next) {
  if (req.method !== 'GET' || !req.originalUrl?.startsWith('/api')) return next();

  // Never cache auth endpoints
  if (NO_CACHE_ROUTES.some((r) => req.originalUrl.startsWith(r))) {
    res.setHeader('Cache-Control', 'no-store');
    return next();
  }

  // Long-lived reference data: 5 min cache + 1 min stale-while-revalidate
  if (LONG_CACHE_ROUTES.some((r) => req.originalUrl.startsWith(r))) {
    res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=60');
    return next();
  }

  // Medium-churn data: 30 sec cache + 10 sec stale-while-revalidate
  if (MEDIUM_CACHE_ROUTES.some((r) => req.originalUrl.startsWith(r))) {
    res.setHeader('Cache-Control', 'private, max-age=30, stale-while-revalidate=10');
    return next();
  }

  // Default for other API GETs: short private cache
  res.setHeader('Cache-Control', 'private, max-age=10');
  next();
}
