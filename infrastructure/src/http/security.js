import cors from 'cors';
import helmet from 'helmet';

export function securityHeaders() {
  const headers = helmet({
    // Same-origin API docs need nothing beyond Helmet's default policy.
    crossOriginEmbedderPolicy: false,
  });
  return (req, res, next) => {
    // Responses can contain receipt details; nothing here is cacheable.
    res.setHeader('Cache-Control', 'no-store');
    headers(req, res, next);
  };
}

/**
 * Browser access is limited to configured origins (for example the Capacitor
 * Android origin https://localhost). CORS is not authentication.
 */
export function corsPolicy(allowedOrigins) {
  return cors({
    origin: (origin, callback) => callback(null, Boolean(origin) && allowedOrigins.includes(origin)),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'X-Client-Key'],
    exposedHeaders: ['X-Request-Id', 'Retry-After', 'RateLimit', 'RateLimit-Policy'],
    maxAge: 600,
  });
}
