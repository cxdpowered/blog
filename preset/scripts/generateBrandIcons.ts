// Regenerate the favicon variants after editing src/assets/logo.svg.
// Run from the repository root: bun preset/scripts/generateBrandIcons.ts
import { readFile, writeFile } from 'node:fs/promises'
import sharp from 'sharp'

const root = new URL('../../', import.meta.url)
const source = await readFile(new URL('src/assets/logo.svg', root), 'utf8')
const background = '#f9f8f5'

await writeFile(new URL('public/images/brand-mark.svg', root), source)

await writeFile(
  new URL('src/assets/logo.png', root),
  await sharp(Buffer.from(source)).png().toBuffer()
)

const favicon = source.replace(
  '<g fill="#292722"',
  '<style>@media (prefers-color-scheme: dark) { g { fill: #f0eee8; } }</style>\n  <g fill="#292722"'
)
await writeFile(new URL('public/favicon/favicon.svg', root), favicon)

const variants = [
  ['favicon-16x16.png', 16],
  ['favicon-32x32.png', 32],
  ['apple-touch-icon.png', 180],
  ['android-chrome-192x192.png', 192],
  ['android-chrome-512x512.png', 512]
] as const

for (const [name, size] of variants) {
  const png = await sharp(Buffer.from(source))
    .resize(size, size)
    .flatten({ background })
    .png()
    .toBuffer()
  await writeFile(new URL(`public/favicon/${name}`, root), png)
}

// Modern ICO files can contain PNG frames; keep the common browser sizes together.
const sizes = [16, 32, 48]
const frames = await Promise.all(
  sizes.map((size) =>
    sharp(Buffer.from(source)).resize(size, size).flatten({ background }).png().toBuffer()
  )
)
const header = Buffer.alloc(6 + frames.length * 16)
header.writeUInt16LE(1, 2)
header.writeUInt16LE(frames.length, 4)
let offset = header.length
for (const [index, frame] of frames.entries()) {
  const entry = 6 + index * 16
  header[entry] = header[entry + 1] = sizes[index]!
  header.writeUInt16LE(1, entry + 4)
  header.writeUInt16LE(32, entry + 6)
  header.writeUInt32LE(frame.length, entry + 8)
  header.writeUInt32LE(offset, entry + 12)
  offset += frame.length
}
await writeFile(new URL('public/favicon/favicon.ico', root), Buffer.concat([header, ...frames]))
console.log('Updated logo PNG, SVG favicon, and all PNG / ICO variants.')
