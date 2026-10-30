import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * The dev server needs an inline React Refresh script and a websocket for hot reload,
 * which the strict production CSP in index.html blocks. Loosen it only while serving.
 */
function devCsp() {
  return {
    name: 'dev-csp',
    apply: 'serve',
    transformIndexHtml: (html) =>
      html.replace(
        /content="default-src 'self';[^"]*"/,
        `content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' ws: http://localhost:*"`,
      ),
  };
}

export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react(), devCsp()],
  server: { port: 5173, strictPort: false },
  // Keep paths as written. Following links/redirected folders (e.g. Windows packaged-app
  // AppData redirection) can make the dev server load React twice.
  resolve: { preserveSymlinks: true },
  build: { outDir: '../../dist/renderer', emptyOutDir: true },
});
