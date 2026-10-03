// Optional asset generation; committed PNGs keep normal builds dependency-free.
// Usage: node scripts/generate-app-icons.mjs /path/to/sharp/dist/index.cjs
const { default: sharp } = await import(process.argv[2] || 'sharp')
for (const size of [192, 512]) {
  await sharp(new URL('../public/app-icon.svg', import.meta.url).pathname)
    .resize(size, size)
    .png()
    .toFile(new URL(`../public/cadence-icon-${size}.png`, import.meta.url).pathname)
}
