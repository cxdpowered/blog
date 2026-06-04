---
name: new-blog-post
description: Format and normalize a blog post for src/content/blog/. Use whenever the user drops raw markdown/draft into the blog folder, asks to "add/write/publish a blog post", or wants an existing post fixed to match the site's frontmatter schema and style conventions. Handles slug folder layout, frontmatter, image co-location, and validation.
---

# 写博客 / 规范化博文

这个 skill 把一篇草稿整理成本仓库能正确构建的博文。所有规则都来自
`src/content.config.ts` 的 zod schema 和现有文章的实际写法。

## 何时触发

- 用户往 `src/content/blog/` 丢了原始 markdown 或一段草稿
- 用户说"写/加/发一篇博客""帮我处理这篇文章"
- 已有文章 frontmatter 不合规、构建报错需要修

## 目录与文件布局

每篇文章是一个**独立文件夹**,正文固定叫 `index.md`,图片与正文**同目录**:

```
src/content/blog/<slug>/
  index.md          # 正文(必须叫 index.md)
  image.png         # 图片就放同级,正文里用相对路径引用
  xxx.jpg
```

- `<slug>` 用全小写,英文,单词间用连字符 `-`(优先)或下划线 `_`。
  例:`dify-natural-language-workflow`、`bun_dev_install_issue`。
- slug 决定文章 URL(`/blog/<slug>`),**一旦发布就不要再改**,改了会让旧链接和
  Waline 评论(按 path 存储)失效。
- `src/content/blog/test.*` 是 gitignore 的,可用作临时草稿名。

### ⚠️ 同目录不要放别的 `.md`/`.mdx`

内容加载器是 `glob({ pattern: '**/*.{md,mdx}' })`,会把文章目录里**任何** `.md`/`.mdx`
都当成一篇独立博文去解析。一个没有 frontmatter 的附件 `.md` 会直接让 `astro check`/
`bun build` 报错。所以:

- 图片(`.png`/`.jpg` 等)同目录放没问题,不会被当博文。
- **文本类附件(长 prompt、日志、schema 等)不要用 `.md`**。要么改后缀(见下),要么挪走。

### 可下载附件 / 附录文件

文章想附带"可下载/可查看的原始文件"(长 prompt 快照、SQL、日志样本等)时:

- 放到 `public/` 下(例:`public/codex/xxx.txt`),用**绝对路径**链接 `/codex/xxx.txt`。
  `public/` 原样发布,线上能直接打开/下载,也不会被内容加载器解析。
- 文本附件用 **`.txt`** 后缀(浏览器可直接看,也避开 `.md` 被当博文的坑)。
- **下载链接统一放文章最末尾的 `## 附录` 小节**,不要散落在正文中间。正文需要提到时,
  写成普通文字(如"完整原文见文末附录"),不要内联指向原始文件。

## Frontmatter 规范(YAML)

字段定义来自 `src/content.config.ts`。**严格遵守长度上限,否则 `astro check` 报错。**

```yaml
---
title: 现在的 Dify 真的是我们想要的 Dify 吗？   # 必填,≤60 字符。中文,常用疑问/观点句
description: 从 Dify 的可视化工作流……再落成可运行系统。  # 必填,≤160 字符,一句话概括
publishDate: 2026-05-10 22:00:00              # 必填,格式 YYYY-MM-DD HH:MM:SS
tags:                                          # 可选,英文专有名词;schema 会自动转小写+去重
  - Dify
  - AI Agent
  - Workflow
---
```

### 字段细则

| 字段 | 必填 | 规则 |
|------|------|------|
| `title` | 是 | ≤60 字符。中文标题,本站惯用疑问句或带态度的陈述句 |
| `description` | 是 | ≤160 字符,一句话摘要。**若内容含冒号 `:` 或其它 YAML 特殊字符,整句用单引号包裹** |
| `publishDate` | 是 | `YYYY-MM-DD HH:MM:SS`。新文章不知道时间就用当前日期(见下方"取当前日期") |
| `updatedDate` | 否 | 同上格式。改老文章实质内容时再加 |
| `tags` | 否 | 列表,英文专有名词为主。schema 自动小写化+去重,所以原样大小写写着方便人读即可 |
| `heroImage` | 否 | 对象:`src` 用相对图片路径(经 `image()` 处理),可选 `alt`/`width`/`height`/`color`。多数现有文章不设 |
| `draft` | 否 | 默认 `false`。设 `true` 则不发布 |
| `comment` | 否 | 默认 `true`(开启 Waline 评论) |
| `language` | 否 | 一般不填 |

### 取当前日期

不要瞎编时间。用命令拿本地时间:

```bash
date "+%Y-%m-%d %H:%M:%S"
```

(Windows PowerShell: `Get-Date -Format "yyyy-MM-dd HH:mm:ss"`)

## 正文写作约定(对照现有文章)

- **不要写 H1 标题**(`#`)。标题来自 frontmatter,正文从导语段落直接开始。
- 章节用 `##`,小节用 `###`。
- 开头通常一段"导语/钩子",再进入正文,语气口语化、有观点、中文。
- 代码块务必带语言标记:` ```bash ` / ` ```json ` / ` ```text ` 等。本站 Shiki
  会自动加标题、复制按钮、行数过长折叠。
- 图片用**相对路径**引用同目录文件:`![alt text](image.png)`。
  不要用绝对路径或外链(除非确实是外部图)。新图片一律拷进文章文件夹。
- 外部链接正常 markdown 写,会自动加 `target=_blank`。
- 支持 LaTeX(`$...$` / `$$...$$`,remark-math + katek)。

## 处理流程(每次执行)

> 草稿可能是一段文字,也可能是用户**直接拷进来的整个文件夹**(常见特征:正文带 H1
> 大标题、没有 frontmatter、还夹着若干附件文件和指向本地文件的相对链接)。先 `ls`
> 看清楚文件夹里都有什么,再开始处理。

0. **盘点文件夹**:列出目录内容。把图片、文本附件、以及正文引用到的相对链接分别记下来。
   - 同目录里**除图片外**的 `.md`/`.mdx` 必须处理掉(改 `.txt` 挪进 `public/`,或删),
     否则构建失败。
1. **确定 slug**:从标题或用户给的主题推一个英文 slug,确认 `src/content/blog/<slug>/`
   不存在(存在就和用户确认是覆盖还是改名)。拷进来的文件夹名通常就能当 slug。
2. **建目录**,正文写成 `index.md`。
3. **补全 frontmatter**:
   - 缺 `title`/`description` 就根据正文起草,并**严格检查 ≤60 / ≤160 字符**(中文按字符算)。
   - `description` 含特殊字符就加单引号。
   - `publishDate` 缺失则用 `date` 命令取当前时间。
4. **迁移图片**:把正文引用到的、以及用户提供的图片放进文章文件夹,正文改成相对引用。
5. **正文体检**:去掉多余 H1、补全代码块语言、修正图片路径。
6. **链接检查**(见下节)。
7. **校验**:跑 `bun sync` 再 `bun check`(若改了 site.config 才需要 sync;只加文章一般
   `bun check` 即可)。有 schema 报错按提示修(最常见是 title/description 超长)。
8. 把最终文件路径、做了哪些规范化改动、以及链接检查结果简要告诉用户。

## 链接检查

提取正文里所有链接,确认它们没坏。**不写额外脚本/应用,直接用 `curl` 命中超链接本身。**

### 外部链接(http/https)

把 markdown 里的链接 URL 全部提取出来(包括 `[text](url)` 的 url 和 `<https://...>`),
逐个用 `curl` 发 HEAD 请求看状态码:

```bash
curl -sS -o /dev/null -w "%{http_code} %{url_effective}\n" -I -L --max-time 15 "<URL>"
```

- `-I` HEAD 请求(不下正文,快);`-L` 跟随重定向;`--max-time 15` 防止卡死。
- 多个链接就在一条命令里串起来,或循环每个 URL 各打一行结果。
- 判定:
  - `200`/`2xx` / `3xx` → 正常。
  - `405`(部分站点禁 HEAD)→ 改用 `curl -sS -o /dev/null -w "%{http_code}" --max-time 15 "<URL>"`(GET)复核再判。
  - `4xx`(尤其 `404`)/ `5xx` / `000`(连不上、超时、DNS 失败)→ 标记为**可疑/坏链**。
- 把坏链按"行号 + 原文链接 + 状态码"列给用户,**不要自动改 URL**,让用户决定是改链接、删链接还是保留。

### 内部链接与图片(相对路径)

- 图片 `![](xxx.png)` 和站内相对链接:用文件存在性检查,确认引用的文件**真实存在于文章目录**。
- 站内页面链接(如 `/projects`、`/blog/<slug>`):确认目标 slug/页面存在;拿不准就提示用户人工确认,不算硬错误。
- **正文引用了文件夹里不存在的本地文件**(拷入文件夹时常漏带):列给用户,问怎么办——
  通常是「去掉链接但保留文字」或「用户稍后补文件」。**不要替用户编造文件或擅自删句子。**
- 指向本地 `.md` 附件的相对链接:这类附件应已按上文移到 `public/` 并改 `.txt`,
  对应链接要改成 `/...` 绝对路径并归入文末 `## 附录`。

### 注意

- 只检查可达性,不评判内容。偶发超时可重试一次再判坏。
- 检查是只读操作,**绝不修改链接**,只报告。

## 常见坑

- title/description 超长是头号构建失败原因——动手前先数字数。
- slug 改名会断掉旧 URL 和评论,发布后别改。
- 图片忘记拷进文章目录 → 构建期 `image()` 解析失败。
- `publishDate` 写成 `YYYY-MM-DD` 不带时间也能被 `z.coerce.date()` 接受,但本站
  惯例带 `HH:MM:SS`,保持一致。
