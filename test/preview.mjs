// Build a static preview of the emitted stylesheet on a mock app frame, so the
// window rim and the token alphas can be eyeballed without touching the live UI.
// Writes preview-glass.html next to this file. Read-only with respect to the app.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const source = readFileSync(join(root, 'client.js'), 'utf8')

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
const fakeNode = (tag) => ({
  tagName: tag,
  attrs: {},
  children: [],
  style: {},
  setAttribute(name, value) { this.attrs[name] = String(value) },
  appendChild(child) { this.children.push(child); return child },
  remove() {},
})
globalThis.document = {
  head: { appendChild: (el) => appended.push(el) },
  body: { appendChild() {} },
  documentElement: { style: { setProperty() {} }, setAttribute() {}, removeAttribute() {} },
  hasFocus: () => true,
  createElement: () => ({ dataset: {}, textContent: '' }),
  createElementNS: (_ns, tag) => fakeNode(tag),
}
// eslint-disable-next-line no-eval
;(0, eval)(source)

const mod = registered.factory((name) => {
  if (name === 'react') {
    return { createElement: () => null, useState: (v) => [v, () => {}], useEffect: () => {} }
  }
  throw new Error('unexpected require: ' + name)
})
const effects = []
mod.apply({
  effect: (fn, label) => effects.push({ fn, label }),
  locale: { register: () => () => {}, bind: () => (key) => key },
  slots: { inject: (key, callback) => { callback(); return () => {} }, register: () => () => {} },
})
for (const e of effects) e.fn()

const sheet = (appended[0]?.textContent ?? '').replace(/data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+/g, '')
const tokens = appended[1]?.textContent ?? ''

// What sits behind the window: a busy photo, or a flat bright desktop.
const bg = process.env.PREVIEW_BG === 'light'
  ? 'linear-gradient(160deg, #eef2f8 0%, #dfe7f4 46%, #f6f0ea 100%)'
  : 'url("../backdrop.svg") center/cover no-repeat'
// Which app theme the mock is in.
const bodyAttr = process.env.PREVIEW_THEME === 'dark' ? ' data-ds-dark-theme' : ''
const out = process.env.PREVIEW_OUT ?? 'preview-glass.html'
// Optional: pretend the rim-strength slider is at N %, to prove the four vars
// survive substitution inside rgb() and inside a border-image gradient.
const rimPct = process.env.PREVIEW_RIM
const rimVars = rimPct === undefined ? '' : (() => {
  const k = Number(rimPct) / 100
  const base = process.env.PREVIEW_THEME === 'dark'
    ? [0.2, 0.08, 0.03, 0.24]
    : [0.4, 0.16, 0.06, 0.12]
  const names = ['--dsg-rim', '--dsg-rim2', '--dsg-rim3', '--dsg-wall']
  return ':root {' + names.map((n, i) => `${n}: ${(base[i] * k).toFixed(3)};`).join(' ') + '}'
})()

// Optional: mount the refraction filter the plugin builds in JS, so the mock's
// composer ring can be checked for "ring only, not a funhouse mirror".
const lens = process.env.PREVIEW_LENS
const lensScale = lens === undefined ? 0 : Math.round(Number(lens) * 0.4)
const lensMarkup = `<svg width="0" height="0" aria-hidden="true" style="position:absolute">
  <filter id="dsg-lens-filter" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB">
    <feTurbulence type="fractalNoise" baseFrequency="0.012 0.016" numOctaves="1" seed="7" result="noise"/>
    <feDisplacementMap in="SourceGraphic" in2="noise" scale="${lensScale}" xChannelSelector="R" yChannelSelector="G"/>
  </filter>
</svg>`
const lensVars = lensScale > 0
  ? ':root { --dsg-card-filter: blur(28px) saturate(1.8) url(#dsg-lens-filter); }'
  : ''

// mock DOM: the layout's real class suffixes, one row of fake chat content
const lines = Array.from({ length: 18 }, (_, i) => `<p>第 ${i + 1} 行消息，用来看透过去的桌面。</p>`).join('\n')
const doc = `<!doctype html>
<html data-windows-titlebar>
<head><meta charset="utf-8">
<style>
  /* stand-in for the desktop behind the window */
  html { background: ${bg}; }
  body { margin: 0; height: 100vh; font: 13px/1.7 "Segoe UI", system-ui, sans-serif; color: #1c2230; }
  [data-windows-titlebar] { --dsh-windows-titlebar-height: 44px; }
  /* these three lines mirror ui-layout's own AppFrame.module.css, so the mock
     shows the same composite the real window does */
  .mP3x-q_frame { height: 100vh; background: var(--dsw-specific-sidebar-fill); }
  .mP3x-q_sidebarCol { padding: 56px 14px 0; background: var(--dsw-specific-sidebar-fill); }
  .mP3x-q_centerCol { padding: 56px 22px 0; background: var(--dsw-alias-bg-base); }
  .mP3x-q_dock { display: flex; justify-content: center; }
  p { margin: 0 0 10px; }
  .chip { display: inline-block; padding: 2px 10px; border-radius: 999px; }
  /* mock composer: the real card class ends in _card, which is what the
     plugin's composerSeat descendant rules land on */
  .mP3x-q_composerSeat { position: fixed; left: 280px; right: 24px; bottom: 44px; }
  .GRgSLq_card {
    position: relative;
    padding: 14px 16px 40px;
    border-radius: 28px;
    color: #6a7180;
    background: var(--dsw-specific-input-major);
  }
</style>
<style>${rimVars}</style>
<style>${lensVars}</style>
<style>${sheet}</style>
<style>${tokens}</style>
</head>
<body${bodyAttr}>
  ${lensMarkup}
  <div class="mP3x-q_frame" style="display:grid;grid-template-columns:264px minmax(0,1fr)">
    <div class="mP3x-q_sidebarCol">侧栏</div>
    <div class="mP3x-q_centerCol">${lines}</div>
  </div>
  <div class="mP3x-q_dock" style="position:fixed;left:0;right:0;bottom:8px">
    <span class="chip" data-composer-stat="usage-cost">12 轮 375 步 · 202 tok/s · 10%</span>
  </div>
  <div class="mP3x-q_composerSeat">
    <div class="GRgSLq_card">发消息或创建任务，/ 调用指令，@ 文件或对话</div>
  </div>
<script>
  // Chromium's own answer: did the sheet parse, and did :has() select the frame?
  addEventListener('load', () => {
    const frame = document.querySelector('[class$="_frame"]')
    const after = getComputedStyle(frame, '::after')
    const center = getComputedStyle(document.querySelector('[class$="_centerCol"]'))
    const side = getComputedStyle(document.querySelector('[class$="_sidebarCol"]'))
    const dock = getComputedStyle(document.querySelector('[class$="_dock"]'))
    const out = {
      match: frame.matches('[data-windows-titlebar] [class$="_frame"]:has([class$="_sidebarCol"])'),
      rimBorder: after.borderTopWidth + ' ' + after.borderTopStyle + ' ' + after.borderTopColor,
      rimImage: (after.borderImageSource || '').slice(0, 120),
      rimOutline: after.outlineWidth + ' ' + after.outlineStyle + ' ' + after.outlineColor + ' off ' + after.outlineOffset,
      rimEvents: after.pointerEvents,
      veilBg: getComputedStyle(document.body, '::before').backgroundColor,
      veilImage: (getComputedStyle(document.body, '::before').backgroundImage || 'none').slice(0, 90),
      veilSize: getComputedStyle(document.body, '::before').backgroundSize,
      centerBg: center.backgroundColor,
      centerBlur: center.backdropFilter || center.webkitBackdropFilter,
      tokenBase: getComputedStyle(document.body).getPropertyValue('--dsw-alias-bg-base').trim(),
      tokenSidebar: getComputedStyle(document.body).getPropertyValue('--dsw-specific-sidebar-fill').trim(),
      sideBg: side.backgroundColor,
      sideBorder: side.borderRightColor,
      dockBlur: dock.backdropFilter || dock.webkitBackdropFilter,
      dockWidth: dock.width,
      dockRadius: dock.borderRadius,
    }
    const pre = document.createElement('pre')
    pre.id = 'probe-out'
    pre.textContent = JSON.stringify(out, null, 1)
    document.body.appendChild(pre)
  })
</script>
</body>
</html>`

writeFileSync(join(here, out), doc)
console.log('wrote ' + out)
