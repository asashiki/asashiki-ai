# Implement.md

## Source of truth

- 规格说明：`Prompt.md`
- 里程碑：`Plan.md`
- 仓库规则：`AGENTS.md`
- 当前状态与决策：`Documentation.md`

如有冲突，优先级如下：

1. `Prompt.md`
2. `Plan.md`
3. `AGENTS.md`
4. `Documentation.md`

## How Codex should operate

1. 先阅读所有上述文件。
2. 只实现当前 milestone 的内容。
3. 不要主动扩张 scope。
4. 所有新文件和模块命名要朴素清晰。
5. 先把最小数据流打通，再补 UI 细节。
6. 遇到“可以很酷但不是 MVP 的内容”，记入 `Documentation.md` 的 follow-ups，不要直接实现。

## Required output style during execution

- 每次任务先说明当前属于哪个 milestone。
- 先给出计划，再开始编辑。
- 改完代码后必须运行验证命令。
- 验证失败必须先修复再继续。
- 结束时更新 `Documentation.md`。

## Guardrails

- 不引入未经批准的重大外部平台依赖。
- 不引入重量级记忆框架作为第一期必需品。
- 不让 agent 直接写文件系统。
- 不让 public API 读取 private personal 数据。
- 不写“以后会自动做”的隐式逻辑；所有行为必须明确。

## When adding a new capability

新增能力时必须同时回答：

- 这是 public / private operational / private personal / MCP-exposed 的哪一类？
- 这是 Core API 的能力，还是 MCP 的包装能力？
- 是读操作还是写操作？
- 是否需要审计？
- 是否应该出现在 Admin？
- 是否应该出现在 Public Web？
- 是否需要 secrets？
- 第一阶段是否真的需要？

## Suggested verification pattern

### Code / API changes
- install
- lint
- typecheck
- tests
- build
- smoke test

### Docs-only changes
- 检查链接和文件引用
- 更新 `Documentation.md`

## Handoff rules

每完成一个 milestone，都要在 `Documentation.md` 里记录：

- Done
- Remaining
- Decisions made
- Validation run
- Known issues
- Suggested next step
