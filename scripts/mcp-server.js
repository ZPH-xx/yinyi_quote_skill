#!/usr/bin/env node
// 印懿报价 MCP 服务器（stdio 传输，零依赖，Node >= 18）
// MCP 客户端配置示例:
//   {"mcpServers":{"yinyin-quote":{"command":"node","args":["/绝对路径/scripts/mcp-server.js"]}}}
// 环境变量 YINYI_API_BASE（兼容旧名 YINTONG_API_BASE）可覆盖服务器地址（默认 https://zouph.com）。
// 报价 Key 无需配置：首次调用自动向 /api/skill/register 领一个专属 Key，
// 并缓存在 ~/.yinyi-quote/mcp-key.json（含 installId，删掉文件也能找回同一个 Key）。
// 如需强制指定 Key（例如已在官网绑定账号），设环境变量 YINYI_API_KEY 即可跳过领用。
// 除报价与查询外还提供额度相关工具：get_quota（还剩几次）、get_recharge_url（次数用完后
// 生成专属充值链接）、redeem_code（兑换码充值）。参数不全时 calculate_quote 会返回结构化
// 错误（errorCode + askUser + requiredDims），照它追问用户、补齐后带全部参数重发即可。
"use strict";

const os = require("os");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const BASE_URL = (process.env.YINYI_API_BASE || process.env.YINTONG_API_BASE || "https://zouph.com").replace(/\/+$/, "");
const KEY_DIR = path.join(os.homedir() || ".", ".yinyi-quote");
const KEY_FILE = path.join(KEY_DIR, "mcp-key.json");

let apiKey = process.env.YINYI_API_KEY || null;

/** 取报价 Key：内存缓存 → 本地文件 → 向服务端领用（领用结果落盘复用） */
async function resolveApiKey() {
  if (apiKey) return apiKey;
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(KEY_FILE, "utf8")); } catch (e) { /* 首次运行没有该文件 */ }
  if (saved && saved.apiKey) { apiKey = saved.apiKey; return apiKey; }

  const installId = (saved && saved.installId) || crypto.randomBytes(16).toString("hex");
  const resp = await fetch(BASE_URL + "/api/skill/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ installId, label: "mcp" })
  });
  const json = await resp.json();
  if (!json || json.code !== 200 || !json.data || !json.data.apiKey) {
    throw new Error("领取报价 Key 失败：" + ((json && json.message) || "接口无响应"));
  }
  apiKey = json.data.apiKey;
  try {
    fs.mkdirSync(KEY_DIR, { recursive: true });
    fs.writeFileSync(KEY_FILE, JSON.stringify({ installId, apiKey }));
  } catch (e) { /* 写不了本地文件也不影响本次会话使用 */ }
  return apiKey;
}

/**
 * 服务端把「下一步该问用户什么」放在 errorCode + data 里（见 SKILL.md 的错误码对照表）。
 * MCP 只有一条 text 通道，抛普通 Error 会把这些结构全丢掉，AI 就只剩一句 message 可猜，
 * 于是会自己编尺寸、或者把「次数用完」当成「服务坏了」。所以错误也走结构化。
 */
class ToolError extends Error {
  constructor(message, detail) {
    super(message);
    this.name = "ToolError";
    this.detail = detail || null;
  }
}

/** 把服务端响应转成带 errorCode / askUser / recharge 的错误对象 */
function failFrom(json, status, fallback) {
  const d = (json && json.data) || {};
  const detail = {
    httpStatus: status,
    code: json ? json.code : null,
    errorCode: (json && json.errorCode) || null,
    message: (json && json.message) || fallback
  };
  // 参数类：缺什么、该怎么问用户，原样带上
  ["askUser", "missing", "invalid", "missingLabels", "candidates", "requiredDims",
   "boxCode", "boxName", "defaultMaterial", "contact"].forEach((k) => {
    if (d[k] !== undefined) detail[k] = d[k];
  });
  // 额度类：把充值入口带上，AI 不用翻文档就知道下一步调哪个接口
  if (d.recharge) detail.recharge = d.recharge;
  ["quotaTotal", "quotaUsed", "quotaPaid", "remaining", "dailyLimit"].forEach((k) => {
    if (d[k] !== undefined) detail[k] = d[k];
  });
  return new ToolError(detail.message, detail);
}

const TOOLS = [
  {
    name: "calculate_quote",
    description: "计算印刷包装产品报价（纸盒/纸箱/手提袋/画册/宣传页/卡片/不干胶等），只返回总价与单价等售价信息（不含成本明细，请勿向用户透露成本）。",
    inputSchema: {
      type: "object",
      properties: {
        boxType: { type: "string", description: "盒型名称、别名或编码，如 飞机盒/天地盖/aircraft_mailer_smb；不确定先用 list_box_types 查询" },
        L: { type: "number", description: "长（cm），必填" },
        W: { type: "number", description: "宽（cm）" },
        H: { type: "number", description: "高（cm）；卡片/吊牌/宣传页等平面产品可不传" },
        quantity: { type: "integer", description: "数量，必填" },
        material: { type: "string", description: "材质，如 300g白卡纸、157g铜版纸；不传用盒型默认材质" },
        crafts: { type: "array", items: { type: "string" }, description: "后加工工艺，如 覆亮膜/烫金/UV/击凸" },
        options: { type: "object", description: "附加选项（可选）" }
      },
      required: ["boxType", "L", "quantity"]
    }
  },
  {
    name: "list_box_types",
    description: "查询支持的盒型列表（含编码与别名），可选关键词过滤。",
    inputSchema: {
      type: "object",
      properties: { keyword: { type: "string", description: "过滤关键词（可选），如 飞机盒" } }
    }
  },
  {
    name: "list_materials",
    description: "查询支持的材质列表（按分类），可选关键词过滤。",
    inputSchema: {
      type: "object",
      properties: { keyword: { type: "string", description: "过滤关键词（可选），如 白卡" } }
    }
  },
  {
    name: "get_quota",
    description: "查询当前报价 Key 的剩余次数、已购次数、每日上限与可购档位。用户问「我还剩几次」时用；也可在批量报价前先查，避免中途撞 429。",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "get_recharge_url",
    description: "生成一次性专属充值链接（30 分钟有效，微信扫码付款）。只在次数用完（errorCode QUOTA_EXHAUSTED）且用户明确同意充值时调用；把返回的 url 和 tellUser 原样转述给用户，严禁自己拼充值网址。",
    inputSchema: { type: "object", properties: {} }
  },
  {
    name: "redeem_code",
    description: "用兑换码给当前 Key 充值次数（用户不便扫码时的兜底通道）。",
    inputSchema: {
      type: "object",
      properties: { code: { type: "string", description: "兑换码，形如 YQAC-DEFG-HJKL；大小写与横线不敏感" } },
      required: ["code"]
    }
  }
];

async function api(path, options) {
  const resp = await fetch(BASE_URL + path, options);
  return { status: resp.status, json: await resp.json() };
}

async function runTool(name, args) {
  args = args || {};
  if (name === "calculate_quote") {
    const { status, json } = await api("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": await resolveApiKey() },
      body: JSON.stringify(args)
    });
    // Key 失效或被吊销：丢掉缓存，下一次调用会自动重新领用
    if (status === 401 || status === 403) apiKey = null;
    if (!json || json.code !== 200) throw failFrom(json, status, "报价失败");
    const d = json.data;
    // 只回传售价信息：成本、利润、拼版等内部数据不下发给 AI，避免透露给客户
    return {
      boxName: d.boxName,
      params: d.params,
      crafts: d.crafts,
      finalPrice: d.finalPrice,
      finalUnitPrice: d.finalUnitPrice,
      billQty: d.billQty,
      isSmallBatch: d.isSmallBatch,
      contact: d.contact
    };
  }
  if (name === "list_box_types") {
    const { json } = await api("/api/box-types");
    if (!json || json.code !== 200) throw new Error((json && json.message) || "查询失败");
    let list = json.data || [];
    if (args.keyword) {
      const kw = String(args.keyword);
      list = list.filter(b => (b.code || "").includes(kw) || (b.name || "").includes(kw) || (b.aliases || []).some(a => String(a).includes(kw)));
    }
    return list;
  }
  if (name === "list_materials") {
    const { json } = await api("/api/materials");
    if (!json || json.code !== 200) throw new Error((json && json.message) || "查询失败");
    let list = json.data || [];
    if (args.keyword) {
      const kw = String(args.keyword);
      list = list.filter(m => (m.name || "").includes(kw) || (m.category || "").includes(kw));
    }
    return list;
  }
  if (name === "get_quota") {
    const { status, json } = await api("/api/skill/quota", { headers: { "X-Api-Key": await resolveApiKey() } });
    if (status === 401 || status === 403) apiKey = null;
    if (!json || json.code !== 200) throw failFrom(json, status, "查询额度失败");
    const d = json.data;
    return {
      remaining: d.remaining, quotaTotal: d.quotaTotal, quotaUsed: d.quotaUsed,
      quotaPaid: d.quotaPaid, dailyLimit: d.dailyLimit, exhausted: d.exhausted,
      packs: d.packs, recharge: d.recharge || null
    };
  }
  if (name === "get_recharge_url") {
    const { status, json } = await api("/api/skill/claim-url", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": await resolveApiKey() },
      body: "{}"
    });
    if (status === 401 || status === 403) apiKey = null;
    if (!json || json.code !== 200) throw failFrom(json, status, "生成充值链接失败");
    const d = json.data;
    return { url: d.url, expiresInMinutes: d.expiresInMinutes, packs: d.packs, tellUser: d.tellUser };
  }
  if (name === "redeem_code") {
    if (!args.code) throw new ToolError("请提供兑换码", { errorCode: "CODE_REQUIRED" });
    const { status, json } = await api("/api/skill/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": await resolveApiKey() },
      body: JSON.stringify({ code: args.code })
    });
    if (status === 401 || status === 403) apiKey = null;
    if (!json || json.code !== 200) throw failFrom(json, status, "兑换失败");
    return { message: json.message, quota: json.data && json.data.quota, key: json.data && json.data.key };
  }
  throw new ToolError("未知工具: " + name);
}

function send(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }

async function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  const id = msg.id;
  try {
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id, result: { protocolVersion: (msg.params && msg.params.protocolVersion) || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "yinyin-quote", version: "1.1.0" } } });
    } else if (msg.method === "notifications/initialized" || msg.method === "notifications/cancelled") {
      // 通知无需回复
    } else if (msg.method === "ping") {
      send({ jsonrpc: "2.0", id, result: {} });
    } else if (msg.method === "tools/list") {
      send({ jsonrpc: "2.0", id, result: { tools: TOOLS } });
    } else if (msg.method === "tools/call") {
      const p = msg.params || {};
      try {
        const data = await runTool(p.name, p.arguments);
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] } });
      } catch (e) {
        // 结构化错误：detail 里有 errorCode / askUser / candidates / recharge，AI 据此追问或引导充值
        const text = e && e.detail ? JSON.stringify(e.detail, null, 2) : "调用失败: " + e.message;
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text }], isError: true } });
      }
    } else if (id !== undefined) {
      send({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found: " + msg.method } });
    }
  } catch (e) {
    if (id !== undefined) send({ jsonrpc: "2.0", id, error: { code: -32603, message: e.message } });
  }
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let idx;
  while ((idx = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;
    let msg;
    try { msg = JSON.parse(line); } catch (e) { continue; }
    handle(msg);
  }
});
// stdin EOF 后无需 process.exit：等待中的请求完成、事件循环清空后进程自然退出
