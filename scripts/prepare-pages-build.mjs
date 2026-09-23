import { copyFile } from 'node:fs/promises'

// GitHub Pages serves this fallback for direct visits to client-side routes.
// React Router then reads the original URL and renders the matching screen.
await copyFile('dist/index.html', 'dist/404.html')
