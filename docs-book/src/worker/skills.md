# 技能与知识库

## 扫描技能 (`worker/skills/`)

### wireless-scan.yaml

10 条无线协议安全扫描规则，用于指导 `nga` AI Agent 在 C/C++ 代码审计中关注的关键安全模式：

| # | 规则 | 说明 |
|---|------|------|
| 1 | TLV Bounds Check | TLV (Type-Length-Value) 结构的边界检查缺失 |
| 2 | Struct Cast Safety | 结构体强制类型转换的安全性 |
| 3 | Switch-Case Default | switch 语句缺少 default 分支 |
| 4 | ASN.1 Parsing | ASN.1 编解码的边界与格式验证 |
| 5 | Buffer Overflow | 缓冲区溢出（memcpy/strcpy 等） |
| 6 | Integer Overflow | 整数溢出与下溢 |
| 7 | Race Condition | 竞态条件与锁管理 |
| 8 | Error Path | 错误路径的资源泄漏 |
| 9 | API Misuse | API 使用不当（参数顺序、返回值忽略） |
| 10 | Crypto Weakness | 加密算法弱点与密钥管理 |

每条规则包含：
- 规则描述与审计要点
- C/C++ 代码示例
- 典型漏洞模式
- 修复建议

### .mcp.json

MCP (Model Context Protocol) 服务器配置，用于为 AI Agent 提供额外的工具和上下文。

### .claude.md

Claude 特定的技能指令文件，定义 Agent 在扫描过程中的行为约束和审计策略。

## 知识库 (`worker/knowleage/`)

### wireless-radio.md

4G/5G 无线协议代码审计领域知识库，涵盖：

- **协议栈基础** — L1/L2/L3 层架构
- **4G LTE** — RRC/PDCP/RLC/MAC 协议
- **5G NR** — RRC/PDCP/RLC/MAC 新特性
- **安全机制** — 加密算法、密钥派生、完整性保护
- **常见漏洞模式** — 协议实现中的典型安全问题
- **审计关注点** — 代码审计时应特别关注的领域

## Memory Rule 反馈闭环

Memory Rule 系统与技能/知识库协同工作：

```
扫描发现漏洞 → Accept → 生成正向 Memory Rule (pending)
                              │
                              ▼
                    Committer+ 审批 → approved
                              │
                              ▼
                    注入后续扫描 prompt
                    (规划中：当前基础设施已就绪，
                     但尚未接入 orchestrator prompt)

扫描误报 → Reject → 生成负向 Memory Rule (auto-active)
                          │
                          ▼
                  后续扫描自动忽略此类模式
```

> **注意**: Memory Rule 注入到 LLM prompt 的功能目前基础设施已就绪（数据库模型、API、前端管理），但尚未实际接入 Orchestrator 的扫描 prompt 中。这是路线图中的下一步工作。
