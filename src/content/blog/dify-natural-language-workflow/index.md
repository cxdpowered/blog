---
title: 现在的 Dify 真的是我们想要的 Dify 吗？
description: 从 Dify 的可视化工作流、DSL 导入导出和低代码老问题出发，聊聊 AI 应用开发真正可能变舒服的方向：一句话生成工作流，自然语言修改，再落成可运行系统。
publishDate: 2026-05-10 22:00:00
tags:
  - Dify
  - AI Agent
  - Workflow
  - Low Code
---

最近我在学 [Dify](https://dify.ai/zh)。总体来说还挺简单的，就是翻译做的有点问题，直接看英文版有点累，下面是我画的demo
![alt text](image.png)
发布之后看上去还不错
![alt text](image-1.png)

一开始只是想搞清楚它是什么：一个 AI 应用开发平台，可以把 LLM、Prompt、RAG、工具调用、Workflow、Chatflow、API 发布这些东西用可视化方式串起来。对非专业开发者来说，它确实很友好。你不用先写一套后端服务，也不用从零搭 Agent 框架，拖几个节点，填几个 Prompt，就能做出一个能跑的 AI 应用。

但越看我越有一个感觉：现在的 Dify，真的是我们想要的 Dify 吗？

## 从一个模板问题开始

我最开始踩到的是一个很小的问题：在 Dify 的 Template 节点里写 Jinja 模板。

比如输入是这样的：

```json
{
  "output": [
    {
      "platform_name": "Twitter",
      "post_content": "我们刚刚发布了一款新的AI写作助手，帮助团队将内容创作速度提升10倍！"
    },
    {
      "platform_name": "LinkedIn",
      "post_content": "我们刚刚推出了一款全新的AI写作助手！"
    }
  ]
}
```

模板里想这么循环：

```jinja2
{% for item in output %}
# {{ item.platform_name }}
{{ item.post_content }}

{% endfor %}
```

但问题往往不在语法本身，而在 Dify 节点之间变量传递的形状：`output` 到底是数组，还是一个包含 `output` 字段的对象？如果是后者，循环就要写成 `output.output`。再进一步，如果上游 LLM 返回的是一段 JSON 字符串，而不是结构化数组，模板节点也会出问题。

这个小问题其实挺典型。Dify 把很多复杂东西包装进了可视化节点，但当你真的开始做应用，还是绕不开数据结构、变量作用域、节点输入输出和类型约束。

## Dify 解决了什么

Dify 的价值很明确。

它把 AI 应用里的很多常见工程问题做成了产品能力：模型接入、知识库、工作流编排、工具调用、日志、发布、API、插件。对团队内部原型、运营工具、知识库问答、客服 Bot、内容生成流来说，它确实能明显降低上手门槛。

它也是开源生态里热度很高的项目。和它类似的还有 [Langflow](https://github.com/langflow-ai/langflow)、[Flowise](https://github.com/FlowiseAI/Flowise)、[RAGFlow](https://github.com/infiniflow/ragflow)、[n8n](https://github.com/n8n-io/n8n)、[Coze Studio](https://github.com/coze-dev/coze-studio) 等。不同项目侧重点不一样：Dify 更像 AI 应用平台，Langflow 和 Flowise 更偏可视化 Agent/RAG 编排，RAGFlow 更偏文档解析和 RAG，n8n 更偏自动化集成。

从国内 AI 应用岗、Agent 开发岗的 JD 来看，Dify 也确实有学习价值。很多偏应用开发的岗位不是在招纯算法研究，而是在招能把 LLM、RAG、Agent、工具调用、业务系统和工程部署串起来的人。Dify、LangChain、LangGraph、LlamaIndex、RAGFlow、FastAPI、MCP、Function Calling、向量数据库、Docker，这些词会反复出现。

所以我不觉得 Dify 没用。相反，它很适合作为 AI 应用开发的入门入口，也适合做团队里的原型和中后台 AI 工具。

但问题是：它现在的形态，可能还不是最终形态。

## 可视化工作流的老问题

Dify 现在的交互还是传统低代码那一套：人拖节点，人连线，人配参数。

这让我想到 UML 和 Scratch。它们刚上手时都挺爽，可视化、直观、门槛低。但工程一复杂，画布就开始乱：节点和连线越堆越多，分支越来越绕，最后你盯着的已经不是系统结构，而是一张没人想维护的流程图。这几乎是所有可视化编排工具的通病，Dify 也没躲过。

我的体会是，可视化拿来看结构挺好，拿来从零搭结构就别扭。AI 应用里真正费劲的也不是把节点摆上去，而是输入输出、状态、异常分支、工具契约、重试、评估这些东西。这些要是还得靠人一个个拖出来，那和当年的低代码也没多大区别。

## AI 都能写复杂代码了，为什么还要人手动画流程图？

AI 现在已经能写代码、改代码、读文档、生成测试、解释架构。那一个类 UML 的工作流，凭什么还要人一个节点一个节点地手动画？

我觉得更顺的方式是这样：

```mermaid
flowchart LR
  A["一句话描述需求"] --> B["AI 生成工作流草图"]
  B --> C["自然语言修改"]
  C --> D["确认输入输出和异常分支"]
  D --> E["生成可导入 DSL 或代码"]
  E --> F["运行、测试、可视化调试"]
```

第一入口不该是画布，而该是自然语言。

用户说一句“帮我做一个客服工单自动分类和回复工作流，高风险问题先转人工，普通问题查知识库再回复”，系统就直接把工作流生成出来。

之后想改，也用说的：“加一个企业微信通知节点”“高优先级工单写进数据库”“回答前先检查有没有命中知识库”。

最后再由系统把这个结构落成 Dify DSL、LangGraph 代码、n8n workflow，或者某种更通用的中间表示。

## Dify DSL 让这件事变得可行

Dify 支持 DSL 导入导出，这其实给了我们一个很好的切入点。

根据 [Dify 的 App Management 文档](https://docs.dify.ai/en/use-dify/workspace/app-management)，Dify 应用可以导出成 DSL，里面包括 App 配置、Workflow 编排、节点设置、模型参数和 Prompt 模板。根据 [Dify Key Concepts](https://docs.dify.ai/en/use-dify/getting-started/key-concepts)，所有 Dify App 都可以导出为 YAML 格式的 Dify DSL，也可以直接从这些 DSL 文件创建应用。

这意味着 Dify 的 Workflow 不只是画布上的图，而是一份可以生成、校验、版本管理和迁移的配置。

如果 AI 能稳定生成 Dify DSL，那么就可以绕过手动画布这一步：

```mermaid
flowchart LR
  A["自然语言需求"] --> B["生成 Dify DSL YAML"]
  B --> C["校验节点、边、变量引用"]
  C --> D["导入 Dify"]
  D --> E["运行和调试"]
  E --> F["根据反馈继续修改 DSL"]
```

社区里已经有人在做类似方向。比如 Dify GitHub Discussion 里有一个 [Workflow Skill](https://github.com/langgenius/dify/discussions/34916)，目标就是从自然语言生成可导入的 Dify workflow DSL。还有一个叫 [workflow-skill](https://github.com/LingyiChen-AI/workflow-skill) 的项目，支持一句话生成 Coze、Dify、ComfyUI 的工作流定义文件，其中 Dify 部分会生成 `.dify.yml` 或 `.dify.json`，再通过 UI 的 Import DSL 导入。

这说明问题不是能不能做，而是能不能做得稳定、可维护、足够贴近真实工程。

## 但我想要的不只是“生成后导入”

不过到这一步我还是觉得不够。

“生成 DSL → 导入 Dify → 画布显示”确实比手动拖节点舒服，但它骨子里还是老路子，只是把人工拖拽换成了 AI 生成配置，转来转去仍然围着 Dify 的画布在转。

我更想试的是另一种用法：人一直用自然语言跟系统聊，系统在背后实时维护一个工作流结构，画布只是这个结构的投影，看一眼、点一点就行，不再是主要的编辑入口。

各部分各管各的：自然语言负责创造和修改，结构化 DSL 负责把意图固定下来，可视化负责检查和理解，代码或平台配置负责真正跑起来。

传统低代码的卖点是“不会写代码也能拖出系统”。可到了 AI 时代，这个问题其实可以反过来问：既然 AI 已经能生成代码和配置，人为什么还要亲自拖？

## 可能的实现路径

我想要的东西大概会分成几层。

第一层是自然语言入口。用户只描述目标，不直接操作节点。

第二层是中间表示。系统先生成一个平台无关的 workflow IR，比如：

```yaml
name: customer_ticket_reply
inputs:
  - name: ticket_content
    type: text
steps:
  - id: classify
    type: llm_classify
    input: ticket_content
  - id: risk_route
    type: if_else
    condition: classify.risk_level == "high"
  - id: search_kb
    type: knowledge_retrieval
  - id: reply
    type: llm_generate
outputs:
  - reply.text
```

第三层才是平台适配器。它可以把这个 IR 编译成 Dify DSL，也可以编译成 LangGraph 代码、n8n workflow，或者直接变成 FastAPI 后端里的 Python 逻辑。

第四层是可视化。画布根据 IR 渲染出来，用户可以看、可以点、可以局部修改，但不必把拖拽当成主要生产方式。

第五层是校验和测试。比如检查变量是否存在、节点有没有输入输出、分支闭不闭合、工具参数对不对、有没有异常路径、有没有一组能跑的示例输入。

画一个图不难，难的是让这个图能跑、能改、能讲清楚、能测。

## 先挖个坑

所以我打算后面自己写一个类似的小东西。

目标很简单：一句话生成工作流，然后可以继续用自然语言修改，最后再看怎么可视化、怎么导出、怎么导入 Dify。

第一版不追求大而全，可能只支持几个核心节点：

- Start
- LLM
- Tool
- HTTP
- If-Else
- Template
- End

节点多少无所谓，我想先验证的是这种交互到底舒不舒服。要是它真比现在手动画 Dify workflow 顺，那就说明问题不在 Dify，而在入口方式。

Dify 现在当然有它的价值。只是我想要的那个 Dify，大概不是一个让我拖节点更顺手的平台，而是我把目标说清楚之后，它能自己长出工作流，再让我用一句句话慢慢改的东西。
