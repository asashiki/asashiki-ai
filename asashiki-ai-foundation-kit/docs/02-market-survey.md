# 02 Market Survey and Judgment

## Bottom line

市面上已经有不少“很能打”的 agent 项目，也有专门做 memory / context 的基础设施项目。  
你的最佳策略不是重造它们，而是：

- 把 **agent 平台** 当作客户端 / 参考系
- 把 **memory/context 项目** 当作未来候选依赖
- 先做你自己的 **Core API + MCP Gateway + Admin**

## A. Full-stack agent platforms

### OpenClaw
适合参考：
- 多渠道 / workspace / skills / memory 的产品形态
- 用户如何和 agent 进行长期交互
- 哪些能力适合做宿主应用，而不是做底座

不建议第一期直接拿来做底座，因为：
- 它本身就是一整套 agent 平台
- 你会被它的数据结构和产品判断带着走
- 它更适合作为“要接入你底座的客户端之一”

### Hermes Agent
适合参考：
- 持久会话
- skills / self-improvement / MCP server mode
- 云端 agent 的运行形态

不建议第一期作为底座本体，因为：
- 它仍然是一个 agent runtime
- 你的目标是让多个 agent 共用一套个人数据与能力，不是选一个成为唯一内核

### Operit / Kelivo 一类项目
适合参考：
- 前端体验
- 多功能聊天 UI
- 用户如何管理技能、记忆、工具、自动化

不建议成为第一期依赖，因为：
- 更新非常快
- 适合借产品设计思路，不适合作为你的根系统

## B. Memory / context infrastructure

### Mem0
优点：
- 非常贴近“给 agent 增加通用记忆层”的定位
- 对“长期偏好与用户记忆”有直接参考价值

建议：
- 作为第二期或第三期的 memory 候选
- 不作为第一期必需依赖

### Zep
优点：
- 更强调 context engineering，而不是只讲 memory
- 很适合“多来源上下文拼装”的系统设计参考

建议：
- 作为你后面做 context assembly 时的重要参考
- 第一阶段不直接强绑定

### Letta
优点：
- 非常强调 stateful agents
- 对“代理随时间持续学习”的设计非常有参考价值

建议：
- 用来理解“agent 内存”与“个人基础设施”之间的分界
- 第一阶段不直接采用其整套 runtime

## C. Automation / connector orchestration

### n8n
优点：
- 连接器多
- 适合把很多第三方流程编排起来
- 后续可作为“自动化层”

建议：
- 第二期后再考虑
- 第一阶段先用简单定时任务 / cron，不上完整 workflow 平台

## D. Recommendation matrix

### 第一阶段建议直接采用
- Cloudflare static hosting / edge capabilities
- 自己的 Core API
- 自己的 MCP Gateway
- 轻量本地/服务端存储
- 明确文档驱动的 Codex 工作流

### 第一阶段建议只参考不集成
- OpenClaw
- Hermes
- Operit
- Kelivo
- Letta
- Zep
- Mem0
- n8n

### 第二阶段优先候选
- Mem0 或自研 memory summary pipeline
- n8n 作为 automation plane
- 某个更强的连接器编排层

## E. Strategic conclusion

你最需要的不是“找到一个能全包的神项目”，而是：

1. 明确哪些东西必须由你掌控
2. 把你的数据和能力沉淀在自己的底座
3. 让不同 agent 通过 MCP 来消费这些能力

这样，市场变化越快，你越不容易被绑死。
