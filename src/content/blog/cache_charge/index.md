---
title: Prompt Caching 没那么玄：让模型少算一遍重复前缀
description: 从 KV cache 和 prefill 成本的角度重新理解 prompt caching：它不是模型有记忆，而是服务端把稳定前缀的计算结果跨请求复用。
publishDate: 2026-05-26 22:00:00
tags:
  - LLM
  - Anthropic
  - OpenAI
  - DeepSeek
  - Prompt Engineering
  - Claude
---

学 prompt caching 的时候，我第一反应是：这东西其实就是我早就熟悉的 KV cache，只是缓存活得更久，作用域从一次生成扩展到了多次 API 请求。

当然，严格一点说，各家的实现不完全一样。[OpenAI 文档](https://developers.openai.com/api/docs/guides/prompt-caching)现在明确写到，extended prompt caching 会把 attention 层 prefill 阶段产生的 key/value tensors 临时放到 GPU-local storage；[DeepSeek](https://api-docs.deepseek.com/guides/kv_cache/)叫 Context Caching on Disk；[Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)主要暴露的是 cache breakpoint 和 TTL，不承诺具体怎么存。

但从工程直觉上看，抓住这一句就够了：

> prompt caching 不是让模型“记住”你，而是让服务端别重复算同一段 prompt 前缀。

## LLM 真的没有记忆

每次你跟 Claude、GPT 或 DeepSeek 对话，模型本身都是无状态的。所谓“它记得上轮说了什么”，本质是客户端把历史 messages、system prompt、tool definitions、文件内容这些东西重新拼成一个长序列，再发给模型。

所以第 50 轮对话，模型通常要重新读前 49 轮。它要重新处理一遍长 prompt，重新做 prefill，然后再开始生成新 token。

这也是为什么 agent 对话越长越贵、越慢。你不是只在为“这一轮新问题”付费，而是在反复为同一段历史付 prefill 成本。

补一句：tool use 也不是模型真的伸手去读文件、调接口。模型输出一段结构化文本，外层 runtime 执行工具，再把工具结果塞回下一轮输入。还是 sequence in、sequence out，只是外面多了一层协议。

## 你早就用过 KV Cache

回忆 autoregressive generation。

生成第 100 个 token 时，当前 token 的 query 要去 attend 前 99 个 token 的 key/value。如果每生成一个 token 都把前面所有 token 的 K/V 重新算一遍，就会有大量重复计算。

所以推理框架一般会用 KV cache：前面 token 的 key/value 算过以后存起来，下一步只算新增 token 的 K/V。[Hugging Face 的 Transformers 文档](https://huggingface.co/docs/transformers/main/kv_cache)也是这么解释的：KV cache 存储 key/value 计算结果，用来避免自回归生成时重复计算。

这个 cache 的生命周期通常只在一次请求里。请求结束，生成完了，相关 state 就可以释放。

## Prompt Caching 做的事：跨请求复用前缀

现在把视角从“同一次请求里的下一 token”切到“下一次 HTTP 请求”。

假设一个 agent 每轮都带着同一份东西：

- system prompt
- tool definitions
- `CLAUDE.md` / `AGENTS.md`
- 项目背景
- 一大段稳定参考资料
- 前几轮对话历史

这些内容如果从开头开始完全一样，服务端就有机会复用上次处理这段前缀时留下的计算结果。OpenAI 的说法是：请求会按 prompt 初始前缀 hash 路由到最近处理过相同 prompt 的机器，如果找到匹配前缀，就使用缓存；找不到就完整处理，并把前缀缓存起来给后续请求用。

所以 prompt caching 可以理解成“跨请求版本的 KV/prefix cache”。它省的是 long prompt 的 prefill 成本，不是输出 token 的成本，也不是 context window 本身。context 该占多长还是多长，只是重复前缀不一定每次都按全价重新算。

这件事的 a-ha moment 在这里：你熟悉的 KV cache 没变，只是边界变了。

| 场景 | 单次推理里的 KV cache | Prompt caching |
|---|---:|---:|
| 复用对象 | 已生成/已输入 token 的 K/V | 稳定 prompt 前缀的 prefill state |
| 生命周期 | 一次请求内 | 几分钟到更久，取决于 provider |
| 命中条件 | 同一条序列继续生成 | 后续请求有相同前缀 |
| 主要收益 | decode 更快 | 长 prompt 的 TTFT 和 input 成本下降 |

## 先看价格，省多少不是玄学

价格会变，所以这里只放 2026-05-26 查到的官网口径，真要算账以 [Anthropic](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)、[OpenAI](https://developers.openai.com/api/docs/pricing)、[DeepSeek](https://api-docs.deepseek.com/quick_start/pricing) 官网为准。

| Provider / model | 普通 input 或 miss | cache write | cache read / hit | 直观理解 |
|---|---:|---:|---:|---|
| Anthropic Claude Sonnet 4.6 | $3 / 1M tokens | 5m: $3.75；1h: $6 | $0.30 | 5m write = 1.25x，read = 0.1x |
| OpenAI GPT-5.4 short context | $2.50 / 1M tokens | 无单独 write 溢价 | $0.25 | cached input = 0.1x |
| DeepSeek V4 Flash | miss: $0.14 / 1M tokens | 自动构建，无单独 write 档 | hit: $0.0028 | hit 约等于 miss 的 2% |

Anthropic 的算账最容易看清楚：

- 不命中缓存，1M input token 每次按 1.0x 算。
- 第一次写 5 分钟缓存，按 1.25x 算。
- 后面每次读，按 0.1x 算。

所以同一段前缀只用一次会亏，复用一次就回本：

```text
不用缓存：2 次 = 2.0x
用缓存：1 次 write + 1 次 read = 1.25x + 0.1x = 1.35x
```

agent 场景很容易超过这个门槛。一份 `CLAUDE.md`、tool schema、项目背景，在一次会话里被带上几十轮，很快就不是小钱。

DeepSeek 更夸张一点。V4 Flash 官网当前 miss 是 $0.14 / 1M tokens，hit 是 $0.0028 / 1M tokens，相当于 cache hit 部分打到 2%。但它是 best-effort，不保证 100% 命中；官方也说 cache 构建要几秒，不再使用后通常几小时到几天内清理。

## 各家规则不一样，但核心都是 prefix

Prompt caching 最容易踩坑的地方，是它不是“语义相似就命中”。它看的是前缀。

OpenAI 文档直接建议：静态内容放开头，变量内容放末尾；cache hit 只可能发生在 exact prefix match 上。它还要求 prompt 至少 1024 tokens 才能缓存，usage 里会给 `cached_tokens`。

Anthropic 是另一套暴露方式。它的 prompt 顺序是 `tools` -> `system` -> `messages`，可以显式在 content block 上放 `cache_control`，也可以用 top-level automatic caching。默认 TTL 是 5 分钟，也有 1 小时 TTL，价格更高。它还有几个很工程的限制：

- 最多 4 个 cache breakpoints。
- 每个 breakpoint 读取时最多向前 look back 20 个 content blocks。
- 写入只发生在 breakpoint；系统不会自动把 breakpoint 前面每个稳定位置都写一份。
- 改了更靠前的层级，比如 tools，会让后面的 system/messages cache 一起失效。

DeepSeek 是自动的，不用额外参数。它会在请求边界、检测到公共前缀时、以及长输入的固定 token 间隔上持久化 cache prefix unit。后续请求只有完整匹配某个已持久化的 prefix unit，才算 hit。usage 里看 `prompt_cache_hit_tokens` 和 `prompt_cache_miss_tokens`。

所以“改一个标点，后面全凉”这句话方向是对的，但要说得更准：只要改动发生在某个可缓存前缀内部，这个前缀 hash 就变了；它后面的缓存自然也很难继续命中。改动越靠前，杀伤范围越大。

## breakpoint 只是 Anthropic 的一种控制方式

4 个 breakpoint 不是 Claude Code 独家，而是 Anthropic/Claude API 暴露出来的 prompt caching 控制点。Claude Code 可能会利用这套能力，但这不是 Claude Code 自己发明的一层机制。

它的意义也不用想复杂：手动告诉服务端“这些位置值得写 cache”。比如可以按变化频率分层：

```text
[tools + base system]            ↑ bp1  几乎不变
[repo / project instructions]    ↑ bp2  偶尔变
[older conversation history]     ↑ bp3  低频变
[recent conversation history]    ↑ bp4  高频追加
[current user message]                  每轮都变，不缓存
```

OpenAI 和 DeepSeek 更偏自动：你不用手动标 4 个点，而是把稳定内容放前面，让平台自己做 prefix caching。差别在 API 暴露方式，不在底层直觉：稳定前缀越长、越少变，越容易命中。

## 由此能推出来的几条 agent 设计直觉

理解了 prefix cache，很多 agent 最佳实践就不用死记硬背了。

第一，稳定内容放前面，变量内容放后面。  
system、工具定义、长期项目背景，天然适合放在最前面；用户当前问题、时间戳、临时搜索结果这种每轮都变的东西，不要插到稳定前缀中间。

第二，不要把时间戳、随机 ID、会话状态塞进 system prompt 开头。  
很多人为了“方便调试”在最前面加 `current_time` 或 request id，这会让后面的长前缀每轮都变。真要加，放到靠后的位置。

第三，工具 schema 要克制。  
Anthropic 和 OpenAI 都可以缓存 tools，但“能缓存”不等于“随便塞”。如果框架支持 deferred loading 或按需暴露工具，少让冷门工具 schema 进入每一次请求。

第四，RAG 内容要分清稳定和临时。  
固定 reference、项目规范、长文档可以作为稳定前缀的一部分；每轮检索出来的 snippets 通常是变量内容，应该靠后放。否则一次 query 变了，后面的缓存一起报废。

第五，别只看账单，要看 usage 字段。  
Anthropic 看 `cache_creation_input_tokens` / `cache_read_input_tokens`，OpenAI 看 `cached_tokens`，DeepSeek 看 `prompt_cache_hit_tokens` / `prompt_cache_miss_tokens`。没有这些数字，讨论 cache hit 率基本是在猜。

## 它解决的是成本和延迟，不解决注意力

Prompt caching 很容易被误解成“省 token”。更准确地说，它省的是重复前缀的处理成本和 TTFT。对模型来说，那段上下文仍然在输入里，仍然占 context window，也仍然可能影响注意力分布。

所以 agent 的 context 管理至少有三层：

- 省成本和延迟：prompt caching、cached input pricing、预热缓存。
- 管注意力：重要信息放头尾，避免全部堆在中间。[Lost in the Middle](https://arxiv.org/abs/2307.03172) 那篇论文讲的就是长上下文模型对中间信息利用不稳定。
- 管容量：compaction、subagent、RAG，控制到底哪些东西应该进入主上下文。

Prompt caching 只是第一层。它能让你更便宜、更快地重复发送长前缀，但它不会让模型“更会读”这段长上下文，也不会帮你把无关历史删掉。

我学这一节最大的收获，其实不是多记住一个 API 参数，而是把 agent 工程里的几件事串起来了：

模型无状态，所以历史要重发；历史太长，所以 prefill 贵；前缀经常重复，所以可以缓存；前缀一旦变化，所以要设计失效边界。

新概念接回老概念，东西就顺了。
