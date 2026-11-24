import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const PREVIEW_SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; frame-ancestors 'self';",
  'X-Frame-Options': 'SAMEORIGIN',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer-when-downgrade',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

// Real SPA routes defined in src/routes/AppRoutes.jsx
const APP_ROUTE_PATTERNS = [
  /^\/$/,
  /^\/login$/,
  /^\/verify(\/[^/]+)?$/,
  /^\/id-card(\/[^/]+)?$/,
  /^\/idcard(\/[^/]+)?$/,
  /^\/public\/id-card(\/[^/]+)?$/,
  /^\/dashboard$/,
  /^\/enrollments(\/[^/]+)?$/,
  /^\/admissions(\/[^/]+)?$/,
  /^\/payments(\/[^/]+)?$/,
  /^\/reminders$/,
  /^\/due-reminders$/,
  /^\/fees$/,
  /^\/renewals$/,
  /^\/students(\/[^/]+)?$/,
  /^\/demos(\/[^/]+)?$/,
  /^\/enquiries(\/[^/]+)?$/,
  /^\/teachers(\/[^/]+)?$/,
  /^\/teacher-attendance$/,
  /^\/subjects(\/[^/]+)?$/,
  /^\/green-card$/,
  /^\/expenses$/,
  /^\/reports(\/subject\/[^/]+|\/[^/]+)?$/,
  /^\/users$/,
  /^\/settings$/,
  /^\/audit-logs$/,
  /^\/audit$/,
];

const NON_APP_EXTENSION_RE = /\.[a-z0-9]{1,8}$/i;

function isAllowedSpaPath(rawUrl) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(rawUrl || '/', 'http://localhost').pathname);
  } catch {
    return false;
  }

  if (pathname.length > 1 && pathname.endsWith('/')) {
    pathname = pathname.slice(0, -1);
  }

  if (pathname === '/index.html') {
    return true;
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.some((seg) => seg.startsWith('.') || NON_APP_EXTENSION_RE.test(seg))) {
    return false;
  }

  return APP_ROUTE_PATTERNS.some((pattern) => pattern.test(pathname));
}

function spaPreviewFallbackGuardPlugin() {
  return {
    name: 'spa-preview-fallback-guard',
    configurePreviewServer(server) {
      // Runs as a post-hook after static assets (sirv) and Vite's htmlFallbackMiddleware,
      // and before indexHtmlMiddleware, so missing non-app paths return a real 404.
      return () => {
        server.middlewares.use((req, res, next) => {
          const originalUrl = req.originalUrl || req.url || '/';
          if (req.url === '/index.html' && !isAllowedSpaPath(originalUrl)) {
            for (const [header, value] of Object.entries(PREVIEW_SECURITY_HEADERS)) {
              res.setHeader(header, value);
            }
            res.statusCode = 404;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.end(req.method === 'HEAD' ? undefined : '404 Not Found');
            return;
          }
          next();
        });
      };
    },
  };
}

export default defineConfig({
  plugins: [react(), spaPreviewFallbackGuardPlugin()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
      },
      '/uploads': {
        target: process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8080',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    headers: PREVIEW_SECURITY_HEADERS,
  },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-charts': ['recharts'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
