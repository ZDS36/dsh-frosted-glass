// Contract test: load the client module under a DOM stub, emit the stylesheet
// it would install, and check it is well formed. Exits non-zero on failure.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

let registered = null
globalThis.screen = { width: 2560, height: 1440 }
globalThis.window = {
  __ModuleLoader__: { load: (entry) => { registered = entry } },
  addEventListener() {},
  removeEventListener() {},
  screen: globalThis.screen,
  screenX: 0,
  screenY: 0,
}
const appended = []
const node = (tag) => ({
  tagName: tag,
  attrs: {},
  children: [],
  style: {},
  setAttribute(name, value) { this.attrs[name] = String(value) },
  getAttribute(name) { return this.attrs[name] },
  appendChild(child) { this.children.push(child); return child },
  remove() {},
})
const lensSvg = []
globalThis.document = {
  head: { appendChild: (el) => appended.push(el) },
  body: { appendChild: (el) => { if (el.tagName === 'svg') lensSvg.push(el) } },
  documentElement: { style: { setProperty() {} }, setAttribute() {}, removeAttribute() {} },
  hasFocus: () => true,
  createElement: () => ({ dataset: {}, textContent: '' }),
  createElementNS: (_ns, tag) => node(tag),
}

// eslint-disable-next-line no-eval
;(0, eval)(source)

const failures = []
const check = (ok, label) => { if (!ok) failures.push(label) }

check(registered !== null, 'module registers with __ModuleLoader__')
check(registered?.id === 'dsh-frosted-glass', 'module id is the package name')
const embeddedBackdrop = source.match(/const WALLPAPER = 'data:image\/svg\+xml;base64,([A-Za-z0-9+/=]+)'/)?.[1]
check(Buffer.from(embeddedBackdrop ?? '', 'base64').equals(readFileSync(join(here, '..', 'backdrop.svg'))),
  'embedded backdrop matches the public SVG, without the local wallpaper')

const mod = registered.factory((name) => {
  if (name === 'react') {
    return { createElement: () => null, useState: (v) => [v, () => {}], useEffect: () => {} }
  }
  throw new Error('unexpected require: ' + name)
})
check(typeof mod.apply === 'function', 'exposes apply()')

const effects = []
const injected = []
const registeredSlots = []
mod.apply({
  effect: (fn, label) => effects.push({ fn, label }),
  locale: { register: () => () => {}, bind: () => (key) => key },
  slots: {
    inject: (key, callback) => { injected.push(key); callback(); return () => {} },
    register: (options) => { registeredSlots.push(options); return () => {} },
  },
})
for (const e of effects) e.fn()

const css = appended[0]?.textContent ?? ''
// two sheets: the big one (backdrop, edges, row CSS) and the token sheet the
// opacity slider rewrites without touching the 180 KB wallpaper string.
const tokenCss = appended[1]?.textContent ?? ''
check(css.length > 2000, 'stylesheet is non-trivial')
if (/backdrop:\s*'none',/.test(source)) {
  // acrylic mode must stay cheap: no 129 KB wallpaper payload, no extra layers
  check(css.length < 30000, `acrylic sheet stays small (got ${css.length} bytes)`)
}
check(appended.length === 2, 'two <style> elements per apply (sheet + tokens)')
check(tokenCss.includes('--dsw-alias-bg-base'), 'token sheet carries the surfaces')
check(injected.includes('settings.general.item'), 'settings row injected into the General section')
check(registeredSlots.some((o) => o.id === 'frosted-glass-blur'), 'blur row registered with a stable id')
check(/\.dsgRange\s*\{[^}]*width:\s*180px/.test(css), 'slider styled')
check(css.includes('blur(var(--dsg-blur,'), 'blur radius reads the CSS variable the slider writes')

// structural sanity outside comments
let braces = 0
let parens = 0
let inComment = false
for (let i = 0; i < css.length; i++) {
  const c = css[i]
  if (!inComment && c === '/' && css[i + 1] === '*') { inComment = true; i++; continue }
  if (inComment) { if (c === '*' && css[i + 1] === '/') { inComment = false; i++ } continue }
  if (c === '{') braces++
  else if (c === '}') braces--
  else if (c === '(') parens++
  else if (c === ')') parens--
}
check(braces === 0, `braces balance (got ${braces})`)
check(parens === 0, `parens balance (got ${parens})`)

// no unresolved interpolation or bad numbers anywhere (the base64 payload is
// not CSS — it can contain any letters, so blank it out first)
const cssCode = css.replace(/data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g, 'data:image/svg+xml;base64,<payload>')
check(!cssCode.includes('undefined'), 'no undefined value leaked into the CSS')
check(!cssCode.includes('NaN'), 'no NaN leaked into the CSS')
check(!/rgb\(\s*\)/.test(cssCode), 'no empty rgb()')

// every surface token is emitted with a plain alpha (the opacity slider
// rescales the whole table in JS and rewrites this sheet).
const tokens = [...tokenCss.matchAll(/^\s+(--dsw-[a-z0-9-]+): rgb\((.+)\) !important;$/gm)]
check(tokens.length >= 24, `surface tokens emitted (got ${tokens.length})`)
for (const [, name, value] of tokens) {
  check(/^\d{1,3} \d{1,3} \d{1,3} \/ \d\.\d{3}$/.test(value), `well-formed rgba for ${name}: ${value}`)
}

// the composited-opacity maths: default base target on a depth-2 surface
const baseTarget = Number(source.match(/opacityBase:\s*(\d+)/)?.[1]) / 100
check(Number.isFinite(baseTarget) && baseTarget > 0, 'opacityBase readable from source')
const base = tokenCss.match(/--dsw-alias-bg-base: rgb\([^/]+\/ ([\d.]+)\)/)?.[1]
const expected = 1 - Math.pow(1 - baseTarget, 1 / 2)
check(base !== undefined && Math.abs(Number(base) - expected) < 0.002,
  `bg-base alpha is depth-compensated (got ${base}, expected ${expected.toFixed(3)})`)
// reduced transparency must not leave an empty sheet of glass behind
check(/@media \(prefers-reduced-transparency: reduce\)/.test(tokenCss), 'token sheet has a reduced-transparency table')
check(/prefers-reduced-transparency[\s\S]{0,2000}?--dsw-alias-bg-base: rgb\(255 255 255 \/ 0\.980\)/.test(tokenCss),
  'reduced transparency pins the surfaces solid')

// reading surfaces are pinned: the settings panel is bg-layer-2 and the composer
// is input-major, and a glassy settings dialog or input box is an unusable one
for (const [token, floor] of [['--dsw-alias-bg-layer-2', 0.9], ['--dsw-alias-bg-layer-3', 0.9], ['--dsw-specific-input-major', 0.6], ['--dsw-alias-bg-overlay', 0.9]]) {
  const alphas = [...tokenCss.matchAll(new RegExp(token.replace(/[-]/g, '\\-') + ': rgb\\([^/]+\\/ ([\\d.]+)\\)', 'g'))]
    .map((m) => Number(m[1]))
  check(alphas.length >= 2 && alphas.every((a) => a >= floor),
    `${token} stays solid in every scheme (got ${alphas.join(' / ')}, floor ${floor})`)
}
check(typeof mod.apply === 'function', 'apply still exposed after token split')

// glass rim: a real double rule on the window edge, plus a dark chamfer inside.
// Every bare *_frame selector must carry the :has() anchor — without it the
// rule would also paint the document-preview / browser / attachment / question
// frames, which all reuse the same `_frame` suffix.
for (const m of css.matchAll(/\[class\$="_frame"\]([^{]*)\{/g)) {
  check(m[1].startsWith(':has([class$="_sidebarCol"])'),
    `every _frame selector is anchored (got "${m[1]}")`)
}
// glass rim: a slab bevel, not a stroke and not a frosted edge — silhouette
// hairline, a 3px specular inside it, then a 22px thickness shadow
check(/\[class\$="_frame"\]:has\([^{]*::after \{[\s\S]{0,500}?inset 0 0 0 1px/.test(css), 'frame rim: silhouette hairline')
check(/\[class\$="_frame"\]:has\([^{]*::after \{[\s\S]{0,600}?inset 0 0 3px 0/.test(css), 'frame rim: 3px specular bevel')
check(/\[class\$="_frame"\]:has\([^{]*::after \{[\s\S]{0,700}?inset 0 0 22px -4px/.test(css), 'frame rim: 22px thickness shadow')
// frosted glass scatters evenly and has no highlight; glossy glass has a shaped
// reflection. Two blobs (main light upper-left, counter-light lower-right) are
// what stop the window reading as a sheet of tracing paper.
check(/::after \{[\s\S]{0,400}?radial-gradient\(92% 56% at 5% -14%/.test(css), 'frame sheen: main specular blob')
check(/::after \{[\s\S]{0,600}?radial-gradient\(58% 40% at 100% 110%/.test(css), 'frame sheen: counter-reflection')
check(!/\[class\$="_frame"\]:has\([^{]*::after \{[^}]*\boutline:/.test(css), 'frame rim has no hard outline')
check(!/\[class\$="_frame"\]:has\([^{]*::after \{[^}]*border-image/.test(css), 'frame rim has no border-image')
check(/\[class\$="_frame"\]:has\([^{]*::after \{[^}]*pointer-events: none/.test(css), 'rim does not eat clicks')
// the rim strength slider rewrites six custom properties; every one of them
// must also carry a fallback, or the whole declaration is dropped before the
// row has ever been opened
for (const v of ['--dsg-rim', '--dsg-rim2', '--dsg-rim3', '--dsg-rimd', '--dsg-rimd2', '--dsg-rimd3']) {
  check(css.includes(`var(${v}, 0.`), `rim variable ${v} has a static fallback`)
}
check(registeredSlots.some((o) => o.id === 'frosted-glass-rim'), 'rim strength row registered')

// the silhouette is the only hard 1px stroke left on the window, so it must stay quiet
const hairline = css.match(/inset 0 0 0 1px rgb\(255 255 255 \/ (?:var\(--[\w-]+, )?(0\.\d+)\)/)?.[1]
check(hairline !== undefined && Number(hairline) <= 0.45, `rim silhouette stays under 0.45 (got ${hairline})`)

// backdrop and glass edges. Two valid shapes now:
//   wallpaper/field plate → body::before paints it, cover-sized
//   'none' (Windows DWM acrylic) → nothing painted, html transparent so the
//   window material is what shows through.
const acrylic = /backdrop:\s*'none',/.test(source)
if (acrylic) {
  // the 129 KB wallpaper base64 must not reach the stylesheet at all when
  // nothing can use it: it costs a parse and a copy on every page load
  check((css.match(/data:image\/svg\+xml;base64,/g) ?? []).length === 0,
    'acrylic mode: wallpaper payload stays out of the emitted sheet')
  check(css.includes('--dsg-wallpaper: none;'), 'acrylic mode: wallpaper variable disabled')
  check(css.includes('html { background-color: transparent; }'), 'acrylic mode: html transparent')
  check(/body::before \{[\s\S]{0,500}?background-image: var\(--dsg-grain\),\s*\nnone;/.test(css),
    'acrylic mode: only the grain is painted, no plate')
} else {
  check((css.match(/data:image\/svg\+xml;base64,/g) ?? []).length === 1, 'wallpaper data URI embedded exactly once')
  if (/backdrop:\s*'wallpaper',/.test(source)) {
    check(css.includes('var(--dsg-wallpaper)'), 'wallpaper plate is referenced')
  } else {
    check(css.includes('radial-gradient(62% 58% at 18% 14%'), 'field plate is painted')
  }
  check(css.includes('background-size: 96px 96px, cover'), 'backdrop is cover-sized behind the grain')
}

// fake frosted glass: a static grain tile, a specular ring on the composer, and
// a refraction band on the sidebar/centre seam
check(/data:image\/svg\+xml,/.test(css), 'grain tile is embedded as an SVG data URI')
const grainSvg = (() => {
  // encodeURIComponent leaves ' alone, so the data URI holds literal single quotes
  // inside its double-quoted url() — stop the capture at the closing quote only
  const raw = css.match(/data:image\/svg\+xml,([^"]+)/)?.[1]
  try { return raw === undefined ? '' : decodeURIComponent(raw) } catch { return '' }
})()
check(/feTurbulence/.test(grainSvg) && /baseFrequency='0.9'/.test(grainSvg), 'grain is fractal turbulence')
check(/background-image: var\(--dsg-grain\),/.test(css), 'grain is the topmost backdrop layer')
check(/\[data-dsg-seat\] \[class\$="_card"\]::after \{[\s\S]{0,600}?mask-composite: exclude/.test(css),
  'composer card carries a masked specular ring')
check(/@supports not \(mask-composite: exclude\)/.test(css), 'ring degrades off when mask-composite is missing')
check(/\[data-dsg-center\] \{[\s\S]{0,260}?inset 1px 0 0/.test(css), 'seam has a refraction highlight')

// performance: in acrylic mode the only element that may carry backdrop-filter
// is the composer card — its backdrop is the scrolling message list. Blurring a
// flat veil costs a composited layer and a per-frame readback and shows nothing.
if (acrylic) {
  const re = /\[class\$="_(centerCol|sidebarCol|rightbarCol|bottomRow|bubble|panel)"\][^{}]*\{[^}]*backdrop-filter: (?!none)/g
  for (const hit of css.matchAll(re)) {
    check(false, `acrylic mode: ${hit[1]} still carries a backdrop-filter -> ${hit[0].slice(0, 120)}`)
  }
  check(/\[class\$="_composerSeat"\] \[class\$="_card"\][^{]*\{[^}]*backdrop-filter: var\(--dsg-card-filter/.test(css),
    'composer card is the one blurred element')
} else {
  for (const suffix of ['_centerCol', '_sidebarCol', '_rightbarCol', '_bottomRow', '_card', '_bubble', '_panel']) {
    check(css.includes('class$="' + suffix + '"'), `blur target ${suffix} present`)
  }
}
check(css.includes('html[data-dsg-resizing]'), 'resize guard CSS present')

// cross-version anchors: every rule that depends on a CSS-module name must also
// accept our own data-dsg-* tag, so a renamed module class does not kill it
for (const tag of ['[data-dsg-frame]::after', '[data-dsg-frame]::before', '[data-dsg-center]', '[data-dsg-seat] [class$="_card"]']) {
  check(css.includes(tag), `tag anchor present: ${tag}`)
}
check(source.includes('function resolveAnchors'), 'runtime anchor resolver present')
check(source.includes("closest('[class*=\"composer\"]')"), 'resolver can find the composer from the textarea')
check(effects.some((e) => e.label === 'frosted-glass: stylesheet'), 'stylesheet effect labelled')
check(effects.some((e) => e.label === 'frosted-glass: resize guard'), 'resize guard effect labelled')

if (failures.length > 0) {
  console.error(`FAIL (${failures.length})`)
  for (const f of failures) console.error(' -', f)
  process.exit(1)
}
console.log(`ok: ${tokens.length} tokens, ${appended[0].textContent.length} bytes of CSS, ${effects.length} effects`)
