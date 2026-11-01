#!/usr/bin/env node
/**
 * Compatibility audit: does this DSH build still provide everything the glass
 * stylesheet leans on? Read-only; prints a table and exits 1 if anything is gone.
 *
 * The stylesheet has no way to report a missing hook — a renamed CSS-module class
 * or a renamed theme token just means "that rule silently stops applying". This
 * script is the alarm for that.
 *
 *   node test/audit-selectors.mjs --root <DSH node_modules directory>
 */
import { readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const pluginRoot = join(here, '..')
const source = readFileSync(join(pluginRoot, 'client.js'), 'utf8')

const argv = process.argv.slice(2)
const rootFlag = argv.indexOf('--root')
const packagesRoot = rootFlag >= 0 ? argv[rootFlag + 1] : undefined
if (!packagesRoot || packagesRoot.startsWith('--')) {
  console.error('usage: npm run audit -- --root <DSH node_modules directory>')
  process.exit(1)
}
try {
  if (!statSync(packagesRoot).isDirectory()) throw new Error('not a directory')
} catch {
  console.error('DSH node_modules directory not found; pass its actual path with --root')
  process.exit(1)
}

/** Every CSS-module class suffix the stylesheet matches on. */
const SUFFIXES = [
  '_frame', '_sidebarCol', '_centerCol', '_rightbarCol', '_bottomRow',
  '_card', '_panel', '_bubble', '_dock', '_composerSeat',
]

/** Every theme custom property the token sheet writes or reads. */
const TOKENS = [...new Set([
  ...[...source.matchAll(/\['(--dsw-[a-z0-9-]+)'/g)].map((m) => m[1]),
  ...[...source.matchAll(/var\((--dsw-[a-z0-9-]+)/g)].map((m) => m[1]),
  ...[...source.matchAll(/'(--dsw-alias-bg-[a-z0-9-]+)'\s*:/g)].map((m) => m[1]),
])].sort()

/** Host-level hooks: attributes the layout or another plugin puts on the DOM. */
const HOOKS = ['data-windows-titlebar', '--dsh-windows-content-radius']

/** Collect every client bundle once. */
function bundles(dir) {
  const out = []
  const visited = new Set()
  const walk = (at) => {
    const real = realpathSync(at)
    if (visited.has(real)) return
    visited.add(real)
    for (const name of readdirSync(at)) {
      const path = join(at, name)
      let info
      try { info = statSync(path) } catch { continue }
      if (info.isDirectory()) walk(path)
      else if (name === 'client.js' && realpathSync(path) !== realpathSync(join(pluginRoot, 'client.js'))) out.push(path)
    }
  }
  walk(dir)
  return out
}

const files = bundles(packagesRoot)
if (files.length === 0) {
  console.error(`no client bundles under ${packagesRoot}`)
  process.exit(1)
}
const corpus = files.map((path) => readFileSync(path, 'utf8')).join('\n')

let missing = 0
const row = (label, ok, hint) => {
  if (!ok) missing++
  console.log(`${ok ? '  ok ' : '  -- '} ${label.padEnd(38)} ${hint}`)
}

console.log(`bundles  ${files.length} client bundles under ${packagesRoot}\n`)
console.log('CSS-module suffixes the stylesheet matches on:')
for (const suffix of SUFFIXES) {
  const hits = (corpus.match(new RegExp(suffix.replace(/[-]/g, '\\-') + '\\b', 'g')) ?? []).length
  row(suffix, hits > 0, hits > 0 ? `${hits} reference(s)` : 'MISSING — that rule is dead now')
}

console.log('\ntheme tokens the token sheet writes:')
for (const token of TOKENS) {
  const declared = corpus.includes(token + ':')
  row(token, declared, declared ? 'declared by the theme' : 'MISSING — that surface falls back to opaque')
}

console.log('\nhost hooks:')
for (const hook of HOOKS) {
  const inApp = corpus.includes(hook)
  row(hook, inApp, inApp ? 'in the host bundles' : 'MISSING')
}
console.log(`${corpus.includes('data-composer-stat') ? '  ok ' : ' skip'} data-composer-stat                     optional stats plugin hook`)

console.log('')
if (missing > 0) {
  console.log(`FAIL — ${missing} hook(s) gone; the rules that depend on them are silently dead.`)
  process.exit(1)
}
console.log('ok — every hook this stylesheet leans on still exists in this build.')
