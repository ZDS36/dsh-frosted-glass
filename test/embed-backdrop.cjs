// Re-embed the public backdrop.svg into client.js as the wallpaper data URI.
//
// The wallpaper lives in exactly one place: `const WALLPAPER = 'data:image/svg+xml;base64,…'`
// at the top of client.js. Replace backdrop.svg, run this, and the page picks up
// the new image on next load. Paths are relative to this file, so it runs from
// anywhere.
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const clientPath = path.join(root, 'client.js')
const imagePath = path.join(root, 'backdrop.svg')

const image = fs.readFileSync(imagePath)
const b64 = image.toString('base64')
const source = fs.readFileSync(clientPath, 'utf8')

const pattern = /const WALLPAPER = 'data:image\/(?:jpeg|svg\+xml);base64,[A-Za-z0-9+/=]*'/
if (!pattern.test(source)) {
  throw new Error('WALLPAPER constant not found in client.js — did the declaration change?')
}

const next = source.replace(pattern, `const WALLPAPER = 'data:image/svg+xml;base64,${b64}'`)
const backup = `${clientPath}.bak-${new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '')}`
fs.copyFileSync(clientPath, backup)
fs.writeFileSync(clientPath, next)

console.log(`backdrop.svg ${image.length} B -> base64 ${b64.length} B`)
console.log(`client.js ${source.length} -> ${next.length} B`)
console.log(`backup    ${path.basename(backup)}`)
