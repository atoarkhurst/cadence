import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sites } from '@openai/sites-vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), sites()],
  base: globalThis.process?.env.VITE_BASE_PATH || '/cadence/',
  build: { outDir: 'dist/client' },
})
