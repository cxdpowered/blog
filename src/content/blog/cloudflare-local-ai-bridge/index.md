---
title: 白嫖一些 token！用 Cloudflare Tunnel，把本地工具接给网页 GPT 和 dot
description: 用 Cloudflare Tunnel 和 CodexPro，把本地项目接给网页 ChatGPT，换台设备也能继续改文件；再聊聊怎么把 dot 接到 QQ。附项目地址和提示词。
publishDate: 2026-10-27
tags:
  - Cloudflare
  - MCP
  - AI Agent
  - QQ Bot
draft: false
---

Codex 的额度不够用，手头的活又没做完，可以换到网页 ChatGPT 的 Chat 模式继续。Chat 走自己的额度规则，不扣 Codex 那份额度。既然还能用，干脆把本地文件工具也接上，省得来回复制代码、上传文件。

网页版本来就能处理文件，也支持通过插件调用读写工具。把本地项目接给它，就可以直接读取、修改电脑上的那份文件。这里用到的是 Cloudflare Tunnel，也就是 `cloudflared` 做内网穿透的这个功能：给本地工具服务一个外面可以访问的 HTTPS 地址，不需要为了这点事再租一台服务器。

还有个很实用的好处：操作入口不再绑在那台电脑上。手机、平板或者另一台电脑，登录同一个 ChatGPT 账号，打开已经接好工具的网页聊天，就能继续处理原来的项目。本机保持开机，工具服务和隧道正常运行就行，不用在每台设备上再装一套开发环境。

后面我又用同样的 Tunnel，给 dot 接上了 QQ。Cloudflare 大善人的这个功能，可玩性挺高。目前我用上了这两个方向，感觉还能拿它做不少别的事。

## 先给本地服务一个地址

比如电脑上已经有一个服务，地址是 `http://localhost:8080`。装好 `cloudflared` 后，可以这样试，地址和端口换成实际运行的服务：

```sh
cloudflared tunnel --url http://localhost:8080
```

它会给出一个临时的 `https://……trycloudflare.com` 地址，外面就能通过这个地址访问本地服务。这个 [Quick Tunnel](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/) 连 Cloudflare 账号和域名都不需要，拿来试东西很方便。不过重启后地址会变，长期接工具更适合用自己的域名配置固定入口。

电脑和本地服务还是要开着。Tunnel 负责把请求送过来，后面的程序该跑在哪儿，仍然跑在哪儿。

## 让网页 GPT 直接读写文件

这部分有现成的工具包：[CodexPro](https://github.com/rebel0789/codexpro)。它在本地启动一个 MCP 服务，把读取、搜索、修改文件这些操作提供给 ChatGPT。这里的 CodexPro 是第三方项目。

把它和 Tunnel 配起来，网页 GPT 就有了访问本地项目的通道。[ChatGPT 的自定义 MCP 插件支持读写工具](https://developers.openai.com/api/docs/guides/custom-mcp-server)，CodexPro 提供的就是这套本地操作。改动落在原来的项目里，回到电脑上还能照常查看 diff、继续开发。

部署可以交给本地的 Codex 或 Claude Code。想让 Codex 顺手把域名和隧道也配好，可以先让它添加 [Cloudflare 插件](https://developers.cloudflare.com/agent-setup/codex/)，安装也就是一句话：

> 帮我安装 Cloudflare 插件，接入官方 MCP：[https://mcp.cloudflare.com/mcp](https://mcp.cloudflare.com/mcp)，并引导我完成登录授权。

接着按提示登录、授权，域名和隧道配置就可以继续交给它了。自己基本只需要跟着提示操作，确实没多少费脑子的地方。

我实际用的是自己的域名，给 MCP 配了固定地址。下面也按这个方式写，**需要先准备一个自己的域名**。没有域名、只想先试试的话，就让 Codex 改用前面的临时隧道。

复制下面的提示词前，先改两处：**`D:\code\my-project` 要换成你电脑上真实的项目文件夹路径，`你的域名` 要换成自己的域名。** 这里的目录只是示例，不用照着新建一个；用的不是 Windows，也把系统名称一起改掉。

```text
帮我部署 https://github.com/rebel0789/codexpro 。

我用 Windows，想在 ChatGPT 网页的 Chat 模式里读取和修改 D:\code\my-project。
我也会从手机或平板登录同一账号，继续操作这个项目。
先读项目 README，使用 Cloudflare Tunnel 提供 HTTPS 入口。
我的域名是：你的域名，请用它配置固定地址。
只开放这个项目目录，保留工具的鉴权。

部署后告诉我网页设置里要开启哪个选项，并列出添加 MCP 时的 Server URL、
认证方式和其他需要填写的参数，以及平时怎么启动和停止。
再做一个启动脚本，在桌面放快捷方式，双击就能启动 CodexPro 和隧道。
避免重复启动，关闭窗口时一并结束本次启动的服务和子进程。
登录授权由我来操作，最后用一个测试文件检查读写是否正常。
```

网页版默认没有开启第三方 MCP 接入，需要先在设置里打开开发者模式（Developer mode），再添加自定义 MCP。这里跟着 Codex 给出的步骤走就好：把它提供的 MCP 地址填进 Server URL，认证方式和其他参数也照着填。开关和表单的位置可以对照 [CodexPro 的连接说明](https://github.com/rebel0789/codexpro#connect-in-chatgpt)。

添加完成后，在聊天中选中这个工具，就可以让它操作本地项目了。带 token 的连接地址自己保存，别原样贴进博客。

平时用也不用每次敲命令，让 Codex 顺手写个启动脚本，在桌面放一个快捷方式就行。需要的时候双击，把 CodexPro 和隧道一起启动；任务做完再关闭，让脚本把相关进程一并停掉。这样方便，也不用让文件操作入口一直开着，原来的鉴权照常保留。

文件在同一个目录里，Codex 聊过的内容却不会因此自动带到网页。切换之前，把做到哪一步、改了哪些文件、接下来要做什么留在项目里的交接文档中，会省不少解释。接好后可以这样说，项目名和交接文件名也按实际情况替换：

> 用 CodexPro 打开 my-project，先读 README 和任务交接.md，再看当前 diff，接着完成里面的待办。直接修改项目文件，做完告诉我改了什么。

实现上就是 GPT 调用工具，CodexPro 在电脑上读写文件，再把结果返回去。Cloudflare 不负责理解代码，也不需要接触本地文件系统。

简单翻了一下 [CodexPro 的源码](https://github.com/rebel0789/codexpro/tree/113472c6ff0a1516b6f223a43cd355abdf2e61ae/src)，文件版本检查、补丁预检、连接诊断这些都已经有了，日常改文件、跑检查挺省心。主要留意长时间运行或日志特别多的命令：普通命令调用有时间和输出上限，超出后会结束进程，不会自动变成能恢复的后台任务。这类任务需要单独安排。

## 顺便说说 dot

[dot](https://learn.chatgpt.com/docs/dots) 是 ChatGPT 里的一个长期个人助手，有自己的云端运行环境，能记住一些背景和偏好、使用接好的工具，也能持续跟进事情，主动给你发消息。连接本地电脑后，它还可以访问授权范围内的文件和任务。

我挺看好这个方向，不过到现在也没想到特别好的用途。目前真正觉得有用的，就是让它读邮件，然后给我发提醒。有人帮忙看一眼邮箱，提醒哪些消息需要处理，这件事还是省心的。

另一个用法是桥接网页端和本地。接好电脑和相关工具后，dot 两端的内容都能读，交接任务时可以让它帮忙传递信息和上下文。对我来说，这比再多开一个聊天窗口更有用。下面接 QQ，也是在给这个助手多加一个平时方便使用的入口。

## 再把 dot 接到 QQ

QQ 这部分是我在小青团里单独写的，下面放一下实现思路和提示词。QQ 侧沿用 LLBot 和 OneBot，通过 Tunnel 把本地 MCP 服务接给现有的 dot。

用起来是在 QQ 里发 `/dot 内容`，把这一条交给 dot；进入 dot 模式后，后面的文字也交给它处理。前后文能接上，引用 dot 的回复也能继续问。想回到小青团，就发 `退出dot`。

QQ 通道提供了几个工具：`channel_status` 看状态，`read_dot_context` 取本轮上下文，`send_dot_message` 把回复发回 QQ，`exit_dot_mode` 切回普通聊天。

还有一个关键点：得让 dot 知道 QQ 来了新消息。这次用的是 [MCP Events](https://developers.openai.com/plugins/build/mcp-events)，由本地服务把消息事件发给订阅它的 dot，dot 处理后再调用回复工具。两个方向接起来，就是：

```text
QQ 新消息 → 本地服务发事件 → dot 处理
dot 调用回复工具 → Tunnel → 本地服务 → QQ
```

如果已经有一个能收发消息的 Bot，可以把下面这段需求交给 coding agent，按自己的项目改：

```text
给现有 Bot 加一个连接 dot 的 MCP 通道，先只处理我自己的文字私聊。
提供读取通道上下文和发送回复的工具，用 MCP Events 通知 dot 有新消息，
再通过 Cloudflare Tunnel 暴露 MCP 入口。

每条输入带上 turn_id，回复对应原来的那一条。
保留原 Bot，用 /dot 做单次转发，再加进入和退出 dot 模式的命令。
同一条消息不要重复回复，发送结果不确定时先停下来。

先给我跑通一收一发，然后再补连续对话。
协议参考：https://developers.openai.com/plugins/build/mcp-events
```

工具接好后，还要告诉 dot 收到事件该做什么。以我这套工具名为例，首次订阅可以这样提需求：

> 使用小青团 QQ 通道，先查 channel_status，订阅这个 channel 的 xiaoqingtuan.qq.message 事件。收到后结合通道上下文回答，用 send_dot_message 发回 QQ，带上原 turn_id。每轮只回一次，不要另建一个助手。

订阅后，再把上下文读取和回复规则补进任务说明里。这里用到了 dot 的事件能力，其他客户端未必能照搬。

实际用下来，能在 QQ 里继续和同一个 dot 聊天是有意思的，回复速度则有点看运气。有时二十多秒，有时要等一分多钟，暂时还不适合当作随问随答的聊天 Bot。
