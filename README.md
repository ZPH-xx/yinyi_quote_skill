# 印懿报价 Skill（yinyi-quote）

把「印懿报价」的报价能力提炼成一个可安装到各类 AI 工具的 Skill，覆盖印刷包装 120+ 品类（纸盒/纸箱/手提袋/画册/宣传页/卡片/不干胶等），支持材质、后工艺与小批量数码印刷计价。

## 设计：提示词驱动，skill 不联网
早期版本自带联网脚本，但在很多 AI 工具的沙箱环境里网络请求会被拦截。现在改为：
- **SKILL.md 指导 AI 工具用自己的联网能力**（内置网页/HTTP 工具、shell、申请权限后的网络）直接调用云端报价 API `https://zouph.com`
- skill 里唯一的脚本 `scripts/format-quote.js` 是**纯离线**的 JSON 格式化工具，任何沙箱都能运行
- 价格库在云端集中维护，skill 无需更新数据；报价结果与小程序完全一致
- 联系方式由服务端 `contact` 字段随报价动态下发（skill 本身不写死电话，上架审核更干净；改号码只需改服务端一处，用户 `git pull` 与否都生效。接口暂无该字段时，skill 只引导到微信小程序「印懿报价」，不编造号码）
- **报价 Key 注册制**：skill 里不内置共享 Key（写在公开仓库里的 Key 等于没有 Key）。首次使用领一个专属 Key，自带 30 次免费报价额度；可单独吊销、可计量，也是「次数包充值」的载体——次数用完后 AI 能就地生成专属付款链接（微信扫码），用户不必换工具。MCP 服务器会自动完成领用与本地缓存
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
提供六个工具：
- `calculate_quote` 计算报价；参数不全时返回结构化错误（`errorCode` + `askUser` + `requiredDims`），照它追问用户即可
- `list_box_types` / `list_materials` 查盒型与材质
- `get_quota` 查当前 Key 还剩多少次、可购哪些档位
- `get_recharge_url` 次数用完后生成专属充值链接（30 分钟有效）
- `redeem_code` 用兑换码充值

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
- **报价 Key 额度**：每个 Key `quotaTotal` 次（装机默认 30 次）。用完返回 HTTP 429 + `errorCode:"QUOTA_EXHAUSTED"`，message 含「装机赠送的 … 次报价额度已用完」（买过次数包后改说「…已全部用完（含已购 N 次）」），`data.recharge` 里写明下一步该调的充值接口
- **付费后的每日上限**：买过次数包的 Key 另有 `dailyLimit`（默认 200 次/天；¥129 / 5000 次这一档为 500 次/天），超限返回 429 + `errorCode:"DAILY_LIMIT"`，次日自动恢复——这不是次数用完，不要引导充值
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
| material | 否 | 材质，如 300g白卡纸。**不传不会走"盒型默认材质"**：普通盒型一律按 `300g白卡纸` 估算，实际按什么算会在 `data.estimate.assumedMaterial` 里说明。画册不读这个字段，请用 `coverPaper`/`innerPaper` |
| crafts | 否 | 后工艺，字符串数组。线上无价档的写法（如"贴亮片"）不计价，会在 `data.estimate.unbilledCrafts` 里列出 |
| pageCount | **画册必填** | P 数（页数，含封面，4 的倍数，如 16/32/64）。画册按「页 × 本」计价，缺它服务端返回 400 追问，不会兜底出价 |
| bindingType | 否（画册） | 装订：`saddle` 骑马钉 / `perfect` 胶装 / `sewing` 锁线 / `hardcover` 精装 / `ring` 圈装；缺省按 P 数自动选，被纠正过会回 `bindingCorrected` |
| coverPaper / innerPaper | 否（画册） | 封面纸 / 内页纸，缺省 `250g铜版纸` / `157g铜版纸` |
| innerCrafts | 否（画册） | 内页工艺，与 `crafts`（封面）分开计价 |
| foldType / foldName | 否（宣传页） | 折页道数与名称 |
| colorCount | 否 | 印刷色数，如 4；「四色+白」传 5 |
| options | 否 | 附加选项，对象 |

成功返回 `{code:200, data:{...}}`，data 字段：
- `finalPrice` / `finalUnitPrice` 总价与单价
- `boxName` / `boxCode` / `params` / `crafts` / `colorCount` 盒型与参数回显
- `billQty` 实际计价数量（小批量满版时可能大于 `quantity`）
- `estimate`（**有则必须转述**）：这一单里没算钱/被系统猜了的部分。
  `unbilledCrafts` 线上无价档的工艺、`contactRequired` 该转人工核价、
  `assumedMaterial` 材质是系统估的、`hint` 可直接转述的中文句子
- 画册另有 `pageCount` / `bindingType` / `bindingName` / `coverPaper` / `innerPaper` / `sizeDesc`；
  画册按页计价，**没有** `billQty` 与 `colorCount`，复述需求时别当成缺字段
- `isSmallBatch` 是否走小批量数码路径、`defaultLaminated` 小批量未提覆膜时是否默认含哑膜
- `nesting` 拼版方案（幅面、每版拼数、印张数）
- `contact` 联系方式文案，AI 报价回复末尾附上

> 成本构成、利润系数由服务端统一裁剪，接口不下发（2026-09-09 起）。
> 对外主张是**单价与总价透明、展开尺寸与拼版可核对、成本构成不外发**。

错误返回 `{code:400/404/500, errorCode:"...", message:"...", data:{...}}`（HTTP 状态码仍是 200）。`errorCode` 取值：`MISSING_PARAMS`、`BOX_AMBIGUOUS`、`BOX_UNKNOWN`、`BOX_CONTACT_ONLY`、`ENGINE_ERROR`；额度类 `QUOTA_EXHAUSTED` / `DAILY_LIMIT` 走真实 HTTP 429。

**参数澄清协议**：`/api/quote` 是**无状态**的，补齐参数后必须带上全部已知参数重发一次完整请求，不能只发增量。
- **画册必须问 P 数**：`pageCount` 缺失返回 `MISSING_PARAMS`（`data.missing` 含 `pageCount`）。
  P 数不是尺寸、也没有可兜底的"常规值"——32P 与 64P 差一倍成本，猜一个数就是发假价格。
- `data.askUser`：可直接转述给用户的中文追问句（一次问齐所有缺项）
- `data.missing` / `data.invalid`：缺哪些字段、哪些字段传了但不是大于 0 的数字
- `data.missingLabels`：缺项的中文说法
- `data.requiredDims`：该盒型需要哪几个尺寸，如 `["L","W","H"]`（判断该问什么比按盒型名猜可靠）
- `data.candidates`（盒型歧义时）：`[{code,name,requiredDims,defaultMaterial}]`
- 调用方不得臆造尺寸/数量：宁可追问，也不要拿默认值算出一个假价格
- 参数类 400 不消耗额度（服务端只对 `code:200` 留痕计数）

### GET /api/box-types
返回 `{code:200, data:[{code,name,aliases}]}`，共 120+ 盒型。

### GET /api/materials
返回 `{code:200, data:[{name,category,grammage_min,grammage_max}]}`。

### GET /api/skill/quota
请求头 `X-Api-Key`。返回 `{code:200,data:{apiKey,quotaTotal,quotaUsed,quotaPaid,remaining,dailyLimit,exhausted,packs,recharge,pendingOrders?}}`。`remaining` 为 `null` 表示不限量（白名单 Key）；`exhausted:true` 时 `recharge` 给出下一步该调的充值接口。**这个接口自带对账**：`exhausted` 为真时会先向微信核对该 Key 名下未确认的充值单，付了就当场到账再返回，所以用户说「充好了」而你不确定时，调它比猜可靠。`pendingOrders`（仅在有待确认单时出现）形如 `[{orderId,packName,quota,priceYuan,tradeState}]`，同时 `recharge.paymentInFlight:true`——此时应让用户等约 30 秒重发报价，**不要再生成新链接**。

### GET /api/skill/packs
公开接口，无需 Key。返回 `{code:200,data:{packs:[{key,name,quota,amount,priceYuan,dailyLimit}]}}`，`amount` 单位为分。

### POST /api/skill/claim-url
请求头 `X-Api-Key`，body `{}`。生成一次性专属充值链接（30 分钟内对同一 Key 复用同一条）。
返回 `{code:200,data:{url,expiresAt,expiresInMinutes,reused,key,packs,tellUser,pendingOrders?,paymentInFlight?,alreadyPaid?,grantedQuota?}}`：`url` 形如 `https://zouph.com/recharge?t=ct_…`，原样交给用户点击；`tellUser` 是可直接念给用户的话术。链接域名由服务端 `SKILL_RECHARGE_BASE_URL` 决定，**不接受请求参数覆盖**（否则被诱导的 AI 能生成指向钓鱼域的「官方充值链接」）。
**出码前同样先对账**，因此有三种结果，`tellUser` 已经分别写好，照念即可：
- 正常：给出链接；
- `paymentInFlight:true`：有一笔还在微信侧确认中（用户可能正在输密码），话术是「先别重复付款，等 30 秒重发报价」；
- `alreadyPaid:true` + `grantedQuota:N`：上一笔其实已经付成（回调晚了而已），次数当场到账，话术明确让用户**别再扫第二次**。

### 充值页 GET /recharge?t=<token>
用户在浏览器里打开：选次数包 → 手机号 + 密码登录/注册（与官网、小程序网页端同号互通）→ 微信扫码付款 → 页面每 2.5 秒轮询到账状态。付款成功后次数直接发放到 `t` 所绑定的那个 Key，用户回到 AI 工具说一句「充好了」即可继续报价。手机端可直接跳转微信付款；跳转被内置浏览器拦住时，页面还提供「显示二维码用另一台设备扫」与「复制链接到电脑打开」两条退路。**页面没来得及显示到账也不等于没到账**：到账由服务端保证（回调 / 回 AI 时对账 / 后台定时扫三条路都会补发），用户只需回 AI 重发报价。

每张付款码 **15 分钟内有效**（服务端下单时给微信传了 `time_expire`，超时自动关单），页面会写明几点前有效，过期后撤掉二维码并给出「重新生成付款码」按钮；同一个 Key 最多挂 3 张没付的码，再多会被提示先付掉手上那张。所以用户说"码扫不了/付不了"时，八成是过期了 —— 回页面点重新生成即可，不需要重领充值链接。

### POST /api/skill/redeem
请求头 `X-Api-Key`，body `{"code":"YQAC-DEFG-HJKL"}`。兑换码充值（不便扫码时的兜底）。成功返回 `{code:200,message:"兑换成功，已到账 N 次…",data:{quota,key}}`；失败时 `errorCode` 取 `CODE_REQUIRED` / `CODE_NOT_FOUND` / `CODE_USED` / `CODE_VOID`。兑换码不区分大小写，横线可省略。

## 常见问题
- **沙箱拦截联网怎么办？** 这正是本 skill 提示词驱动设计要解决的：让 AI 工具用自己内置的网络能力或向用户申请权限；skill 脚本本身不需要网络。
- **报价失败「对应多种盒型」？** 盒型名有歧义，message 里列了候选，选一个具体盒型重试。
- **返回 429「今日报价次数已达上限」？** 该来源当天的额度已用完（`errorCode:"DAILY_LIMIT"`），次日自动恢复；这不是次数用完，不需要充值。
- **返回 429 `QUOTA_EXHAUSTED`（次数用完了）怎么办？** 调 `POST /api/skill/claim-url` 拿到专属充值链接交给用户，微信扫码付款后立即到账；不便扫码可联系客服 15990159967 用兑换码充值。MCP 用户直接用 `get_recharge_url` / `redeem_code` 工具。
- **付了钱次数没到账？** 先让用户回 AI 工具重发一次报价——服务端会自己向微信核对并补发（充值页关掉了、微信回调晚了都不影响）。仍没到账再看 `data.pendingOrders`：里面有 `orderId`（`QP_` 开头）就说明有一笔正在确认，等约 30 秒再重发；超过 5 分钟仍不到账，把订单号发给客服 15990159967 核对。**不要因为没到账就再要一条新链接付款**——同一笔钱付两次就是扣两次。
- **调用会被记录吗？** 会。服务端按来源保留调用留痕（时间、来源 IP、盒型与尺寸数量、报价结果），用于额度控制与滥用处置，保留 90 天后自动清理；不会记录任何客户身份或联系方式。
- **想指向本地开发服务器？** 把请求地址换成 `http://192.168.1.12:3900`（内网调试服务器）。
- **需要更新价格？** 无需更新 skill，价格库在服务器集中维护。

## 来源
报价逻辑与小程序「印懿报价」服务端完全一致（同一套云端引擎与价格库）。
