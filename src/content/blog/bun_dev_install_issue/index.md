---
title: Bun 说 Astro 不存在：一次半安装依赖的排障
description: 'bun dev 报 astro 找不到，真正坏掉的不是脚本，而是 node_modules、缓存和 workspace 解析。记录一次从症状到根因的排障。'
publishDate: 2026-02-23 21:50:00
tags:
  - Bun
  - Astro
  - Technology
---

# Bun 说 Astro 不存在：一次半安装依赖的排障

我本来只是想更新一下博客主题。

这种事情按理说很机械：拉代码、装依赖、跑 `bun dev`，本地看看有没有炸。结果第一步刚迈出去，Bun 就把门关上了：

```bash
$ bun dev
$ astro dev
bun: command not found: astro
error: script "dev" exited with code 1
```

这类报错最容易把人带偏。它看起来像是 `package.json` 写错了，或者 Astro 没装。可真正烦人的地方在于：所有“表面证据”都说 Astro 是存在的。

```json
{
  "scripts": {
    "dev": "astro dev"
  },
  "dependencies": {
    "astro": "^5.16.6"
  }
}
```

脚本没问题，依赖也声明了。再问 Bun：

```bash
bun pm ls astro
```

它也一本正经地告诉我：

```text
astro@5.16.6
```

到这里如果还继续盯着 `package.json`，基本就是在原地打转了。

## 线索开始互相打架

CLI 命令不是凭空出现的。`astro dev` 能跑起来，前提是安装阶段在 `node_modules/.bin` 里生成了对应的 shim。

所以我先看了一眼：

```powershell
Get-ChildItem .\node_modules\.bin
```

结果很不对劲。

里面只有几个零散的东西，比如：

```text
astro-pure.exe
astro-pure.bunx
```

但根项目真正需要的这些都不在：

```text
astro.exe
astro-check.exe
astro-ls.exe
```

更离谱的是，`node_modules/astro` 目录存在，但几乎是空的。

这就是排障里的第一个关键判断：

> 依赖管理器“认为”包已经安装，和包的文件真的完整落盘，是两回事。

`bun pm ls` 只能证明解析结果里有 Astro，不能证明 `.bin` 正常，也不能证明包内容完整。这个差别很小，但足够把一次普通启动失败拖成半小时的怀疑人生。

## 半截 node_modules 最难看出来

这台机器上的 `node_modules` 处在一种很尴尬的状态：不是完全没有，也不是完整可用。

像这种半安装状态，通常来自一次中途失败的安装：

- 某些目录已经创建了
- lockfile 可能已经写过了
- 一部分 bin 已经生成
- 但关键包没有解包完成

后续再执行命令时，包管理器看到“好像装过”，项目看到“目录存在”，人看到“依赖列表里有”，于是三方一起装作没事，直到真正调用 CLI 的那一刻才露馅。

这也是为什么我这次没有先去改脚本。`dev` 脚本太简单了：

```json
"dev": "astro dev"
```

简单到它不太可能是凶手。

## 第二个坑：本地主题被解析到了 registry

这个博客仓库还有一个额外的特殊点：主题不是普通外部依赖，而是 vendored 在仓库里的 workspace 包。

目录结构大概是这样：

```text
packages/pure/
```

根项目里引用的是 `astro-pure`，正常情况下它应该解析到本地的 `packages/pure`。这很重要，因为我改主题、升级主题、调组件，动的都是这个目录。

但检查 `bun.lock` 时，我发现它一度被解析成了 registry 上的版本：

```text
astro-pure@1.4.0
```

这不是一个小偏差。它意味着：

- 本地 `packages/pure` 可能根本没被用上
- 主题内部改动不会进入实际运行结果
- lockfile 和仓库结构开始说两套话

问题出在根 `package.json` 里没有把 workspace 明确写出来。以前依赖 lockfile 的旧状态可能还能跑，但重新安装时就不够稳了。

于是补上：

```json
{
  "workspaces": [
    "packages/pure"
  ]
}
```

这一行不是为了好看。它是在告诉 Bun：`astro-pure` 是这个仓库的一部分，不要去 registry 里找一个同名包来凑数。

## 第三个坑：缓存坏了，错误却甩给 esbuild

补完 workspace 后，重新安装仍然没有立刻恢复。Bun 又报了一个看起来更底层的错：

```text
error: failed to enqueue lifecycle scripts for esbuild: ENOENT
```

`esbuild` 在很多前端项目里都是高频依赖，而且它确实涉及平台相关的二进制和安装脚本。但这次我不认为应该从 `esbuild` 本身开始查。

原因很简单：前面已经看到了不完整的 `node_modules`，也看到了 workspace 解析错位。此时再出现 lifecycle 的 `ENOENT`，更像是安装缓存或解包记录坏了，而不是项目突然和 `esbuild` 不兼容。

最终有效的是清 Bun 缓存：

```bash
bun pm cache rm
```

然后删掉那坨已经不可信的安装产物。

在 Windows PowerShell 里我实际用的是：

```powershell
Remove-Item -LiteralPath .\node_modules -Recurse -Force
```

这里不建议在 PowerShell 里硬抄 `rm -rf`。不是说一定不能用，而是排障时不要再给自己增加一层 shell 行为差异。

## 最后真正修好的顺序

这次有效的恢复流程是：

```bash
bun pm cache rm
```

```powershell
Remove-Item -LiteralPath .\node_modules -Recurse -Force
```

```bash
bun install
```

重新安装后再看 `.bin`，该出现的东西终于回来了：

```text
astro.exe
astro-check.exe
astro-ls.exe
astro-pure.exe
```

再跑：

```bash
bun dev
```

Astro 正常启动。

随后继续确认：

```bash
bun check
bun run build
```

类型检查和构建都过了，Pagefind 索引也正常生成。到这一步，才算真的修完，而不是“刚好这次能启动”。

## 这次最有用的判断

如果只记命令，这次问题其实很无聊：清缓存、删依赖、重装。

但真正有价值的是判断顺序：

1. `bun dev` 报 `astro` 找不到
2. `package.json` 里脚本和依赖都存在
3. `bun pm ls astro` 能看到 Astro
4. `node_modules/.bin` 没有 `astro.exe`
5. `node_modules/astro` 是半空的
6. `bun.lock` 里 workspace 包解析到了 registry
7. 补 `workspaces`
8. 清 Bun cache，删除 `node_modules`
9. 重装后用 `bun check` 和 `bun run build` 收尾

这里面第 4 步最关键。

> 当依赖列表里有包，但 `.bin` 里没有命令时，优先怀疑安装产物不完整，不要急着改脚本。

另外，workspace 项目最好不要靠包管理器“猜”。本地包就明明白白写进 `workspaces`。尤其像这个博客一样，主题代码就在仓库里，解析错一次，后面看到的页面可能就不是你正在改的那份代码。

## 给以后自己的备忘

下次再遇到类似问题，我会按这个顺序查：

```bash
bun pm ls astro
```

```powershell
Get-ChildItem .\node_modules\.bin
```

```powershell
Get-ChildItem .\node_modules\astro
```

```bash
bun pm cache rm
bun install
```

如果项目里有本地包，先确认根 `package.json`：

```json
"workspaces": [
  "packages/pure"
]
```

这次 `bun dev` 没跑起来，表面看是 Astro 丢了，实际是三个状态同时坏了：依赖只装了一半、缓存不可信、本地 workspace 没有被稳定声明。

前端项目最怕的不是报错，而是“看起来都对”。这次就是一个很典型的例子。
