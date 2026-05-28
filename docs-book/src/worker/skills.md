# 技能与知识库

## 扫描技能 (`worker/skills/`)

### wireless-scan.yaml

10 条无线协议安全扫描规则，用于指导 nga AI Agent 在 C/C++ 代码审计中关注的关键安全模式。

| # | Rule ID | 规则名 | 严重度 | 说明 |
|---|---------|--------|--------|------|
| 1 | RULE-001 | TLV 解析边界检查 | CRITICAL | 检查 TLV 消息解析中 p += length 前是否校验 remaining_len；未知 Type 是否能安全跳过；Length 回绕 |
| 2 | RULE-002 | 结构体强转内存安全 | HIGH | 检查 memcpy/reinterpret_cast/C 风格强转是否验证大小；高版本新字段是否导致越界 |
| 3 | RULE-003 | Switch-Case 默认分支 | MEDIUM | 检查消息分发 switch-case 是否包含防御性 default 分支 |
| 4 | RULE-004 | ASN.1 Optional 字段检查 | HIGH | 检查 Optional 字段访问前是否有 Presence 标志位校验或 NULL 检查 |
| 5 | RULE-005 | 相似变量名混淆 | MEDIUM | 检查同一作用域内相似变量名是否存在误用 (buf/buff, len/length) |
| 6 | RULE-006 | 重复/冗余代码 | LOW | 检查复制粘贴后未修改的代码块、重复赋值/判断 |
| 7 | RULE-007 | 未初始化变量使用 | HIGH | 检查局部变量、结构体是否在使用前被初始化 |
| 8 | RULE-008 | 内存泄漏 | HIGH | 检查 malloc/calloc/strdup 后所有路径是否有 free |
| 9 | RULE-009 | 空指针解引用 | CRITICAL | 检查返回值是否检查 NULL 后再解引用 |
| 10 | RULE-010 | 数组越界 | CRITICAL | 检查数组索引是否校验范围；循环条件是否导致越界 |

**输出格式** (JSON)：

```json
{
  "mr_link": "MR 链接",
  "file_path": "文件路径",
  "line_number": 142,
  "rule_id": "RULE-001",
  "severity": "CRITICAL",
  "description": "问题描述",
  "code_snippet": "相关代码片段",
  "suggestion": "修复建议",
  "confidence": 0.85
}
```

**排除规则**：已包含 assert/CHECK/VERIFY 等防御宏的行；测试代码目录；第三方代码目录；置信度低于 0.5 的问题。

### wireless-scan.mcp.json

MCP (Model Context Protocol) 服务器配置，为 AI Agent 提供结构化的技能描述和参数定义。参数：mr_link (必填)、scan_rules (可选，启用规则 ID 列表)。

### wireless-scan.claude.md

Claude 特定的技能指令文件 (Markdown 格式)，包含角色设定、10 条规则 (每条含 BAD/GOOD 代码示例)、输出格式和注意事项。

三个文件 (YAML / MCP JSON / Claude MD) 表达同一技能的不同载体，适配不同的 Agent 框架。

## 知识库 (`worker/knowleage/`)

### wireless-radio.md

4G/5G 无线协议代码审计领域知识库，涵盖低错问题的四大典型"雷区"：

1. **TLV 解析陷阱与向前兼容性** — 高低版本混跑时边界检查缺失
2. **结构体强转与内存越界** — 高版本追加字段后低版本结构体映射越界
3. **Switch-Case 的"黑洞"** — 缺少 default 分支，收到高版本新消息时未定义行为
4. **ASN.1 生成代码的"逻辑空洞"** — Optional 字段未检查 Presence 标志位

## Memory Rule 反馈闭环

```
扫描发现漏洞 → Accept → 生成正向 Memory Rule (pending)
│
▼
Committer+ 审批 → approved → 注入后续扫描 prompt (规划中)

扫描误报 → Reject → 生成负向 Memory Rule (auto-active) → 后续扫描自动忽略
```

> **注意**: Memory Rule 注入到 LLM prompt 的功能基础设施已就绪，但尚未实际接入 Orchestrator 的扫描 prompt 中。
