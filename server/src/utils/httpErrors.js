import { config } from '../config.js';

export function sendInternalError(res, error, context = 'Request') {
  console.error(`[${context}]`, error);
  return res.status(500).json({
    error: config.isProduction ? 'Internal server error' : error.message,
  });
}
