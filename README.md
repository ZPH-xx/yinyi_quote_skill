# 印懿报价 Skill（yinyi-quote）

把「印懿报价」的报价能力提炼成一个可安装到各类 AI 工具的 Skill，覆盖印刷包装 120+ 品类（纸盒/纸箱/手提袋/画册/宣传页/卡片/不干胶等），支持材质、后工艺与小批量数码印刷计价。

## 设计：提示词驱动，skill 不联网
早期版本自带联网脚本，但在很多 AI 工具的沙箱环境里网络请求会被拦截。现在改为：
- **SKILL.md 指导 AI 工具用自己的联网能力**（内置网页/HTTP 工具、shell、申请权限后的网络）直接调用云端报价 API `https://zouph.com`
- skill 里唯一的脚本 `scripts/format-quote.js` 是**纯离线**的 JSON 格式化工具，任何沙箱都能运行
- 价格库在云端集中维护，skill 无需更新数据；报价结果与小程序完全一致
- 联系方式由服务端 `contact` 字段随报价动态下发（skill 本身不写死电话，上架审核更干净；改号码只需改服务端一处，用户 `git pull` 与否都生效。接口暂无该字段时，skill 只引导到微信小程序「印懿报价」，不编造号码）
- **报价 Key 注册制**：skill 里不内置共享 Key（写在公开仓库里的 Key 等于没有 Key）。首次使用领一个专属 Key，自带 30 次免费报价额度；可单独吊销、可计量，也是后续「次数包充值」的载体。MCP 服务器会自动完成领用与本地缓存
- **成本保密**：面向客户的输出只含总价与单价；成本明细、利润系数、拼版方案等内部数据在格式化脚本与 MCP 工具中一律剔除，SKILL.md 也明确禁止 AI 向用户透露

## 目录结构
```
yinyi-quote/
├── SKILL.md                  # 技能说明（Codex / Claude Code 等自动识别的入口）
├── README.md                 # 本文件
├── package.json
└── scripts/
    ├── format-quote.js       # 离线格式化工具（不联网）
    └── mcp-server.js         # 可选：MCP 服务器（见下文）
```

## 快速验证
1. 领一个专属报价 Key（每台机器一次即可，自带 30 次免费报价）：
```
curl -s -X POST https://zouph.com/api/skill/register -H "Content-Type: application/json" -d "{}"
```
把返回的 `data.apiKey` 存成 `~/.yinyi-quote/key`（一行文本；Windows 为 `%USERPROFILE%\.yinyi-quote\key`）。
2. 用任意联网方式请求报价（示例为 curl）：
```
curl -s -X POST https://zouph.com/api/quote -H "Content-Type: application/json" -H "X-Api-Key: $(cat ~/.yinyi-quote/key)" -d '{"boxType":"飞机盒","L":30,"W":20,"H":10,"quantity":500,"material":"300g白卡纸","crafts":["覆亮膜"]}' > result.json
```
3. （可选）格式化成中文报价单：
```
node scripts/format-quote.js result.json
```

## 各工具安装指南

### 第一步：获取 skill（二选一）
- 用 git（推荐，后续更新方便）：
```
git clone https://gitee.com/zph2254/yinyi_quote_skill.git yinyi-quote
```
GitHub 镜像（GitHub 访问顺畅时可用）：
```
git clone https://github.com/ZPH-xx/yinyi_quote_skill.git yinyi-quote
```
- 不用 git：打开 [Gitee 仓库页面](https://gitee.com/zph2254/yinyi_quote_skill) 或 [GitHub 镜像](https://github.com/ZPH-xx/yinyi_quote_skill)，下载 ZIP 压缩包，解压得到 `yinyi-quote` 目录
- 以后更新：在 skill 目录里执行 `git pull`

下面的命令把仓库直接克隆到对应工具的技能目录，克隆后的目录名必须保持 `yinyi-quote`。

### Codex（OpenAI Codex CLI / 桌面应用）
Windows：
```
git clone https://gitee.com/zph2254/yinyi_quote_skill.git C:\Users\<用户名>\.codex\skills\yinyi-quote
```
macOS / Linux：
```
git clone https://gitee.com/zph2254/yinyi_quote_skill.git ~/.codex/skills/yinyi-quote
```
重新打开会话即可。Codex 的 shell 沙箱拦截联网时，它会按 SKILL.md 的指引申请联网权限或改用其他途径。

### Claude Code
个人级：
```
git clone https://gitee.com/zph2254/yinyi_quote_skill.git ~/.claude/skills/yinyi-quote
```
项目级：把仓库克隆到 `<项目>/.claude/skills/yinyi-quote`。

Claude Code 会自动发现目录里的 SKILL.md；它自带 WebFetch 能力，可直接访问接口。

### 千问（Qwen Code / 通义灵码 CLI）
若版本支持 skills 目录：
```
git clone https://gitee.com/zph2254/yinyi_quote_skill.git ~/.qwen/skills/yinyi-quote
```
若不支持：把 SKILL.md 内容复制到项目的 `QWEN.md` 或 `AGENTS.md` 里。

### WorkBuddy 及其他 Agent 工具
- 支持 Agent Skills（SKILL.md）：把本仓库克隆到它的技能目录，或把克隆下来的目录配置为技能目录
- 只支持自定义提示词：把 SKILL.md 内容粘贴进系统提示词/角色设定
- 支持 MCP：见下方 MCP 配置

### 豆包
豆包 App 本身不能执行本地技能，两个办法：
1. 在支持 MCP 的入口（豆包电脑版、扣子 Coze 等）添加下面的 MCP 服务器；
2. 在扣子（Coze）里创建插件/工作流，直接调用 `https://zouph.com/api/quote`（先按下方 `/api/skill/register` 领一个 Key，把 Key 配在插件的请求头里；接口文档见下）。

## 可选：MCP 接入（Claude Desktop / Codex / Cherry Studio / 扣子等）
`scripts/mcp-server.js` 是零依赖的 MCP stdio 服务器，由 MCP 宿主程序（而不是沙箱里的 shell）启动并联网，因此不受聊天沙箱的网络限制：
```json
{
  "mcpServers": {
    "yinyi-quote": {
      "command": "node",
      "args": ["<绝对路径>/yinyi-quote/scripts/mcp-server.js"]
    }
  }
}
```
提供三个工具：`calculate_quote`、`list_box_types`、`list_materials`。

## API 文档（供直接对接）
基础地址 `https://zouph.com`。

### POST /api/skill/register
领用专属报价 Key。无必填参数；可选 `{"installId":"<8-64位字母数字串>","label":"skill|mcp|manual"}`，带同一 `installId` 反复调用会找回同一个 Key。
返回 `{code:200,data:{apiKey,quotaTotal,quotaUsed,remaining,dailyLimit,created}}`。
限制：同一来源 IP 每天最多新建 3 个 Key（防批量领用）；Key 泄露或滥用可在服务端单独吊销。

### POST /api/quote
请求头：
| 头 | 必填 | 说明 |
| --- | --- | --- |
| Content-Type | 是 | application/json |
| X-Api-Key | 是 | 上一步领到的 `apiKey`（缺失/无效返回 HTTP 401，被吊销返回 HTTP 403） |

额度与限流：
- **速率**：每来源 10 次/分钟，同参数 60 秒内有服务端缓存；超限返回 429，反复触发会被临时封禁（403）
- **报价 Key 额度**：每个 Key `quotaTotal` 次（装机默认 30 次，一次性），用完返回 429 且 message 含「装机赠送的 … 次报价额度已用完」
- **无 Key/旧共享 Key 的来源**：按来源 IP 每日 50 次（服务端 `ANON_QUOTE_DAILY_LIMIT` 可调），用完当天返回 429 且 message 含「今日报价次数已达上限」，次日自动恢复
- 每次成功报价服务端都会留痕（Key/来源 IP/盒型与数量/报价结果），保留 90 天

请求体（JSON）：
| 字段 | 必填 | 说明 |
| --- | --- | --- |
| boxType | 是 | 盒型名称/别名/编码 |
| L | 是 | 长，cm |
| W | 视盒型 | 宽，cm |
| H | 视盒型 | 高，cm（平面产品可省） |
| quantity | 是 | 数量 |
| material | 否 | 材质，如 300g白卡纸 |
| crafts | 否 | 后工艺，字符串数组 |
| options | 否 | 附加选项，对象 |

成功返回 `{code:200, data:{...}}`，data 关键字段：
- `finalPrice` / `finalUnitPrice` 最终报价与单价
- `totalCost` / `unitCost` 成本与单件成本
- `breakdown` 材料/印刷/表面/成型成本明细
- `nesting` 拼版方案（幅面、每版拼数、用纸张数）
- `profitRate` 利润系数，`isSmallBatch` 是否小批量数码
- `contact` 联系方式文案，AI 报价回复末尾附上

错误返回 `{code:400/404/500, message:"..."}`；盒型歧义时 message 里带候选列表。

### GET /api/box-types
返回 `{code:200, data:[{code,name,aliases}]}`，共 120+ 盒型。

### GET /api/materials
返回 `{code:200, data:[{name,category,grammage_min,grammage_max}]}`。

## 常见问题
- **沙箱拦截联网怎么办？** 这正是本 skill 提示词驱动设计要解决的：让 AI 工具用自己内置的网络能力或向用户申请权限；skill 脚本本身不需要网络。
- **报价失败「对应多种盒型」？** 盒型名有歧义，message 里列了候选，选一个具体盒型重试。
- **返回 429「今日报价次数已达上限」？** 该来源 IP 当天的直连额度（默认 50 次）已用完，次日自动恢复；需要更多次数可使用微信小程序「印懿报价」（会员配额更高）。
- **调用会被记录吗？** 会。服务端按来源保留调用留痕（时间、来源 IP、盒型与尺寸数量、报价结果），用于额度控制与滥用处置，保留 90 天后自动清理；不会记录任何客户身份或联系方式。
- **想指向本地开发服务器？** 把请求地址换成 `http://192.168.1.12:3900`（内网调试服务器）。
- **需要更新价格？** 无需更新 skill，价格库在服务器集中维护。

## 来源
报价逻辑与小程序「印懿报价」服务端完全一致（同一套云端引擎与价格库）。
