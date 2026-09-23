import { mkdir, writeFile } from 'node:fs/promises'

await mkdir('dist/server', { recursive: true })

await writeFile(
  'dist/server/index.js',
  `export default {
  async fetch(request, env) {
    return env.ASSETS.fetch(request)
  },
}\n`,
)

await writeFile(
  'dist/server/wrangler.json',
  JSON.stringify({
    main: './index.js',
    compatibility_date: '2026-09-23',
    assets: {
      directory: '../client',
      binding: 'ASSETS',
      not_found_handling: 'single-page-application',
    },
  }, null, 2),
)
