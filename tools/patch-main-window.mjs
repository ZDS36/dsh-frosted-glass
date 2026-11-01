#!/usr/bin/env node
/**
 * Patch the DSH desktop main window so Windows 11 draws a real window material
 * behind the page, which is the only way the panels can show the desktop.
 *
 * What changes: one options object in `createWindow()` — the win32 branch gains
 *   backgroundColor: "#00000000"      (a window cannot be material-backed while opaque)
 *   backgroundMaterial: "acrylic"     (Win11 acrylic; the welcome window already uses it)
 * Nothing else in the file is touched.
 *
 * Usage:
 *   node tools/patch-main-window.mjs --status          # is it patched? which backups exist?
 *   node tools/patch-main-window.mjs --check           # dry run: show the exact edit
 *   node tools/patch-main-window.mjs --apply           # backup, then write
 *   node tools/patch-main-window.mjs --revert [backup] # restore (newest backup by default)
 *   node tools/patch-main-window.mjs --material mica   # switch the window material (acrylic|mica|tabbed|none)
 *   node tools/patch-main-window.mjs --material mica --check   # dry run of the switch
 *
 * Exit codes: 0 ok / 2 nothing to do (already patched or not patched) / 1 refused.
 */
import { copyFileSync, readdirSync, readFileSync, renameSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/** The file inside a DSH install that owns `createWindow()`. */
const RELATIVE_TARGET = join('resources', 'app', 'lib', 'main.js')

/**
 * Find the host main.js. `DSH_MAIN_JS` wins; otherwise walk up from the current
 * directory looking for `resources/app/lib/main.js`. No path is baked in — this
 * runs on any machine and any install location.
 */
function locateTarget() {
  if (process.env.DSH_MAIN_JS) return resolve(process.env.DSH_MAIN_JS)
  let dir = process.cwd()
  for (;;) {
    const candidate = join(dir, RELATIVE_TARGET)
    try {
      statSync(candidate)
      return candidate
    } catch {}
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  console.error('refused: no resources/app/lib/main.js above', process.cwd())
  console.error('run this from the DSH install directory, or set DSH_MAIN_JS=<path to main.js>')
  process.exit(1)
}

const TARGET = locateTarget()

/** The win32 branch of the main window options, exactly as it ships. */
const ANCHOR = `\t\t\t\tsymbolColor: nativeTheme.shouldUseDarkColors ? "#f9fafb" : "#0f1115"
\t\t\t}
\t\t} : {},`

/** The same text with the two options added. */
const PATCHED = `\t\t\t\tsymbolColor: nativeTheme.shouldUseDarkColors ? "#f9fafb" : "#0f1115"
\t\t\t},
\t\t\tbackgroundColor: "#00000000",
\t\t\tbackgroundMaterial: "acrylic"
\t\t} : {},`

const count = (haystack, needle) => haystack.split(needle).length - 1
const stamp = () => new Date().toISOString().replace(/[-:]/g, '').replace(/\..*$/, '')
const lineOf = (text, index) => text.slice(0, index).split('\n').length

function backups() {
  const dir = dirname(TARGET)
  return readdirSync(dir)
    .filter((name) => name.startsWith('main.js.bak-'))
    .map((name) => join(dir, name))
    .sort()
}

function readTarget() {
  try {
    return readFileSync(TARGET, 'utf8')
  } catch (error) {
    console.error(`cannot read ${TARGET}: ${error.message}`)
    process.exit(1)
  }
}

function status() {
  const source = readTarget()
  const patched = count(source, PATCHED)
  const anchor = count(source, ANCHOR)
  console.log(`target   ${TARGET} (${source.length} bytes)`)
  console.log(`state    ${patched === 1 ? 'PATCHED' : anchor === 1 ? 'unpatched' : 'UNKNOWN (anchor not found exactly once)'}`)
  console.log(`anchor   ${anchor} occurrence(s) · patched form ${patched} occurrence(s)`)
  const list = backups()
  console.log(`backups  ${list.length === 0 ? '(none)' : list.map((p) => p.slice(dirname(TARGET).length + 1)).join(', ')}`)
  return patched === 1 ? 2 : anchor === 1 ? 0 : 1
}

function check() {
  const source = readTarget()
  const anchor = count(source, ANCHOR)
  if (anchor === 0 && count(source, PATCHED) === 1) {
    console.log('already patched — nothing to do')
    return 2
  }
  if (anchor !== 1) {
    console.error(`refused: the win32 main-window anchor appears ${anchor} time(s), expected exactly 1`)
    console.error('this DSH build formats that block differently; re-derive the anchor before patching')
    return 1
  }
  const at = source.indexOf(ANCHOR)
  console.log(`anchor found once at byte ${at} (line ${lineOf(source, at)})`)
  console.log('\n--- before ---')
  console.log(ANCHOR.replace(/\t/g, '  '))
  console.log('\n+++ after +++')
  console.log(PATCHED.replace(/\t/g, '  '))
  console.log('\neffect: the win32 main window becomes material-backed (Win11 acrylic).')
  console.log('the page must be transparent for it to show — the frosted-glass plugin already does that.')
  return 0
}

function apply() {
  const source = readTarget()
  const anchor = count(source, ANCHOR)
  if (anchor === 0 && count(source, PATCHED) === 1) {
    console.log('already patched — nothing to do')
    return 2
  }
  if (anchor !== 1) {
    console.error(`refused: anchor appears ${anchor} time(s), expected exactly 1 — nothing written`)
    return 1
  }

  const backup = `${TARGET}.bak-${stamp()}`
  copyFileSync(TARGET, backup)
  const original = statSync(TARGET)
  utimesSync(backup, original.atime, original.mtime)

  const next = source.replace(ANCHOR, PATCHED)
  const temp = `${TARGET}.tmp-${process.pid}`
  writeFileSync(temp, next, 'utf8')
  renameSync(temp, TARGET)

  console.log(`patched ${TARGET}`)
  console.log(`backup  ${backup}`)
  console.log(`rollback: cp -p "${backup}" "${TARGET}"`)
  console.log('restart the DSH desktop app for it to take effect (the shell reads window options at launch).')
  return 0
}

function revert(arg) {
  const list = backups()
  const backup = arg ?? list.at(-1)
  if (backup === undefined) {
    console.error('no backup found — nothing to revert')
    return 1
  }
  const source = readTarget()
  if (source.includes('backgroundMaterial: "acrylic"\n\t\t} : {},') === false && !source.includes(PATCHED)) {
    console.log('target does not look patched; reverting anyway')
  }
  const keep = `${TARGET}.patched-${stamp()}`
  copyFileSync(TARGET, keep)
  copyFileSync(backup, TARGET)
  console.log(`reverted ${TARGET} from ${backup}`)
  console.log(`previous (patched) copy kept at ${keep}`)
  return 0
}

/**
 * The main window's material pair, with the material word as the only variable.
 * The welcome window also sets backgroundMaterial, but it has no preceding
 * backgroundColor line, so this pair is unique to `createWindow(..., primary)`.
 */
const MATERIAL_BLOCK = (name) => `\t\t\tbackgroundColor: "#00000000",\n\t\t\tbackgroundMaterial: "${name}"\n\t\t} : {},`
const MATERIALS = ['acrylic', 'mica', 'tabbed', 'none']
const currentMaterial = (source) => MATERIALS.find((name) => count(source, MATERIAL_BLOCK(name)) === 1)

function material(name, dryRun) {
  if (!MATERIALS.includes(name)) {
    console.error(`refused: material must be one of ${MATERIALS.join(' / ')}`)
    return 1
  }
  const source = readTarget()
  const now = currentMaterial(source)
  if (now === undefined) {
    console.error('refused: the main window material block was not found exactly once — nothing written')
    console.error('run --status; if the window is unpatched, --apply first')
    return 1
  }
  if (now === name) {
    console.log(`material is already "${name}" — nothing to do`)
    return 2
  }
  const next = source.replace(MATERIAL_BLOCK(now), MATERIAL_BLOCK(name))
  if (count(next, MATERIAL_BLOCK(name)) !== 1) {
    console.error('refused: rewrite would not be unique — nothing written')
    return 1
  }
  console.log(`material  ${now} -> ${name}`)
  if (dryRun) {
    console.log('\n--- before ---')
    console.log(MATERIAL_BLOCK(now).replace(/\t/g, '  '))
    console.log('\n+++ after +++')
    console.log(MATERIAL_BLOCK(name).replace(/\t/g, '  '))
    console.log('\ndry run: nothing written. drop --check to apply.')
    return 0
  }
  const backup = `${TARGET}.bak-${stamp()}`
  copyFileSync(TARGET, backup)
  const original = statSync(TARGET)
  utimesSync(backup, original.atime, original.mtime)
  const temp = `${TARGET}.tmp-${process.pid}`
  writeFileSync(temp, next, 'utf8')
  renameSync(temp, TARGET)
  console.log(`patched   ${TARGET}`)
  console.log(`backup    ${backup}`)
  console.log(`rollback: node tools/patch-main-window.mjs --material ${now}`)
  console.log('         (or: cp -p "' + backup + '" "' + TARGET + '")')
  console.log('quit and reopen the DSH desktop app for it to take effect — that ends any running turn.')
  return 0
}

const argv = process.argv.slice(2)
const flag = argv[0] ?? '--status'
let code
if (flag === '--status') code = status()
else if (flag === '--check') code = check()
else if (flag === '--apply') code = apply()
else if (flag === '--revert') code = revert(argv[1])
else if (flag === '--material') code = material(argv[1], argv.includes('--check'))
else {
  console.error(`unknown flag ${flag}; use --status, --check, --apply, --revert or --material <name>`)
  code = 1
}
process.exit(code)
