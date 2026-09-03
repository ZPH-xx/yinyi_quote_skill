#!/usr/bin/env node
// 印懿报价 MCP 服务器（stdio 传输，零依赖，Node >= 18）
// MCP 客户端配置示例:
//   {"mcpServers":{"yinyin-quote":{"command":"node","args":["/绝对路径/scripts/mcp-server.js"]}}}
// 环境变量 YINTONG_API_BASE 可覆盖服务器地址（默认 https://zouph.com）。
// 环境变量 YINYI_API_KEY 可覆盖报价接口 API key（默认内置当前有效 key）。
"use strict";

const BASE_URL = (process.env.YINTONG_API_BASE || "https://zouph.com").replace(/\/+$/, "");
const API_KEY = process.env.YINYI_API_KEY || "yq-cb2a82072b740760ea4fa0cb7edfbe6a";

const TOOLS = [
  {
    name: "calculate_quote",
    description: "计算印刷包装产品报价（纸盒/纸箱/手提袋/画册/宣传页/卡片/不干胶等），返回成本明细与最终报价。",
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
  }
];

async function api(path, options) {
  const resp = await fetch(BASE_URL + path, options);
  return resp.json();
}

async function runTool(name, args) {
  args = args || {};
  if (name === "calculate_quote") {
    const json = await api("/api/quote", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Api-Key": API_KEY },
      body: JSON.stringify(args)
    });
    if (!json || json.code !== 200) throw new Error((json && json.message) || "报价失败");
    return json.data;
  }
  if (name === "list_box_types") {
    const json = await api("/api/box-types");
    if (!json || json.code !== 200) throw new Error((json && json.message) || "查询失败");
    let list = json.data || [];
    if (args.keyword) {
      const kw = String(args.keyword);
      list = list.filter(b => (b.code || "").includes(kw) || (b.name || "").includes(kw) || (b.aliases || []).some(a => String(a).includes(kw)));
    }
    return list;
  }
  if (name === "list_materials") {
    const json = await api("/api/materials");
    if (!json || json.code !== 200) throw new Error((json && json.message) || "查询失败");
    let list = json.data || [];
    if (args.keyword) {
      const kw = String(args.keyword);
      list = list.filter(m => (m.name || "").includes(kw) || (m.category || "").includes(kw));
    }
    return list;
  }
  throw new Error("未知工具: " + name);
}

function send(obj) { process.stdout.write(JSON.stringify(obj) + "\n"); }

async function handle(msg) {
  if (!msg || typeof msg !== "object") return;
  const id = msg.id;
  try {
    if (msg.method === "initialize") {
      send({ jsonrpc: "2.0", id, result: { protocolVersion: (msg.params && msg.params.protocolVersion) || "2024-11-05", capabilities: { tools: {} }, serverInfo: { name: "yinyin-quote", version: "1.0.0" } } });
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
        send({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: "调用失败: " + e.message }], isError: true } });
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
