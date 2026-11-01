/**
 * Client half of the frosted-glass bundle.
 *
 * Two lessons from dsh-appearance-glass (MIT, david0304git) are baked in here:
 *
 *   1. The number a person sets is the opacity they end up SEEING, not the
 *      alpha written into a token. One surface is often stacked twice — the
 *      Windows centre column paints `--dsw-alias-bg-base` and the conversation
 *      root paints it again — so alpha 0.13 lands on screen as 1-(1-0.13)^2 =
 *      0.24. Every surface here is derived by inverting that: a = 1-(1-t)^(1/d).
 *      Without this the low end of the range looks broken.
 *
 *   2. `backdrop-filter` on a shell container buys blur and costs two things:
 *      the blur recomputes on every resize frame (the "glass trails behind the
 *      window" effect) and the container becomes the containing block for
 *      `position: fixed` descendants, which DSH menus rely on. So blur is OFF
 *      by default here and only added when `blur > 0`.
 *
 * This file owns the panel translucency, the backdrop field and the edge
 * highlights. It does not replace a slot, wrap a component or move any DOM.
 */

window.__ModuleLoader__.load({
  id: 'dsh-frosted-glass',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const TAG = 'dsh-frosted-glass'

    /** Original abstract backdrop.svg, embedded without local desktop content. */
    const WALLPAPER = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNjAwIiBoZWlnaHQ9IjkwMCIgdmlld0JveD0iMCAwIDE2MDAgOTAwIj4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYmFzZSIgeDI9IjEiIHkyPSIxIj4KICAgICAgPHN0b3Agc3RvcC1jb2xvcj0iI2I5ZDlmZiIvPgogICAgICA8c3RvcCBvZmZzZXQ9Ii41IiBzdG9wLWNvbG9yPSIjYzZiOGVmIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iMSIgc3RvcC1jb2xvcj0iI2Y3Y2JkOCIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxyYWRpYWxHcmFkaWVudCBpZD0iZ2xvdyI+CiAgICAgIDxzdG9wIHN0b3AtY29sb3I9IiNmZmYwYzUiIHN0b3Atb3BhY2l0eT0iLjkiLz4KICAgICAgPHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjZmZmMGM1IiBzdG9wLW9wYWNpdHk9IjAiLz4KICAgIDwvcmFkaWFsR3JhZGllbnQ+CiAgPC9kZWZzPgogIDxwYXRoIGZpbGw9InVybCgjYmFzZSkiIGQ9Ik0wIDBoMTYwMHY5MDBIMHoiLz4KICA8ZWxsaXBzZSBjeD0iMTI1MCIgY3k9IjE4MCIgcng9Ijc1MCIgcnk9IjYwMCIgZmlsbD0idXJsKCNnbG93KSIvPgo8L3N2Zz4K'

    /** Everything tunable. Edit these numbers, the page picks them up on reload. */
    const CONFIG = {
      /** Composited opacity of each region, 0–100 %. This is what you see. */
      opacityBase: 13,
      opacitySidebar: 15,
      opacitySurface: 19,
      opacityOverlay: 88,
      /**
       * What sits behind the panels:
       *   'none'      = nothing: Windows DWM 亚克力在后面，页面只压一层薄纱
       *   'wallpaper' = the bundled abstract gradient (backdrop.svg)
       *   'field'     = the three colour blobs over a base colour, no image
       */
      backdrop: 'none',
      /** 'none' 模式下压在亚克力上的薄纱浓度，0-100。只影响文字对比，不影响模糊。
          磨砂玻璃是"清"的：薄纱越低，后面桌面的颜色越保真；太白就成了磨砂纸。
          浅色主题归零——磨砂感一多半是这层白给的，字靠 DWM 亚克力自己那层磨砂兜。 */
      veil: { light: 0, dark: 8 },
      /** 微颗粒浓度。磨砂玻璃的指纹就是"均匀细颗粒"，所以这里只留一点点；
          真想要磨砂味，调到 0.06 以上。0 = 完全不要。 */
      grain: { light: 0.012, dark: 0.02 },
      /** Blob tint over the backdrop, 0–100. Photo backdrops want a small value. */
      strength: 22,
      field: {
        light: { a: '#94c4ff', b: '#ffa6d6', c: '#967aff', base: '#e9f0ff' },
        dark: { a: '#5680ff', b: '#d660a8', c: '#765cff', base: '#0b0f1c' },
      },
      /** Blur radius for the columns and cards. 0 = off (no cost, no lag). */
      blur: 28,
      saturate: 1.8,
    }

    /** How many times one surface is really painted before you see it. */
    const DEPTH = { base: 2, sidebar: 1.4, surface: 1, overlay: 1 }
    const DELTA_REFERENCE = 68

    /** Neutral ramp, copied from the official alias table so only alpha moves. */
    const LIGHT = {
      '00': '255 255 255', '50': '249 250 251', '60': '245 246 247', '75': '241 243 245',
      '100': '235 238 242', '150': '233 236 242', 'ds50': '237 243 254', 'n50': '250 250 250',
      '850': '44 44 46', '800': '53 54 56',
    }
    const DARK = {
      '00': '21 21 23', '50': '27 27 28', '60': '44 44 46', '75': '67 69 74',
      '100': '35 35 36', '700': '97 102 107', '750': '67 69 74', '800': '53 54 56',
      'n50': '41 41 41', 'ds50': '44 44 46',
    }

    /** [token, lightKey, darkKey, delta, group] — the official surfaces, alpha only. */
    const SURFACES = [
      ['--dsw-alias-bg-base', '00', '00', 0, 'base'],
      ['--dsw-specific-sidebar-fill', '50', '50', 0, 'sidebar'],
      ['--dsw-specific-sidebar-nav-item-active', '100', '75', 12, 'sidebar'],
      ['--dsw-specific-sidebar-nav-item-hover', '75', '60', 6, 'sidebar'],
      ['--dsw-specific-input-major', '00', '60', 0, 'surface'],
      ['--dsw-specific-login-input', '50', '00', 2, 'surface'],
      ['--dsw-alias-bg-layer-1', '00', '100', 6, 'surface'],
      ['--dsw-alias-bg-layer-2', '00', '60', 10, 'surface'],
      ['--dsw-alias-bg-layer-3', '00', '800', 14, 'surface'],
      ['--dsw-alias-bg-module-platform', '60', '800', 10, 'surface'],
      ['--dsw-alias-bg-multi-select', '60', '60', 10, 'surface'],
      ['--dsw-alias-bg-document-preview', '100', '00', 6, 'surface'],
      ['--dsw-specific-bubble', 'ds50', '60', 4, 'surface'],
      ['--dsw-specific-tip', '60', '800', 8, 'surface'],
      ['--dsw-specific-selector', '60', '800', 8, 'surface'],
      ['--dsw-alias-markdown-code-block', '50', '00', 14, 'surface'],
      ['--dsw-alias-markdown-code-block-banner', '50', '60', 16, 'surface'],
      ['--dsw-alias-markdown-inline-code', 'n50', 'n50', 12, 'surface'],
      ['--dsw-alias-markdown-tag', '75', '60', 10, 'surface'],
      ['--dsw-alias-button-floating-fill', '00', '60', 12, 'surface'],
      ['--dsw-alias-button-floating-hover', '75', '800', 14, 'surface'],
      ['--dsw-alias-bg-overlay', '150', '700', 0, 'overlay'],
      ['--dsw-alias-tooltip-bg', '850', '750', 18, 'overlay'],
      ['--dsw-alias-toast-bg', '800', '750', 20, 'overlay'],
      ['--dsw-menu-surface-fill', 'menu', 'menuDark', 14, 'overlay'],
      ['--dsw-specific-menu', 'menu', 'menuDark', 14, 'overlay'],
      ['--dsw-alias-menu-group-header-fill', 'menu', 'menuHeaderDark', 20, 'overlay'],
    ]

    /** Menu surfaces are rgba() literals in the official theme, not ramp slots. */
    const MENU = { menu: '248 249 250', menuDark: '67 69 74', menuHeaderDark: '48 49 54' }

    /**
     * 实心表面：读字和打字的地方，alpha 写死、不跟"面板不透明度"滑杆走。
     *   layer-2 = 设置面板（settings-general 的 G_panel），layer-3 = 里面嵌的卡片；
     *   input-major = 输入卡本身（对话输入框、登录框、附件卡）。
     * 聊天区可以透到 6.7 %，这几张不行——透明到底就没法读、也没法看出那是个框。
     */
    const READING = {
      '--dsw-alias-bg-layer-2': [0.94, 0.90],
      '--dsw-alias-bg-layer-3': [0.92, 0.92],
      '--dsw-specific-input-major': [0.68, 0.64],
      /* 悬浮窗 / 费用面板：usage-cost 的 .uc_wsTip 和 .uc_panel 都用这个令牌，
         「悬停项目看耗费」那一下弹出来的就是它。工具提示是读字表面，不给它留透明度。 */
      '--dsw-alias-bg-overlay': [0.97, 0.94],
    }

    const clamp = (v, min, max) => (v < min ? min : v > max ? max : v)

    /** Invert the stacking: what single-layer alpha composites to `target`? */
    function layerAlpha(target, depth) {
      const t = clamp(target, 0, 100) / 100
      if (t <= 0) return 0
      if (t >= 1) return 1
      return 1 - Math.pow(1 - t, 1 / depth)
    }

    /** Final alpha for one surface, in 0–1. */
    function surfaceAlpha(target, group, delta) {
      const a = layerAlpha(target, DEPTH[group]) + (delta * target) / 100 / DELTA_REFERENCE
      return clamp(a, 0, 1)
    }

    /** `rgb(r g b / a)` for one ramp slot (or one menu literal). */
    function paint(ramp, key, alpha) {
      return `rgb(${ramp[key] ?? MENU[key]} / ${alpha.toFixed(3)})`
    }

    /** One token block for one colour scheme. */
    function tokenBlock(ramp, pick) {
      const lines = []
      for (const [token, lightKey, darkKey, delta, group] of SURFACES) {
        const key = pick(lightKey, darkKey)
        const target = CONFIG['opacity' + group[0].toUpperCase() + group.slice(1)]
        lines.push(`  ${token}: ${paint(ramp, key, surfaceAlpha(target, group, delta))} !important;`)
      }
      return lines.join('\n')
    }

    /** The backdrop: colour tints on top, the wallpaper or a flat base underneath. */
    function field(kind) {
      const c = CONFIG.field[kind]
      const s = clamp(CONFIG.strength, 0, 100) / 100
      const a = (f) => 0.85 * s * f
      const layers = [
        `radial-gradient(62% 58% at 18% 14%, ${rgba(c.a, a(1))}, ${rgba(c.a, 0)} 66%)`,
        `radial-gradient(54% 50% at 84% 6%, ${rgba(c.b, a(0.82))}, ${rgba(c.b, 0)} 66%)`,
        `radial-gradient(62% 58% at 76% 88%, ${rgba(c.c, a(0.74))}, ${rgba(c.c, 0)} 68%)`,
        CONFIG.backdrop === 'wallpaper' ? 'var(--dsg-wallpaper)' : solid(c.base),
      ]
      return layers.map((layer) => '    ' + layer).join(',\n')
    }

    /** `#rrggbb` → `r g b`. */
    function triplet(value) {
      const n = parseInt(value.replace('#', ''), 16)
      return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`
    }

    /** `#rrggbb` → `rgb(r g b)` (or with an alpha). */
    function solid(value) {
      return `rgb(${triplet(value)})`
    }

    function rgba(value, alpha) {
      return `rgb(${triplet(value)} / ${alpha.toFixed(3)})`
    }

    /**
     * Blur rules. `backdrop-filter` 的代价不是"糊一下"：每个带它的元素都要单独开一张
     * 合成图层，并且每帧回读它后面的像素。所以只给"后面真有内容"的东西上模糊。
     *
     * 亚克力模式（backdrop: 'none'）下，列 / 面板后面只有 body::before 那一层纯色薄纱 ——
     * 把它再糊一遍，屏幕上一个像素都不会变（纯色经过任何半径的高斯还是它自己），
     * 但合成图层和每帧回读照旧。这就是最典型的无谓开销，全部去掉，只留输入卡：
     * 输入卡是 sticky 的，底下确实压着滚动的消息，那里的模糊是真起作用。
     */
    function blurRules() {
      if (!(CONFIG.blur > 0)) return ''
      // 半径走 CSS 变量，设置页的滑杆改的就是它；样式表里给的是默认值。
      const filter = `var(--dsg-card-filter, blur(var(--dsg-blur, ${CONFIG.blur}px)) saturate(var(--dsg-sat, ${CONFIG.saturate})))`
      const acrylic = CONFIG.backdrop === 'none'
      const targets = acrylic
        ? ['[class$="_composerSeat"] [class$="_card"]']
        : [
            '[class$="_centerCol"]',
            '[class$="_sidebarCol"]',
            '[class$="_rightbarCol"]',
            '[class$="_bottomRow"]',
            '[class$="_card"]',
            '[class$="_bubble"]',
            '[class$="_panel"]',
          ]
      const guard = targets.map((t) => `html[data-dsg-resizing] ${t}`).join(',\n')
      return `
${targets.join(',\n')} {
  backdrop-filter: ${filter} !important;
  -webkit-backdrop-filter: ${filter} !important;
}

/* 窗口拖动/缩放时撤掉模糊：blur 每帧重算就是"跟不上"的元凶，松手 160ms 后回来。 */
${guard} {
  backdrop-filter: none !important;
  -webkit-backdrop-filter: none !important;
}
`
    }

    /** 'none' 模式：页面不再画底板，模糊交给窗口的 DWM 材质。 */
    const ACRYLIC = CONFIG.backdrop === 'none'
    /** html 底色：亚克力模式必须透明，否则整块不透明会盖住材质。 */
    const baseplate = (kind) => (ACRYLIC ? 'transparent' : CONFIG.field[kind].base)
    /** 薄纱：给文字一点底，不遮住材质。 */
    const veil = (kind) =>
      ACRYLIC
        ? `rgb(${kind === 'dark' ? '6 8 14' : '255 255 255'} / ${(CONFIG.veil[kind] / 100).toFixed(3)})`
        : 'transparent'
    /** 底板图层：亚克力模式下为空。 */
    const plate = (kind) => (ACRYLIC ? 'none' : field(kind))

    /**
     * 微颗粒：96×96 的 SVG 噪声，铺在薄纱里当玻璃的"砂面"。
     * 这是磨砂玻璃最好用的一招假货——一点点不均匀就让人相信它有厚度；
     * 一张静态贴图，零动画、零回读、零合成图层。
     */
    function grain(kind) {
      const alpha = CONFIG.grain[kind]
      if (!(alpha > 0)) return 'none'
      const svg = "<svg xmlns='http://www.w3.org/2000/svg' width='96' height='96'>"
        + "<filter id='g'>"
        + "<feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/>"
        + "<feColorMatrix type='saturate' values='0'/>"
        + "</filter>"
        + `<rect width='96' height='96' filter='url(#g)' opacity='${alpha}'/>`
        + "</svg>"
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
    }

    /** 不透明度倍数：滑杆改它，token 表整张重算（CSS 里算不了，见 README）。 */
    const tokens = { sheet: null, value: 1 }

    /**
     * 窗口棱边的三条基准 alpha：上沿高光、上沿柔光、底部反光。
     * 滑杆按倍数把它们写进 CSS 变量——不能在 CSS 里用 calc() 乘：
     * 这个 Chromium 直接判整条声明无效（见 README）。
     */
    const RIM = { edge: 0.34, glow: 0.5, bounce: 0.18, spec: 0.15, spec2: 0.07, dEdge: 0.2, dGlow: 0.26, dBounce: 0.18, dSpec: 0.09, dSpec2: 0.04 }

    /** 按 0–100 的强度把十条变量写进 :root。 */
    function refreshRim(v) {
      const k = clamp(v, 0, 100) / 100
      const style = document.documentElement.style
      const put = (name, base) => style.setProperty(name, (base * k).toFixed(3))
      put('--dsg-rim', RIM.edge)
      put('--dsg-rim2', RIM.glow)
      put('--dsg-rim3', RIM.bounce)
      put('--dsg-spec', RIM.spec)
      put('--dsg-spec2', RIM.spec2)
      put('--dsg-rimd', RIM.dEdge)
      put('--dsg-rimd2', RIM.dGlow)
      put('--dsg-rimd3', RIM.dBounce)
      put('--dsg-specd', RIM.dSpec)
      put('--dsg-specd2', RIM.dSpec2)
    }

    /** 一整张 token 表，alpha 乘上倍数。 */
    function tokenSheet(mult) {
      const scale = (ramp, pick, scheme) => SURFACES.map(([token, lightKey, darkKey, delta, group]) => {
        const target = CONFIG['opacity' + group[0].toUpperCase() + group.slice(1)]
        const fixed = READING[token]
        // 读字表面不吃倍数：滑杆把它拖成透明就等于把设置页废掉。
        const alpha = fixed !== undefined
          ? fixed[scheme]
          : clamp(surfaceAlpha(target, group, delta) * mult, 0, 1)
        return `  ${token}: ${paint(ramp, pick(lightKey, darkKey), alpha)} !important;`
      }).join('\n')
      return `body {\n${scale(LIGHT, (l) => l, 0)}\n}\n\nbody[data-ds-dark-theme] {\n${scale(DARK, (_, d) => d, 1)}\n}\n`
    }

    /** 重写第二张表；tag 还没建好时只记住值。 */
    function refreshTokens(mult) {
      tokens.value = mult
      if (tokens.sheet !== null) tokens.sheet.textContent = tokenSheet(mult)
    }

    const SHEET = `
/* ================= 1. 面板后面的底板 ================= */
:root {
  /* 亚克力模式下壁纸根本不用：这张 129 KB 的 base64 不再进样式表，
     启动时省掉一次解析 + 一份内存（样式表从 ~178 KB 掉到 ~50 KB）。 */
  --dsg-wallpaper: ${ACRYLIC ? 'none' : `url("${WALLPAPER}")`};
  --dsg-grain: ${grain('light')};
  --dsg-grain-d: ${grain('dark')};
  --dsg-blur: ${CONFIG.blur}px;
  --dsg-sat: ${CONFIG.saturate};
}

html { background-color: ${baseplate('light')}; }
html:has(body[data-ds-dark-theme]) { background-color: ${baseplate('dark')}; }

body { background-color: transparent !important; }

body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: ${veil('light')};
  background-image: var(--dsg-grain),
${plate('light')};
  background-size: 96px 96px, cover;
  background-position: 0 0, center;
  background-repeat: repeat, no-repeat;
}

body[data-ds-dark-theme]::before {
  background-color: ${veil('dark')};
  background-image: var(--dsg-grain-d),
${plate('dark')};
}

/* ================= 2. 表面 token 在另一张表里（opacity 滑杆要能重写） ================= */

/* ================= 3. 玻璃棱边：no lines, only light ================= */
/* 窗口外沿按"一块有厚度的玻璃"来画，而不是"一张磨砂纸的边"：
   轮廓一圈 1px 高光（specular），贴着它 3px 的折光，再往里 22px 的暗影当厚度。
   全是 inset 阴影——inset 只影响贴着边的那一圈，所以不需要 mask，也不改布局。
   全机有六七种 *_frame（文档预览、浏览器、附件、提问卡片各一个），只认装着三个列的那块：
   :has([class$="_sidebarCol"]) 是唯一能稳定区分 app 外框的锚点，套在里面的那些不含侧栏。
   画在覆盖层而不是给 frame 加 border：直接加会挤掉 6px 宽度，让 computeColumns()
   算出的三列装不下；绝对定位的覆盖层不参与布局。 */
/* 还有一样比边框更管用：**有形状的镜面反光**。磨砂玻璃是均匀散射，没有高光斑；
   玻璃有一块软的、拉长的反光（光源在上面偏左），再加一点右下角的回光。
   这两块渐变就足够把"磨砂纸"换成"亮面玻璃"——它盖在内容上方，iOS 也这么做。 */
[data-windows-titlebar] [class$="_frame"]:has([class$="_sidebarCol"])::after {
  content: "";
  position: absolute;
  inset: 0;
  z-index: 20;
  box-sizing: border-box;
  pointer-events: none;
  background-image:
    radial-gradient(92% 56% at 5% -14%,
      rgb(255 255 255 / var(--dsg-spec, 0.150)),
      rgb(255 255 255 / 0) 62%),
    radial-gradient(58% 40% at 100% 110%,
      rgb(255 255 255 / var(--dsg-spec2, 0.070)),
      rgb(255 255 255 / 0) 60%);
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / var(--dsg-rim, 0.340)),
    inset 0 0 3px 0 rgb(255 255 255 / var(--dsg-rim2, 0.500)),
    inset 0 0 22px -4px rgb(12 16 28 / var(--dsg-rim3, 0.180));
}
body[data-ds-dark-theme] [class$="_frame"]:has([class$="_sidebarCol"])::after {
  background-image:
    radial-gradient(92% 56% at 5% -14%,
      rgb(255 255 255 / var(--dsg-specd, 0.090)),
      rgb(255 255 255 / 0) 62%),
    radial-gradient(58% 40% at 100% 110%,
      rgb(255 255 255 / var(--dsg-specd2, 0.040)),
      rgb(255 255 255 / 0) 60%);
  box-shadow:
    inset 0 0 0 1px rgb(255 255 255 / var(--dsg-rimd, 0.200)),
    inset 0 0 3px 0 rgb(255 255 255 / var(--dsg-rimd2, 0.260)),
    inset 0 0 22px -4px rgb(0 0 0 / var(--dsg-rimd3, 0.180));
}
/* 侧栏与中栏之间原来是一条 .5px 实线，在模糊背景上像刀口；换成透明 + 内侧高光。 */
[class$="_sidebarCol"] {
  border-right-color: transparent !important;
}
/* 标题栏那条拖动带：原来整条透明，和下面的栏位一比就是一块没上色的白条。
   现在按列宽度铺同一种半透明色（左边跟侧栏、右边跟中栏）。
   这里不再加 backdrop-filter：三列被 44px 的标题带内边距推开、并不在它后面，
   它背后只有一层纯色薄纱，糊它等于糊自己。 */
[data-windows-titlebar] [class$="_frame"]:has([class$="_sidebarCol"])::before {
  background:
    linear-gradient(to right,
      var(--dsw-specific-sidebar-fill) 0,
      var(--dsw-specific-sidebar-fill) 14%,
      var(--dsw-alias-bg-base) 40%,
      var(--dsw-alias-bg-base) 100%) !important;
}

/* 只给输入框下方那排数据做一小块玻璃：一整条横带，不是整片输入区。
   用 :has([data-composer-stat]) 精确命中"装着统计胶囊"的那个 dock，
   队列里的 dock 也是 _dock，但没有这个属性。 */
[class$="_dock"]:has([data-composer-stat]) {
  width: fit-content;
  margin: 6px auto 2px;
  padding: 3px 14px;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.42);
  backdrop-filter: blur(24px) saturate(1.8);
  -webkit-backdrop-filter: blur(24px) saturate(1.8);
  box-shadow:
    0 1px 8px rgb(8 12 24 / 0.06),
    inset 0 1px 0 rgb(255 255 255 / 0.42),
    inset 0 2px 10px -6px rgb(255 255 255 / 0.40);
}
body[data-ds-dark-theme] [class$="_dock"]:has([data-composer-stat]) {
  background: rgb(22 24 32 / 0.44);
  box-shadow:
    0 1px 8px rgb(0 0 0 / 0.28),
    inset 0 1px 0 rgb(255 255 255 / 0.09);
}
/* 侧栏与中栏之间那条竖缝：中栏原来有一个 18px 的圆角，侧栏是直角，
   两下一凑就成了一个"缺口"。把内圆角归零，接缝变直，圆角只留给窗口本身。
   接缝本身不给线，给"折光"：中栏左沿一道 1px 高光 + 贴边 2px 折光 + 内侧一层很散的暗，
   和窗口外沿同一套语言——读起来是"两块玻璃叠着"，而不是"中间画了一条线"。 */
[data-windows-titlebar] [class$="_frame"]:has([class$="_sidebarCol"]) {
  --dsh-windows-content-radius: 0px;
  background-color: transparent !important;
}
[data-windows-titlebar] [class$="_centerCol"] {
  border-radius: 0 !important;
  box-shadow:
    inset 1px 0 0 rgb(255 255 255 / 0.34),
    inset 2px 0 4px -2px rgb(255 255 255 / 0.30),
    inset 14px 0 20px -16px rgb(12 16 28 / 0.26);
}
body[data-ds-dark-theme] [class$="_centerCol"] {
  box-shadow:
    inset 1px 0 0 rgb(255 255 255 / 0.10),
    inset 2px 0 4px -2px rgb(255 255 255 / 0.12),
    inset 14px 0 20px -16px rgb(0 0 0 / 0.45);
}
/* 列上原来有一圈 0.5px 内描边，正好在标题带下面画出一条发丝线，去掉。 */

/* 输入框周围那圈白，原来是这里给的：整条 seat 铺一层 34 % 白、全宽，用来挡
   "消息滚到输入框底下直接糊在字上"。现在输入卡自己是 68 % 实心的，这层就多余了——
   它沿着 seat 的顶边在聊天区画出一条横向亮带，看着就是"输入框周围一圈白"。
   要恢复（滚动文字确实会从卡片两侧和上沿透出来）：
     background: linear-gradient(180deg, rgb(255 255 255 / 0) 0, rgb(255 255 255 / 0.34) 40px) !important;
   深色主题换成 rgb(14 16 22 / 0.40)。 */
[class$="_composerSeat"] {
  background: none !important;
}
/* 输入卡浮起来：磨砂玻璃的控件是"贴"在内容之上的，靠底下一层很散的阴影分开。 */
[class$="_composerSeat"] [class$="_card"] {
  box-shadow:
    0 10px 30px -14px rgb(16 20 34 / 0.30),
    0 1px 2px rgb(16 20 34 / 0.05),
    inset 0 1px 0 rgb(255 255 255 / 0.45) !important;
}
body[data-ds-dark-theme] [class$="_composerSeat"] [class$="_card"] {
  box-shadow:
    0 10px 30px -14px rgb(0 0 0 / 0.55),
    0 1px 2px rgb(0 0 0 / 0.30),
    inset 0 1px 0 rgb(255 255 255 / 0.08) !important;
}
/* 输入卡的一圈边：1px，从上到下亮→灭→回光，沿圆角走。
   用 mask 把渐变裁成一条环（content-box 挖空），而不是 border-image ——
   border-image 会把圆角吃掉，卡片四个角会变方。
   万一 mask-composite 不被支持，这层只会整体覆盖成一层白膜，所以下面那句
   @supports 兜底直接关掉它：宁可不显示，不能糊住输入框。 */
[class$="_composerSeat"] [class$="_card"]::after {
  content: "";
  position: absolute;
  inset: 0;
  padding: 1px;
  border-radius: inherit;
  pointer-events: none;
  background: linear-gradient(160deg,
    rgb(255 255 255 / 0.38) 0%,
    rgb(255 255 255 / 0.08) 34%,
    rgb(255 255 255 / 0.02) 64%,
    rgb(255 255 255 / 0.16) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
@supports not (mask-composite: exclude) {
  [class$="_composerSeat"] [class$="_card"]::after { content: none; }
}


/* 气泡和数据条用同一套"折光"语言：上沿一道高光 + 一层向内散开的光，
   不做硬描边。整块界面因此是一个材质，而不是一堆贴了边的白块。 */
[class$="_bubble"] {
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.34),
    inset 0 2px 12px -7px rgb(255 255 255 / 0.42);
}
body[data-ds-dark-theme] [class$="_bubble"] {
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 0.07),
    inset 0 2px 12px -7px rgb(255 255 255 / 0.10);
}
${blurRules()}
/* ================= 4. 设置页：模糊半径 ================= */
.dsgRow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 16px 0;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.dsgRowText { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.dsgRowLabel { color: var(--dsw-alias-label-secondary); font-size: 13px; line-height: 20px; }
.dsgRowHint { color: var(--dsw-alias-label-tertiary); font-size: 12px; line-height: 16px; }
.dsgRowControl { display: flex; align-items: center; gap: 10px; flex: none; }
.dsgRange { width: 180px; accent-color: var(--dsw-alias-brand-primary); cursor: pointer; }
.dsgRowValue {
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 16px;
  min-width: 44px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* ================= 5. 降级 ================= */
@media (prefers-reduced-transparency: reduce) {
  body::before { background: ${CONFIG.field.light.base}; }
  body[data-ds-dark-theme]::before { background: ${CONFIG.field.dark.base}; }
}
`

    /**
     * One settings row: a labelled slider that writes one CSS variable and
     * remembers the number in localStorage. Two rows share it: blur radius and
     * surface opacity.
     */
    function sliderRow(t, spec) {
      const read = () => {
        const raw = localStorage.getItem(spec.key)
        const n = raw === null ? Number.NaN : Number(raw)
        return Number.isFinite(n) ? clamp(n, spec.min, spec.max) : spec.fallback
      }
      return function FrostedGlassRow() {
        const [value, setValue] = React.useState(read)
        React.useEffect(() => {
          document.documentElement.style.setProperty(spec.cssVar, spec.toCss(value))
          if (spec.commit !== undefined) spec.commit(value)
          try { localStorage.setItem(spec.key, String(value)) } catch {}
        }, [value])
        return h('div', { className: 'dsgRow' },
          h('div', { className: 'dsgRowText' },
            h('div', { className: 'dsgRowLabel' }, t(spec.title)),
            h('div', { className: 'dsgRowHint' }, t(spec.hint))),
          h('div', { className: 'dsgRowControl' },
            h('input', {
              type: 'range',
              min: spec.min,
              max: spec.max,
              step: spec.step,
              value,
              className: 'dsgRange',
              'aria-label': t(spec.title),
              onChange: (event) => setValue(Number(event.target.value)),
            }),
            h('span', { className: 'dsgRowValue' }, spec.display(value))),
        )
      }
    }

    /** 两个旋钮。改 key/min/max 就能调出别的滑杆。 */
    const SLIDERS = [
      {
        id: 'frosted-glass-blur',
        order: 40,
        key: 'dsg.blur',
        cssVar: '--dsg-blur',
        min: 0,
        max: 60,
        step: 1,
        fallback: CONFIG.blur,
        toCss: (v) => v + 'px',
        display: (v) => (v === 0 ? '关' : v + ' px'),
        title: 'blur.title',
        hint: 'blur.hint',
      },
      {
        id: 'frosted-glass-opacity',
        order: 41,
        key: 'dsg.tint',
        cssVar: '--dsg-tint',
        min: 40,
        max: 160,
        step: 5,
        fallback: 100,
        toCss: (v) => String(v / 100),
        display: (v) => v + ' %',
        title: 'opacity.title',
        hint: 'opacity.hint',
        commit: (v) => refreshTokens(v / 100),
      },
      {
        id: 'frosted-glass-rim',
        order: 42,
        key: 'dsg.rim',
        cssVar: '--dsg-rim-k',
        min: 0,
        max: 150,
        step: 5,
        fallback: 100,
        toCss: (v) => String(v / 100),
        display: (v) => (v === 0 ? '关' : v + ' %'),
        title: 'rim.title',
        hint: 'rim.hint',
        commit: (v) => refreshRim(v),
      },
    ]

    const NS = 'frosted-glass'
    const ZH = {
      'blur.title': '玻璃模糊半径',
      'blur.hint': '面板磨砂强度，0 = 只保留半透明',
      'opacity.title': '面板不透明度',
      'opacity.hint': '数值越高越"实"，越低越透；100% 是默认',
      'rim.title': '窗口棱边强度',
      'rim.hint': '窗口最外那圈玻璃边的亮度；0 = 完全去掉',
    }
    const EN = {
      'blur.title': 'Glass blur radius',
      'blur.hint': 'Frost strength of the panels; 0 keeps translucency only',
      'opacity.title': 'Panel opacity',
      'opacity.hint': 'Higher is more solid, lower is more transparent; 100% is the default',
      'rim.title': 'Window rim strength',
      'rim.hint': 'Brightness of the glass edge around the window; 0 removes it',
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        /**
         * Every apply owns its own <style> element and removes exactly that
         * one. A shared, deduplicated tag loses the hot-reload race: the
         * incoming instance finds the outgoing tag, returns a no-op disposer,
         * and the outgoing instance's cleanup then deletes it — no stylesheet.
         */
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.dshPlugin = TAG
          tag.textContent = SHEET
          document.head.appendChild(tag)
          return () => {
            tag.remove()
          }
        }, 'frosted-glass: stylesheet')

        /**
         * Tokens go in their own sheet so the opacity slider can rewrite them
         * without touching the 180 KB wallpaper sheet. Emitted after the big
         * one, so equal-specificity !important declarations resolve to these.
         */
        ctx.effect(() => {
          const tag = document.createElement('style')
          tag.dataset.dshPlugin = TAG + '-tokens'
          tag.textContent = tokenSheet(tokens.value)
          document.head.appendChild(tag)
          tokens.sheet = tag
          return () => {
            if (tokens.sheet === tag) tokens.sheet = null
            tag.remove()
          }
        }, 'frosted-glass: token sheet')

        // 存过的值要早于滑杆生效：页面刚起来时先按它渲染。
        for (const spec of SLIDERS) {
          try {
            const raw = localStorage.getItem(spec.key)
            const stored = raw === null ? Number.NaN : Number(raw)
            if (Number.isFinite(stored)) {
              const v = clamp(stored, spec.min, spec.max)
              document.documentElement.style.setProperty(spec.cssVar, spec.toCss(v))
              if (spec.commit !== undefined) spec.commit(v)
            }
          } catch {}
        }

        try {
          const raw = localStorage.getItem('dsg.tint')
          const stored = raw === null ? Number.NaN : Number(raw)
          if (Number.isFinite(stored)) tokens.value = clamp(stored, 40, 160) / 100
        } catch {}

        ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'frosted-glass: dictionaries')

        const t = ctx.locale.bind(NS)
        for (const spec of SLIDERS) {
          ctx.effect(() => ctx.slots.inject('settings.general.item', () => ctx.slots.register({
            name: 'settings.general.item',
            id: spec.id,
            order: spec.order,
          }, sliderRow(t, spec))), 'frosted-glass: setting ' + spec.id)
        }

        /** Resize guard, only meaningful while blur is on. */
        if (CONFIG.blur > 0) {
          ctx.effect(() => {
            const root = document.documentElement
            let timer = null
            const settle = () => {
              timer = null
              root.removeAttribute('data-dsg-resizing')
            }
            const onResize = () => {
              if (timer === null) root.setAttribute('data-dsg-resizing', '')
              else clearTimeout(timer)
              timer = setTimeout(settle, 160)
            }
            window.addEventListener('resize', onResize, { passive: true })
            return () => {
              window.removeEventListener('resize', onResize)
              if (timer !== null) clearTimeout(timer)
              root.removeAttribute('data-dsg-resizing')
            }
          }, 'frosted-glass: resize guard')
        }
      },
    }
  },
})
