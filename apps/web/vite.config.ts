import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    strictPort: true,
  },
  // @ubp/shared is a linked pnpm workspace package, so Vite serves its
  // CommonJS build directly during dev instead of pre-bundling it -- and the
  // tsc-emitted __exportStar re-export helper isn't statically analyzable
  // for named exports outside esbuild's CJS pre-bundling pass. Forcing it
  // into optimizeDeps routes it through that pass like any other dependency.
  optimizeDeps: {
    include: ["@ubp/shared"],
  },
})
