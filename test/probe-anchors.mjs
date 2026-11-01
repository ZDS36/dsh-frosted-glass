// Unit test for the cross-version anchor resolver.
//
// The real DOM is not available here, so this builds the smallest tree that
// answers the questions the resolver asks (a textarea inside a composer, inside
// a centre column, inside a frame next to a sidebar) and checks that the right
// elements come back tagged. It also checks the two degraded shapes: a composer
// with no recognisable seat class, and an app where nothing matches at all.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '..', 'client.js'), 'utf8')

// Keep retries deterministic and avoid real timers touching a later fixture.
const timers = new Map()
let nextTimer = 0
globalThis.setTimeout = (fn) => { const id = ++nextTimer; timers.set(id, fn); return id }
globalThis.clearTimeout = (id) => timers.delete(id)
const tick = () => {
  const pending = [...timers.values()]
  timers.clear()
  for (const fn of pending) fn()
}

/** Minimal element: attributes, class list, children, parent. */
function createElement(tag, className = '', children = []) {
  const element = {
    tag,
    attributes: new Map(),
    children,
    parentElement: null,
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    textContent: '',
    setAttribute(name, value) { this.attributes.set(name, value === undefined ? '' : String(value)) },
    getAttribute(name) { return this.attributes.get(name) ?? null },
    removeAttribute(name) { this.attributes.delete(name) },
    hasAttribute(name) { return this.attributes.has(name) },
    appendChild(child) { this.children.push(child); child.parentElement = this; return child },
    remove() {},
    closest(selector) {
      let node = this
      while (node !== null) {
        if (matches(node, selector)) return node
        node = node.parentElement
      }
      return null
    },
    remove_child() {},
  }
  element.className = className
  for (const child of children) child.parentElement = element
  return element
}

/** Support the handful of selector shapes the resolver uses. */
function matches(element, selector) {
  const className = element.className ?? ''
  const classEnd = selector.match(/^\[class\$="([^"]+)"\]$/)
  const classAny = selector.match(/^\[class\*="([^"]+)"\]$/)
  const dataAttr = selector.match(/^\[([a-z][a-z0-9-]*)\]$/)
  if (classEnd) return className.endsWith(classEnd[1])
  if (classAny) return className.includes(classAny[1])
  if (dataAttr) return element.attributes.has(dataAttr[1])
  return element.tag === selector
}

function walk(element, visit) {
  visit(element)
  for (const child of element.children) walk(child, visit)
}

/** Build a fake document over one tree. */
function createDocument(root, bodyChildren = []) {
  const body = createElement('body', '', bodyChildren)
  const all = []
  walk(root, (element) => all.push(element))
  walk(body, (element) => all.push(element))
  const query = (selector) => all.find((element) => matches(element, selector)) ?? null
  return {
    body,
    documentElement: createElement('html'),
    head: createElement('head'),
    createElement: () => createElement('div'),
    createElementNS: (_ns, tag) => createElement(tag),
    querySelector: query,
    querySelectorAll: (selector) => all.filter((element) => matches(element, selector)),
    addEventListener() {},
    removeEventListener() {},
    hasFocus: () => true,
  }
}

// ---- fixture: the shape the real layout has -------------------------------
function buildApp({ seatClass = 'abc123_composerSeat', withTextarea = true } = {}) {
  const textarea = createElement('textarea')
  const card = createElement('div', 'xyz_card', withTextarea ? [textarea] : [])
  const seat = createElement('div', seatClass, [card])
  const center = createElement('div', 'abc123_centerCol', [seat])
  const sidebar = createElement('div', 'abc123_sidebarCol')
  const frame = createElement('div', 'abc123_frame', [sidebar, center])
  const root = createElement('div', 'root', [frame])
  return { root, frame, center, sidebar, seat, card, textarea }
}

function loadWith(documentStub) {
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
  globalThis.document = documentStub
  // eslint-disable-next-line no-eval
  ;(0, eval)(source)
  return registered
}

const failures = []
const check = (ok, label) => { if (!ok) failures.push(label) }

/** Apply a full instance, keeping its real effect cleanup functions. */
function applyPlugin(documentStub) {
  const registered = loadWith(documentStub)
  const mod = registered.factory((id) => {
    if (id === 'react') return { createElement: () => null, useState: (v) => [v, () => {}], useEffect: () => {} }
    throw new Error('unexpected require: ' + id)
  })
  const effects = []
  mod.apply({
    effect: (fn) => effects.push(fn),
    locale: { register: () => () => {}, bind: () => (key) => key },
    slots: { inject: (_key, callback) => { callback(); return () => {} }, register: () => () => {} },
  })
  const disposers = effects.map((fn) => fn())
  return () => { for (const dispose of disposers.reverse()) dispose?.() }
}

function scenario(options = {}) {
  const app = buildApp(options)
  const dispose = applyPlugin(createDocument(app.root))
  const found = {
    frame: app.frame.hasAttribute('data-dsg-frame'),
    center: app.center.hasAttribute('data-dsg-center'),
    sidebar: app.sidebar.hasAttribute('data-dsg-sidebar'),
    seat: app.seat.hasAttribute('data-dsg-seat'),
  }
  dispose()
  return found
}

const shipped = scenario()
for (const [name, found] of Object.entries(shipped)) check(found, name + ' tagged in shipped layout')
check(scenario({ seatClass: 'whatever_composerRoot' }).seat, 'renamed composer class found from textarea')
check(scenario({ withTextarea: false }).seat, 'seat found by suffix without textarea')

// Native seat attributes work even if its class name no longer mentions composer.
{
  const app = buildApp({ seatClass: 'unknown' })
  app.seat.setAttribute('data-composer-seat', '')
  const dispose = applyPlugin(createDocument(app.root))
  check(app.seat.hasAttribute('data-dsg-seat'), 'native composer attribute takes priority')
  dispose()
}

// Unknown layouts stop after the bounded retry budget, then leave no markers.
{
  const app = buildApp({ withTextarea: false })
  for (const element of [app.seat, app.center, app.sidebar, app.frame]) element.className = 'unknown'
  const dispose = applyPlugin(createDocument(app.root))
  const warn = console.warn
  let warnings = 0
  console.warn = () => { warnings++ }
  try { for (let i = 0; i < 12; i++) tick() } finally { console.warn = warn }
  check(warnings === 1 && timers.size === 0, 'unknown layout warns once and stops retrying')
  check(!app.frame.hasAttribute('data-dsg-frame'), 'unknown layout does not tag a frame')
  dispose()
}

// The frame can mount before the composer; retries must wait for the seat too.
{
  const app = buildApp({ seatClass: 'unknown', withTextarea: false })
  const dispose = applyPlugin(createDocument(app.root))
  check(timers.size === 1, 'missing composer still schedules retry after frame resolves')
  app.seat.className = 'late_composerSeat'
  tick()
  check(app.seat.hasAttribute('data-dsg-seat') && timers.size === 0, 'late composer tagged and retry stops')
  dispose()
  check(!app.seat.hasAttribute('data-dsg-seat'), 'late composer marker cleaned up')
}

// Overlapping hot reload instances may tag the same DOM; old cleanup must not
// remove markers that the new instance now owns, even across module factories.
{
  const app = buildApp()
  const doc = createDocument(app.root)
  const oldDispose = applyPlugin(doc)
  const newDispose = applyPlugin(doc)
  oldDispose()
  for (const [name, element] of Object.entries({ frame: app.frame, center: app.center, sidebar: app.sidebar, seat: app.seat })) {
    check(element.hasAttribute('data-dsg-' + name), 'hot reload preserves new ' + name + ' marker')
  }
  newDispose()
  for (const [name, element] of Object.entries({ frame: app.frame, center: app.center, sidebar: app.sidebar, seat: app.seat })) {
    check(!element.hasAttribute('data-dsg-' + name), 'final cleanup removes ' + name + ' marker')
  }
}

check(timers.size === 0, 'all timers disposed')
if (failures.length > 0) {
  console.error('FAIL (' + failures.length + ')')
  for (const failure of failures) console.error(' -', failure)
  process.exit(1)
}
console.log('ok: 7 anchor scenarios including delayed mount, retry limit and hot reload cleanup')
