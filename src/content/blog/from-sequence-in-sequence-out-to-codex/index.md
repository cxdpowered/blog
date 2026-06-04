---
title: '从 Sequence In / Sequence Out 到 Codex：一个模型怎样变成会改代码的应用'
description: 'Codex 开源后，顺着源码、本地 rollout 和 logs_2.sqlite 看清楚：模型只负责生成，真正把它变成会改代码的应用的，是 prompt 工程、工具协议、agent 循环和本地可观测性这套外壳。'
publishDate: 2026-06-04 21:34:00
tags:
  - Codex
  - OpenAI
  - AI Agent
  - Prompt Engineering
  - LLM
---

从使用者视角看，大语言模型可以被粗略抽象成一个函数：给它一段上下文，它继续生成一段 token，或者返回某种结构化输出。这个抽象并不完整，但它抓住了关键边界。早期的 sequence transduction 研究关心如何把输入序列映射成输出序列；2017 年的论文 [*Attention Is All You Need*](https://arxiv.org/abs/1706.03762) 就是在这个语境下提出 Transformer。

但 Codex 给人的体验完全不同。它会读取项目、执行命令、修改文件、等待测试、根据报错继续修复，还会记住一段很长的工作过程。

中间发生了什么？

简短答案是：**模型仍然只负责生成输出；Codex 在模型外面构造了一个持续运行的 agent 系统。** 这个系统负责准备上下文、向模型描述工具、解释模型返回的工具调用、在本地执行操作、把结果送回模型，并把整段过程持久化。

## 居然真的开源了

[OpenAI 的 Codex 仓库](https://github.com/openai/codex)直接把 Codex CLI 描述为一个“在你的电脑上本地运行”的 coding agent，并以 [Apache-2.0 License](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/LICENSE) 开源。仓库中包含 Rust 实现、MCP server、app-server 协议、SDK、sandbox、工具系统、上下文管理和大量 prompt 模板；项目 README 也明确给出了[源码构建与贡献入口](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/README.md)。

这件事值得感叹：一个商业模型产品最有价值的部分之一，不只是模型权重，还包括“怎样把模型变成可靠应用”的工程外壳。Codex 把这层外壳的大部分公开了。

边界也要说清楚：开源的是 Codex CLI 及相关本地组件，不是 OpenAI 的模型权重和 Responses API 服务端。我们能读懂本地 agent 如何工作，却不能因此看见服务端模型内部发生的一切。看到思考过程是服务器特意返回的摘要，完整思考例如模型内部 raw reasoning则是encrypted_content是加密的不可读的，隔壁的Claude code做的更绝是直接不显示。

## 模型和 Codex 之间隔着什么

Codex 源码中的 `Prompt` 并不是一个单独的字符串。它至少包含有序的对话输入、可用工具、基础 instructions、personality 和输出 schema；这些字段可以在公开的 [`Prompt` 结构体](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/codex-rs/core/src/client_common.rs#L14-L36)中直接看到。

一次典型循环可以概括为：

```text
用户输入
  ↓
Codex 收集 prompt、项目说明、环境、历史和工具定义
  ↓
调用模型
  ↓
模型返回文本，或者返回“调用某个工具”的结构化请求
  ↓
Codex 在本地执行 shell / apply_patch / MCP 等工具
  ↓
把工具结果追加到历史，再次调用模型
  ↓
直到模型给出最终回答
```

这不是对源码的文学概括，而是它实际的数据结构。Codex 在每次采样前取得 session 的 `base_instructions`，然后继续构造请求；相关流程可以沿着 [`session/turn.rs`](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/codex-rs/core/src/session/turn.rs#L998-L1027) 阅读。真正发往 Responses API 时，源码把基础 prompt 放进顶层 `instructions`，同时单独发送 `input` 和 `tools`，见 [`client.rs`](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/codex-rs/core/src/client.rs#L746-L775)。

工具定义尤其关键。OpenAI 的 [tools 文档](https://developers.openai.com/api/docs/guides/tools)说明，应用通过 API 的 `tools` 参数提供工具，模型根据 prompt 决定是否调用。换句话说，模型不会自己打开 PowerShell，也不会自己修改磁盘；它生成工具调用，Codex 才是执行者。

Codex 还会在首次回合构造动态上下文。公开源码中的 [`build_initial_context`](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/codex-rs/core/src/session/mod.rs#L2725-L2955)会组合权限与 sandbox、developer instructions、协作模式、skills、plugins、用户 instructions、`AGENTS.md` 和环境信息。于是，一个看起来只是“帮我修这个 bug”的输入，在真正送给模型之前，已经附带了一整套工作规范和现场信息。

因此，从 sequence in / sequence out 到 Codex，中间至少增加了五层：

1. **Prompt 与上下文构造器**：告诉模型它是谁、应该怎样工作，以及当前项目是什么状态。
2. **工具协议**：允许模型用结构化输出表达“我要执行命令”或“我要修改文件”。
3. **工具执行器与权限系统**：真正接触文件、shell、网络和 MCP server。
4. **Agent 循环**：把工具结果送回模型，让它继续判断，而不是只回答一次。
5. **持久化与 UI**：保存 thread、turn、日志、token 统计和运行状态，并把过程展示给用户。

## 本地 Codex 到底记了什么

Codex 的本地数据不只有聊天正文。我的 Windows 环境中，`~/.codex/` 下同时存在 sessions、attachments、cache、plugins、skills、`state_5.sqlite`、`models_cache.json` 和一个体积很大的 `logs_2.sqlite`。

会话 rollout JSONL 更适合还原对话和工具调用链；`logs_2.sqlite` 则更像运行时黑匣子。Codex 的公开源码中甚至直接包含创建日志表的 [SQLite migration](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/codex-rs/state/logs_migrations/0002_logs_feedback_log_body.sql)，而运行时代码会把日志正文写入普通的 `feedback_log_body` 字段，见 [`runtime/logs.rs`](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/codex-rs/state/src/runtime/logs.rs#L11-L31)。

所以它没有神秘格式，也没有专门加密：**`logs_2.sqlite` 是可以直接读取的标准 SQLite 数据库。**

最简单的只读检查方式：

```powershell
$db = Join-Path $HOME '.codex\logs_2.sqlite'
sqlite3 -readonly $db
```

进入 SQLite shell 后：

```sql
.tables
.schema logs
.headers on
.mode column

SELECT
  id,
  datetime(ts, 'unixepoch', 'localtime') AS local_time,
  level,
  target,
  thread_id,
  length(feedback_log_body) AS body_chars
FROM logs
ORDER BY id DESC
LIMIT 30;
```

如果 Codex 仍在运行，它可能同时写入 `logs_2.sqlite-wal`。认真分析时应退出 Codex，或使用 SQLite 的一致性备份机制，而不是只复制主数据库文件；SQLite 官方文档对 [WAL 模式](https://www.sqlite.org/wal.html)和 [CLI](https://www.sqlite.org/cli.html)都有完整说明。

### 我在聊天日志里发现了 API key

这部分不是推测，而是本机取证结果：我确认至少一条 `codex_core::spawn` 日志把进程环境变量完整写进了 `feedback_log_body`，其中包含明文 `DEEPSEEK_API_KEY`。只按变量名搜索，本机数据库就命中了 93 行。

我没有把数据库复制进博客资源，也没有记录密钥值。但这已经足够说明：`logs_2.sqlite` 应该按 secrets dump 对待。让 Codex 执行一个继承当前环境的进程，可能意味着进程环境也进入日志。

## 抓出本地实际使用的 Prompt

Codex 的基础 prompt 并不只存在于源码文件中。新建会话时，它会先解析一份最终 `base_instructions`，再把它写进 rollout 的 `session_meta`。源码明确给出了优先级：显式配置覆盖优先，其次是恢复会话中的旧 instructions，最后才是当前模型目录提供的默认值，见 [`session/mod.rs`](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/codex-rs/core/src/session/mod.rs#L551-L567)。

我从一个由 `codex-cli 0.136.0-alpha.2` 写入、模型为 `gpt-5.5` 的真实 rollout 中提取了 `session_meta.base_instructions.text`（这个是我目前本机运行的最新版本的codex的客户端）。完整英文原文见文末附录下载。

去掉文件顶部的研究说明后，这份本地 prompt 有 16,180 个字符，SHA-256 为：

```text
82176dd9a3153a71bae295ad1966393d2eb0f6b92aa9a7ee99c5230c3234a118
```

然后我把它与公开仓库提交 `16d02ec77c6337ccea02a8c909e05bf3d905f887` 中 [`models-manager/models.json`](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/codex-rs/models-manager/models.json) 的 `gpt-5.5.base_instructions` 对比：

| 样本 | 字符数 | SHA-256 |
|---|---:|---|
| 本地 rollout 中实际保存的 prompt | 16,180 | `82176d…4a118` |
| 公开仓库模型目录中的 prompt | 21,459 | `235163…242e` |

两者并不相同。

差异并不只是字符数和哈希。本地快照把 Codex 描述为 “a deeply pragmatic, effective software engineer”；公开目录中的同模型 prompt 则写着 “You have a vivid inner life as Codex: intelligent, playful, curious”。两份 prompt 连人格基调都不一样。

这并不能证明 OpenAI “偷偷藏了一份 prompt”。首先，本地会话和对照仓库不是同一个精确版本；其次，Codex 的模型管理器会获取并缓存远程 model catalog，相关接口和刷新流程在 [`models-manager/src/manager.rs`](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/codex-rs/models-manager/src/manager.rs#L40-L44)与[远程更新实现](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/codex-rs/models-manager/src/manager.rs#L303-L340)中都是公开的；模型 instructions 还可以通过模板替换 personality，见 [`get_model_instructions`](https://github.com/openai/codex/blob/16d02ec77c6337ccea02a8c909e05bf3d905f887/codex-rs/protocol/src/openai_models.rs#L383-L409)。

更准确的结论是：

> 仓库中的 prompt 是可公开审计的默认值和目录数据；rollout 中的 `base_instructions` 才是某个具体会话实际解析并保存的基础 prompt；而某次模型请求的完整上下文，还要再加上动态 developer/user 消息、历史和工具 schema。

## Prompt 里两件很有趣的事

第一件非常喜感。本地 prompt 中出现了下面这句，而且重复了两次：

> “Never talk about goblins, gremlins, raccoons, trolls, ogres, pigeons, or other animals or creatures unless it is absolutely and unambiguously relevant to the user's query.”

直译是：除非与用户问题绝对且毫无歧义地相关，否则不要谈论哥布林、小妖怪、浣熊、巨魔、食人魔、鸽子或其他动物与生物。它看起来像某次产品体验问题留下的精确补丁，也提醒我们：成熟 agent 的 prompt 并不全是宏大的推理原则，里面还会沉积非常具体、甚至有些荒诞的行为约束。原文可在文末附录的完整快照中搜索。

第二件更严肃：

> “Do not reflexively agree with or validate the user's premise.”

也就是：不要条件反射地同意或认可用户的前提。后文继续要求在主张不确定时验证，在主张错误或有风险时直接指出。这说明 prompt 不只是教 Codex “怎样写代码”，也在塑造它与用户协作时的认识论姿态：少一些讨好，多一些核查。

当然，这种“不迎合”也有明确的表达边界。Prompt 另外要求：

> “Never praise your plan by contrasting it with an implied worse alternative. For example, never use platitudes like ‘I will do &lt;this good thing&gt; rather than &lt;this obviously bad thing&gt;’, ‘I will do &lt;X&gt;, not &lt;Y&gt;’.”

也就是：不要通过暗示存在一个明显更差的替代方案，来反衬和夸赞自己的计划。例如，不要说“我会采用这个好方法，而不是那个显然很糟的方法”。这条规则并不禁止 Codex 指出用户方案的问题，但禁止它为了表现自己的方案更好，先立起一个稻草人式的坏方案。于是它可以反对你，却应当尽量避免居高临下地反对你；这或许也是 GPT 老师总显得温和的原因之一。或者这也是隔壁claude老师攻击力很高的原因。

## 真正把模型变成应用的东西

读完源码、rollout 和日志后，我对 Codex 的理解发生了变化。

模型能力当然是基础，但 Codex 的产品能力来自模型之外的系统工程：它把基础 instructions、项目规则、环境状态、工具 schema 和历史整理成上下文；让模型返回结构化动作；在受控环境中执行动作；把结果重新送回模型；最后把整个过程记录下来。

所以，“从 sequence in / sequence out 到强大 Codex 应用，中间发生了什么”的答案不是某一条神奇 prompt，而是一套完整的反馈系统：

```text
模型生成能力
+ prompt 与上下文工程
+ 工具与权限边界
+ 持续 agent 循环
+ 本地状态和可观测性
= Codex
```

最有意思的是，这套系统的相当大一部分确实可以在[公开仓库](https://github.com/openai/codex)里顺着源码读下去；而本地 rollout 和 `logs_2.sqlite`，则让我们看到它在自己电脑上真正运行时留下了什么。

## 附录

- 本地 `gpt-5.5` rollout 中提取的完整 base prompt 英文原文（16,180 字符，SHA-256 `82176dd9…3234a118`）：[codex-base-prompt-0.136.0-alpha.2.en.txt](/codex/codex-base-prompt-0.136.0-alpha.2.en.txt)
