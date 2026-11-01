# DSH Liquid Glass · 液态玻璃

为 DSH 的 Web 对话界面提供半透明面板、背景模糊和玻璃边缘高光，跟随浅色与深色主题。当前版本：**0.2.0**。

这是第三方外观插件，依赖 DSH 的客户端模块加载器、主题令牌和设置插槽，不能作为独立网页直接运行。

## 功能

- 为侧栏、聊天区、输入卡、气泡及弹出层设置半透明表面。
- 设置页提供模糊半径、面板不透明度、窗口棱边强度三个滑杆。
- 设置面板、输入卡和工具提示保留较高不透明度，优先保证可读性。
- 窗口缩放期间临时关闭页面模糊，结束后恢复。
- 支持 Windows 窗口材质、内置抽象背景和纯 CSS 光场三种底板方案。

## 安装

需要 Git、Node.js，以及 DSH profile 使用的 pnpm。尚未发布到 npm。

```powershell
git clone https://github.com/ZDS36/dsh-liquid-glass.git
cd dsh-liquid-glass
npm test
```

在 DSH 当前 profile 目录的 `package.json` 中，将以下两项合并进原有配置。常见 profile 路径为 `~/.dsh/profiles/<profile>/`；先确认当前使用的 profile，并备份其配置。

```json
{
  "dependencies": {
    "dsh-liquid-glass": "link:D:/plugins/dsh-liquid-glass"
  },
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-liquid-glass"
      ]
    }
  }
}
```

将 `D:/plugins/dsh-liquid-glass` 换成实际克隆目录，保留原有依赖与 bundles 条目。在 **profile 目录**运行 `pnpm install`，然后退出并重新打开 DSH。插件列表中应出现「液态玻璃」。重启前先结束正在运行的任务。

## 选择背景方案

编辑 `client.js` 顶部 `CONFIG.backdrop`，保存后重新加载插件或重启 DSH。

| 值 | 背景 | 条件 |
| --- | --- | --- |
| `'none'`（当前默认） | 页面透明，供桌面窗口材质显示 | 需要支持材质的桌面壳；Windows 主窗口补丁见下文 |
| `'wallpaper'` | 随插件内嵌的抽象渐变 SVG | 无需修改桌面壳 |
| `'field'` | 页面内的静态彩色光场 | 无需修改桌面壳 |

**首次使用且不想修改 DSH 安装文件，建议选择 `'field'`。** 默认的 `'none'` 不会自动给桌面壳打补丁；没有窗口材质时，也不会自动透出桌面。

`wallpaper` 只是历史配置名。发布版使用原创的 [backdrop.svg](backdrop.svg)，不会自动读取你的系统壁纸。修改该 SVG 后，运行：

```powershell
node test/embed-backdrop.cjs
npm test
```

脚本会先备份 `client.js`，再更新其内嵌背景。自定义背景会随 `client.js` 一起发布，提交前请自行确认其中没有隐私内容和外部资源引用。

## 可选：Windows 主窗口材质补丁

此功能面向支持窗口材质的 Windows 11 / Electron 环境。实际效果取决于 DSH、Electron 和系统设置；不保证兼容所有版本。

插件本身只改页面样式。要让 `'none'` 模式显示窗口后方的系统材质，需要额外运行 [tools/patch-main-window.mjs](tools/patch-main-window.mjs)，它会修改 **DSH 安装目录**中的 `resources/app/lib/main.js`。仅在需要该效果时手动执行。

在 PowerShell 中指定实际安装文件路径：

```powershell
$env:DSH_MAIN_JS = 'D:/Apps/DSH/resources/app/lib/main.js'
node tools/patch-main-window.mjs --status
node tools/patch-main-window.mjs --check
```

`--status` 和 `--check` 只读取、显示状态及预期改动。检查无误后：

```powershell
node tools/patch-main-window.mjs --apply
```

脚本要求目标代码片段精确匹配且仅出现一次，否则拒绝写入；写入前创建 `main.js.bak-<时间戳>` 备份。退出并重新打开 DSH 后生效，**重启会中断正在运行的任务**。DSH 更新可能覆盖补丁；遇到不匹配不要强行替换。

恢复最新备份：

```powershell
node tools/patch-main-window.mjs --revert
```

恢复时也会保留修改后文件的副本。如果 DSH 已更新，请先确认备份属于当前版本，避免把旧版主程序文件覆盖回来。仓库不包含 DSH 的程序文件或本机备份。

## 设置

启用插件后，在「设置 → 通用」中调整：

| 设置 | 范围 | 默认值 |
| --- | --- | --- |
| 玻璃模糊半径 | 0–60 px，0 关闭页面模糊 | 28 px |
| 面板不透明度 | 40–160%，越高越实 | 100% |
| 窗口棱边强度 | 0–150% | 100% |

设置即时生效，分别保存在本地 `localStorage` 的 `dsg.blur`、`dsg.tint`、`dsg.rim` 中。当前棱边计算在 100% 封顶，100–150% 的视觉效果相同。面板不透明度不会降低设置面板、输入卡和工具提示的固定不透明度。

模糊与透明度会影响 GPU 开销及文字对比度。若出现菜单定位异常、缩放卡顿或文字不清晰，可降低模糊半径、提高面板不透明度，或停用插件。

## 开发与检查

```powershell
npm test
node --check client.js
node --check tools/patch-main-window.mjs
node test/preview.mjs
```

`npm test` 使用 Node.js 内置模块，无需安装额外依赖，检查生成的 CSS、表面令牌、透明度计算、设置插槽和缩放守卫。`preview.mjs` 生成 `test/preview-glass.html`，内容是虚构消息，可在浏览器中打开查看静态布局；它不能验证系统窗口材质。

`test/` 中的 PowerShell 脚本是手动截图或性能诊断工具，不属于插件运行逻辑。部分脚本包含本机测量时的进程 ID，使用前需按实际进程调整；它们不会在 `npm test` 中运行。截图可能包含屏幕内容，请勿直接提交。

项目结构：

```text
client.js                    客户端样式与设置
index.js                     无运行逻辑的 Host 入口
cordis.patch.yml              DSH bundle 注册
locale/                      插件元信息翻译
backdrop.svg                 可公开分发的抽象背景
icon.svg                     插件图标
tools/patch-main-window.mjs   可选的桌面主窗口补丁工具
test/                        CSS 检查、预览与手动诊断
```

当前检查覆盖 Node 环境下的静态与模拟 DOM 行为，不代表所有 DSH 版本、系统材质或长时间使用均已验证。插件使用 DSH 内部 CSS 类名后缀和插槽，DSH 更新后可能需要适配。

## 隐私

- 当前插件代码没有网络请求、遥测、账号凭据或会话内容读取逻辑；Host 入口为空。
- 插件只保存上述三个本地外观数值，不自动截屏或读取系统壁纸。
- 手动截图脚本与窗口补丁工具只有在用户执行时才运行。
- 本机壁纸、实际会话截图、备份、生成的预览 HTML、日志和常见凭据文件由 `.gitignore` 排除；发布背景也已替换为原创 SVG，不保留原壁纸的内嵌数据。
- MIT 许可与上游署名见 [LICENSE](LICENSE)、[NOTICE](NOTICE)。

## 停用与卸载

在「设置 → 插件」中停用。彻底卸载时，从 profile 的 `dependencies` 和 `dsh.profile.bundles` 中移除对应条目，在 profile 目录运行 `pnpm install` 后重启 DSH。

插件通过 `ctx.effect` 回收样式、插槽和监听器；三个外观数值仍保存在本地。若使用过窗口材质补丁，需要另外按上面的命令恢复，它不受插件开关控制。

## 致谢与许可

参考 [david0304git/dsh-appearance-glass](https://github.com/david0304git/dsh-appearance-glass) 的分层透明度补偿思路、表面令牌命名及部分选择器。上游声明保留在 [NOTICE](NOTICE)。

代码、图标和本仓库原创抽象背景使用 [MIT License](LICENSE)。
