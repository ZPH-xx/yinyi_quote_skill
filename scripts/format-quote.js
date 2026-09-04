#!/usr/bin/env node
// 印懿报价格式化工具（纯离线，不发起任何网络请求）
// 用法:
//   node format-quote.js result.json   # 从文件读取 /api/quote 接口返回的 JSON
//   node format-quote.js -             # 从 stdin 读取
// 输入可以是完整响应 {"code":200,"data":{...}}，也可以直接是 data 对象。
"use strict";

const fs = require("fs");

function money(n) {
  return (typeof n === "number" && isFinite(n)) ? "¥" + n.toFixed(2) : "-";
}

function line(s) { console.log(s || ""); }

function printSummary(d) {
  // 面向客户的报价单：只输出规格与总价/单价，成本、利润、拼版等内部数据一律不展示
  const p = d.params || {};
  line("==========================================");
  line("【印懿报价】" + (d.boxName || ""));
  let spec = "尺寸 " + p.L + " cm";
  if (p.W) spec += " x " + p.W + " cm";
  if (p.H) spec += " x " + p.H + " cm";
  spec += " | 数量 " + p.quantity;
  if (d.billQty && d.billQty !== p.quantity) spec += " (按 " + d.billQty + " 计价)";
  line(spec);
  if (p.material) line("材质 " + p.material);
  if (d.crafts && d.crafts.length) line("工艺 " + d.crafts.join("、"));
  line("------------------------------------------");
  line("★ 最终报价 " + money(d.finalPrice) + " (单价 " + money(d.finalUnitPrice) + ")");
  line("==========================================");
  line("注: 报价为系统估算价，正式订单价以人工确认为准。");
  line("");
  // 联系方式由服务端 contact 字段集中下发；缺失时不写死号码，只引导官方渠道
  line(d.contact || "如需下单或进一步咨询，请使用微信小程序「印懿报价」");
}

async function readInput() {
  const arg = process.argv[2];
  if (arg && arg !== "-") return fs.readFileSync(arg, "utf8");
  let text = "";
  process.stdin.setEncoding("utf8");
  for await (const chunk of process.stdin) text += chunk;
  return text;
}

readInput().then(text => {
  if (!text.trim()) {
    console.error("[错误] 没有输入内容。用法: node format-quote.js result.json，或通过管道传入 JSON");
    process.exitCode = 1;
    return;
  }
  let json;
  try { json = JSON.parse(text.trim()); }
  catch (e) {
    console.error("[错误] 输入不是合法 JSON: " + e.message);
    process.exitCode = 1;
    return;
  }
  if (json && json.code !== undefined && json.code !== 200) {
    console.error("[报价失败] " + (json.message || "未知错误"));
    process.exitCode = 2;
    return;
  }
  const d = (json && json.data) ? json.data : json;
  if (!d || typeof d !== "object" || d.finalPrice === undefined) {
    console.error("[错误] JSON 看起来不是报价结果（缺少 finalPrice 字段）");
    process.exitCode = 2;
    return;
  }
  printSummary(d);
}).catch(e => {
  console.error("[错误] " + (e && e.message ? e.message : String(e)));
  process.exitCode = 1;
});
