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
  // 画册按「页 × 本」计价，量词与盒型不同；P 数与装订不写进报价单，客户看不出这价是怎么来的
  const isBrochure = d.pageCount !== undefined || d.productType === "brochure";
  spec += " | 数量 " + p.quantity + (isBrochure ? " 本" : "");
  if (d.billQty && d.billQty !== p.quantity) spec += " (按 " + d.billQty + " 计价)";
  line(spec);
  if (isBrochure) {
    line("规格 " + (d.pageCount || "?") + "P"
      + (d.bindingName ? " · " + d.bindingName : "")
      + (d.sizeDesc ? " · " + d.sizeDesc : ""));
    if (d.coverPaper) line("封面纸 " + d.coverPaper);
    if (d.innerPaper) line("内页纸 " + d.innerPaper);
  }
  if (p.material) line("材质 " + p.material);
  else if (d.estimate && d.estimate.assumedMaterial) line("材质 未指定（按 " + d.estimate.assumedMaterial + " 估算）");
  if (d.crafts && d.crafts.length) line("工艺 " + d.crafts.join("、"));
  if (d.innerCrafts && d.innerCrafts.length) line("内页工艺 " + d.innerCrafts.join("、"));
  line("------------------------------------------");
  line("★ 最终报价 " + money(d.finalPrice) + " (单价 " + money(d.finalUnitPrice) + ")");
  // 未绑定账号的 Key 拿到的是取整参考价（服务端 2026-09-11 起附带 quoteNote 声明）。
  // 报价单是要发给客户的东西，参考价印成上面这个格式就会被当成可对账的成品价 —— 所以声明必须紧跟着价格。
  if (d.quoteNote) line("! " + d.quoteNote);
  // 小批量未提覆膜时服务端已按常规哑膜收过覆膜费（defaultLaminated），复述成"无覆膜"会与客户对不上
  if (d.defaultLaminated && !(d.crafts || []).some(c => /膜/.test(c))) line("工艺 含常规覆膜（哑膜）");
  // 服务端把这类工艺收在 estimate.unbilledCrafts（2026-09-09 起），不写就等于让它看着像免费。
  if (d.estimate && d.estimate.unbilledCrafts && d.estimate.unbilledCrafts.length) {
    line("! 以上报价未包含: " + d.estimate.unbilledCrafts.join("、") + "（线上无价档，需人工核价）");
  }
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
