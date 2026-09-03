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
  const p = d.params || {};
  line("==========================================");
  line("【印懿报价】" + (d.boxName || "") + (d.boxCode ? " (" + d.boxCode + ")" : ""));
  let spec = "尺寸 " + p.L + " cm";
  if (p.W) spec += " x " + p.W + " cm";
  if (p.H) spec += " x " + p.H + " cm";
  spec += " | 数量 " + p.quantity;
  if (d.billQty && d.billQty !== p.quantity) spec += " (按 " + d.billQty + " 计价)";
  line(spec);
  if (p.material) line("材质 " + p.material);
  if (d.crafts && d.crafts.length) line("工艺 " + d.crafts.join("、"));
  const n = d.nesting;
  if (n && n.plate) line("拼版 " + n.plate + " 幅面，每版 " + n.piecesPerSheet + " 个，用 " + n.sheetsNeeded + " 张" + (n.orientation === "rotated" ? "（旋转拼）" : ""));
  const b = d.breakdown || {};
  line("------------------------------------------");
  if (b.materialCost) {
    const mc = b.materialCost.total != null ? b.materialCost.total : b.materialCost.cost;
    line("材料费     " + money(mc));
  }
  if (b.printCost) {
    const pc = b.printCost.total != null ? b.printCost.total : b.printCost.cost;
    let desc = "";
    if (b.printCost.mode === "digital") desc = " (数码印刷 " + (b.printCost.printPath || "") + ")";
    else if (b.printCost.printType) desc = " (" + b.printCost.printType + (b.printCost.plate ? " " + b.printCost.plate : "") + (b.printCost.plateFee ? "，版费 " + b.printCost.plateFee : "") + ")";
    line("印刷费     " + money(pc) + desc);
  }
  if (b.surfaceCost && b.surfaceCost.total > 0) {
    const det = Object.keys(b.surfaceCost.details || {}).map(k => k + " " + money(b.surfaceCost.details[k])).join("、");
    line("表面工艺   " + money(b.surfaceCost.total) + (det ? " (" + det + ")" : ""));
  }
  if (b.formingCost && b.formingCost.total > 0) {
    const names = { dieCutFee: "模切", creaseCost: "压痕", glueCost: "粘盒", digitalFormingFee: "数码成型" };
    const det = Object.keys(b.formingCost.details || {}).map(k => (names[k] || k) + " " + money(b.formingCost.details[k])).join("、");
    line("成型费     " + money(b.formingCost.total) + (det ? " (" + det + ")" : ""));
  }
  line("------------------------------------------");
  line("成本合计   " + money(d.totalCost) + " (单件成本 " + money(d.unitCost) + ")");
  line("利润系数   " + (d.profitRate != null ? Number(d.profitRate).toFixed(2) : "-") + (d.isSmallBatch ? " [小批量数码印刷]" : ""));
  line("★ 最终报价 " + money(d.finalPrice) + " (单价 " + money(d.finalUnitPrice) + ")");
  line("==========================================");
  line("注: 报价为系统估算价，正式订单价以人工确认为准。");
  line("");
  line(d.contact || "报价/下单咨询请联系：15990159967");
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
  if (!d || typeof d !== "object" || !d.breakdown) {
    console.error("[错误] JSON 看起来不是报价结果（缺少 breakdown 字段）");
    process.exitCode = 2;
    return;
  }
  printSummary(d);
}).catch(e => {
  console.error("[错误] " + (e && e.message ? e.message : String(e)));
  process.exitCode = 1;
});
