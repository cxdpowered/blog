---
title: 记录一次 Bun 安装异常导致 Astro 无法启动
description: '一次 bun dev 报 astro 找不到的排障记录：从不完整的 node_modules、Bun 缓存损坏，到 workspace 解析修复。'
publishDate: 2026-05-23 21:50:00
tags:
  - Bun
  - Astro
  - Technology
---

# 记录一次 Bun 安装异常导致 Astro 无法启动

今天更新博客主题之前，先遇到了一个更基础的问题：

```bash
bun dev
```

直接启动失败。

表面报错很简单：

```bash
$ astro dev
bun: command not found: astro
error: script "dev" exited with code 1
```

这类错误很容易让人第一反应以为是 `package.json` 没写对，或者 Astro 没装。但这次真正的问题不在脚本，而在依赖安装状态。

---

## 现象：依赖列表里有 Astro，但命令不存在

先看 `package.json`：

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

脚本没问题，依赖也声明了。

再看 Bun 识别到的依赖：

```bash
bun pm ls astro
```

输出里也能看到：

```text
astro@5.16.6
```

但 `node_modules/.bin` 里没有 `astro.exe`，甚至 `node_modules/astro` 还是空目录。

这就说明问题不是“没声明依赖”，而是：

> **Bun 认为依赖已经安装了，但实际文件没有完整落盘。**

---

## 第一个问题：node_modules 是半安装状态

当前 `node_modules` 里只生成了少量 bin：

```text
astro-pure.exe
astro-pure.bunx
```

但根项目需要的 `astro.exe`、`astro-check.exe` 都不存在。

这种状态通常来自一次失败的安装：

- 包管理器已经写入了部分目录
- lockfile 可能被更新了
- 但某些包没有成功解包
- 后续命令又误以为安装已经完成

所以单纯重复 `bun dev` 没意义，需要重新检查安装过程。

---

## 第二个问题：本地 theme 被解析成了 registry 包

这个仓库有一个比较特殊的结构：

```text
packages/pure/
```

它是 vendored 的 `astro-pure` 主题包，根项目通过 workspace 使用它。

正常情况下，`bun.lock` 里应该类似这样：

```text
astro-pure@workspace:packages/pure
```

但失败安装之后，lockfile 里变成了 registry 版本：

```text
astro-pure@1.4.0
```

这就有两个问题：

1. 本地改过的 `packages/pure` 不会被使用
2. lockfile 会偏离这个仓库原本的架构

根因是根 `package.json` 没有显式声明 workspaces。旧状态下 Bun 可能还能从 lockfile 推断，但重新安装时并不稳。

修复方式是在根 `package.json` 增加：

```json
{
  "workspaces": [
    "packages/pure"
  ]
}
```

这样 Bun 才会稳定地把 `astro-pure` 解析到本地主题包。

---

## 第三个问题：Bun 缓存里有坏包

补上 workspace 后，重新安装仍然失败：

```text
error: failed to enqueue lifecycle scripts for esbuild: ENOENT
```

这个错误出现在 `esbuild` 的 lifecycle 阶段，但真正的问题不是项目代码，而是 Bun 缓存或解包记录不完整。

最后有效的修复是清理 Bun 安装缓存：

```bash
bun pm cache rm
```

然后删除当前不完整的安装产物，重新安装：

```bash
rm -rf node_modules
bun install
```

在 Windows PowerShell 里我实际用的是 `Remove-Item`，避免混用 shell 命令。

---

## 最终确认

重新安装后，`node_modules/.bin` 里恢复了这些命令：

```text
astro.exe
astro-check.exe
astro-ls.exe
astro-pure.exe
```

再次启动：

```bash
bun dev
```

`astro dev` 可以正常跑起来，本地页面也能访问。

随后又跑了：

```bash
bun check
```

结果是：

```text
0 errors
0 warnings
0 hints
```

后面更新主题到上游 `v4.1.4` 后，也验证了：

```bash
bun run build
```

构建成功，Pagefind 索引也正常生成。

---

## 这次问题的判断路径

这次排障里最关键的不是某一条命令，而是判断顺序：

1. `bun dev` 报 `astro` 找不到
2. 检查 `package.json`，确认脚本和依赖声明存在
3. 检查 `node_modules/.bin`，确认 bin 没生成
4. 检查 `node_modules/astro`，发现目录不完整
5. 检查 `bun.lock`，发现 workspace 包被解析错
6. 补上 `workspaces`
7. 清理 Bun cache
8. 删除 `node_modules` 后重新安装
9. 跑 `bun check` 和 `bun run build` 验证

一个比较实用的结论是：

> **当依赖列表里有包，但 `.bin` 里没有命令时，优先怀疑安装产物不完整，而不是脚本写错。**

---

## 后续避免方式

这个仓库以后应该保留根 `package.json` 里的 workspace 声明：

```json
"workspaces": [
  "packages/pure"
]
```

因为 `packages/pure` 不是普通外部依赖，而是当前仓库的一部分。

如果未来再遇到类似问题，可以按这个顺序处理：

```bash
bun pm cache rm
rm -rf node_modules
bun install
bun check
```

如果是在 Windows 上，删除目录时建议用 PowerShell 原生命令：

```powershell
Remove-Item -LiteralPath .\node_modules -Recurse -Force
```

---

## 结语

这次问题看起来只是 `bun dev` 启动失败，但背后同时包含了三个层面：

- `node_modules` 半安装
- Bun 缓存损坏
- workspace 解析不明确

修完之后顺手更新了主题，也正好用这篇文章测试一下 Vercel 的同步和部署流程。
