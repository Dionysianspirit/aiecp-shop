/* 智选云 AI-ECP · AI 能力中台（FR-13~23 / NFR-06~07 / BR-09~14 / 表17 降级契约）
   模板方法 AiCapability.execute()：输入护栏 → 上下文装配 → buildPrompt → 生成 → postProcess → 输出护栏 → 审计。
   本站为静态演示：ILlmGateway 以"本地规则推理"模拟；控制台关闭模型网关即触发降级，验证降级链路。 */
window.AI = (function(){
  const DEGRADE_OFF = { degraded: true, degradeReason: "大模型网关已由平台管理员关闭（NFR-07），能力自动降级为规则策略" };

  /* ============ 安全护栏（NFR-10） ============ */
  const SENSITIVE_OUT = [/保证最优惠/, /全网最低/, /假一赔十/, /点击链接领取/];
  const INJECT_PATS = [/忽略(之前|以上)的/, /(system|系统)提示词/, /扮演(DAN|系统)/i, /越权|提权/];
  function guardInput(q){
    for(const p of INJECT_PATS) if(p.test(q)) return { pass: false, reason: "输入触发提示注入防护（NFR-10）" };
    return { pass: true };
  }
  function guardOutput(text){
    let out = text, hit = [];
    SENSITIVE_OUT.forEach(p => { if(p.test(out)){ hit.push(p.source); out = out.replace(p, "（该表述违反广告法与护栏规则，已过滤）"); } });
    return { text: out, hit };
  }
  const moneyFmt = n => "￥" + n.toFixed(2).replace(/\.00$/, "");

  /* ============ 能力一：智能客服（FR-13~16，意图分流：知识 RAG / 业务工具） ============ */
  const INTENT_PATS = [
    { intent: "order.query",   pats: ["订单", "我的订单", "发货了吗", "到哪了", "退回"], tool: "queryOrder" },
    { intent: "logistics.query", pats: ["物流", "快递", "运单", "配送", "多久到", "发货"], tool: "queryLogistics" },
    { intent: "refund.apply",  pats: ["退款", "退货", "换货", "售后"], tool: null },
    { intent: "stock.query",   pats: ["有货", "库存", "缺货", "补货"], tool: "queryStock" },
    { intent: "pay.help",      pats: ["支付", "付款", "发票"], tool: null },
    { intent: "member.help",   pats: ["积分", "会员", "优惠券"], tool: null }
  ];
  function retrieveKnowledge(q, topK){
    // 关键词覆盖打分的轻量检索（演示 IVectorSearch 契约：返回带得分的片段）
    // 分词：标点切分 + 二元词组（应对整句式问法，如"退货政策是什么"能命中"退货"）
    const tokens = new Set();
    q.split(/[，。,.!？?、\s]+/).forEach(w => {
      if(w.length >= 2) tokens.add(w);
      for(let i = 0; i < w.length - 1; i++){ const g = w.slice(i, i + 2); if(!/^(什么|怎么|如何|哪里|多少)$/.test(g)) tokens.add(g); }
    });
    const kws = [...tokens];
    const scored = DB.T.knowledge().map(k => {
      let score = 0; kws.forEach(w => { if(k.text.includes(w)) score += w.length >= 3 ? 2 : 1; if(k.topic && q.includes(k.topic)) score += 1; });
      return Object.assign({ score, why: score ? `命中关键词且主题为「${k.topic}」` : "" }, k);
    }).filter(k => k.score > 0).sort((a, b) => b.score - a.score).slice(0, topK || 3);
    return scored;
  }
  function toolQueryOrder(userId, q){
    const orders = DB.T.orders().filter(o => o.userId === userId).sort((a,b) => b.createdAt.localeCompare(a.createdAt));
    const no = /(SO|so)\d+/.exec(q);
    const hit = no ? orders.filter(o => o.id.toUpperCase() === no[0].toUpperCase()) : orders;
    return { tool: "queryOrder", ok: true, data: hit.slice(0, 3).map(o => ({ id: o.id, status: o.status, payable: o.payable, createdAt: o.createdAt, trackingNo: o.trackingNo || null })) };
  }
  function toolQueryLogistics(userId, q){
    const r = toolQueryOrder(userId, q);
    if(!r.data.length) return { tool: "queryLogistics", ok: false, data: null, reason: "未查询到您的订单" };
    const o = r.data[0];
    if(!o.trackingNo) return { tool: "queryLogistics", ok: true, data: { id: o.id, status: o.status, msg: "订单尚未发货，发货后可在订单详情页查看轨迹" } };
    return { tool: "queryLogistics", ok: true, data: { id: o.id, carrier: "顺丰速运", no: o.trackingNo, status: o.status, msg: "包裹正在派送途中，东北及偏远地区时效 3-5 天" } };
  }
  function toolQueryStock(q){
    const prods = DB.T.products();
    const hit = prods.filter(p => q.includes(p.name.slice(0, 4)) || p.name.includes(q.replace(/.*(有货|库存|缺货|吗|？|\?)/g, "").trim()));
    if(!hit.length) return { tool: "queryStock", ok: false, data: null, reason: "未定位到商品，请给出更完整的商品名称" };
    const p = hit[0];
    const avail = p.skus.reduce((s, k) => s + (k.stock.total - k.stock.locked), 0);
    return { tool: "queryStock", ok: true, data: { name: p.name, available: avail, onShelf: p.status === "on" } };
  }

  const CustomerService = {
    scene: "customer-service",
    buildPrompt(q, ctx){ return { user: q, knowledge: ctx.knowledge, tools: ctx.toolCalls }; },
    postProcess(res){ return res; },
    execute(q, session){
      const t0 = performance.now();
      const g = guardInput(q); if(!g.pass) return { degraded: false, blocked: true, reply: "抱歉，您的输入触发了安全护栏，请调整后重试。", confidence: 1, audit: { ms: 0 } };
      const cfg = DB.T.config();
      const history = session && session.history ? session.history.slice(-10) : [];   // BR-14 保留最近 10 轮
      // 意图分流
      let intent = "knowledge.qa", toolCall = null, confidence = 0.3;
      for(const it of INTENT_PATS){ const hit = it.pats.filter(w => q.includes(w)).length; if(hit){ intent = it.intent; confidence = Math.min(0.9, 0.5 + hit * 0.18); toolCall = it.tool; break; } }
      // 业务意图 → 受控工具调用
      let toolRes = null;
      if(toolCall && App.session()){
        toolRes = toolCall === "queryOrder" ? toolQueryOrder(App.session().userId, q)
               : toolCall === "queryLogistics" ? toolQueryLogistics(App.session().userId, q)
               : toolQueryStock(q);
      }
      // 知识检索
      const kn = retrieveKnowledge(q, 3);
      if(intent === "knowledge.qa" && kn.length) confidence = Math.max(confidence, Math.min(0.88, 0.45 + kn[0].score * 0.14));
      // 生成答复（模拟网关；关闭时降级为纯检索匹配）
      let reply, degraded = false, degradeReason = null;
      if(cfg.llmGateway !== "on"){
        degraded = true; Object.assign({ }, DEGRADE_OFF); degradeReason = DEGRADE_OFF.degradeReason;
        reply = kn.length ? `【检索模式】为您找到以下参考：\n${kn.map(k => "· " + k.text).join("\n")}`
                          : "【检索模式】知识库中未找到匹配内容，建议您联系人工客服。";
      } else if(toolRes && toolRes.ok){
        reply = formatToolReply(intent, toolRes);
      } else if(toolRes && !toolRes.ok){
        reply = toolRes.reason || "业务系统暂无法查询该信息。";
      } else if(kn.length){
        reply = kn.map(k => k.text).join("\n");
      } else {
        reply = "很抱歉，遍览知识库未有所获。您可以直接描述订单号或商品名称，我会调用业务工具为您查询；也可以点击下方按钮转接人工客服。";
        confidence = Math.min(confidence, 0.3);
      }
      const guarded = guardOutput(reply);
      const transfer = confidence < cfg.aiThresholds.csConfidence ? { transferToAgent: true, summary: `用户咨询：${q}；建议人工跟进` } : null;
      const result = { degraded, degradeReason, reply: guarded.text, intent, confidence: +confidence.toFixed(2),
        citations: kn.map(k => ({ id: k.id, topic: k.topic, snippet: k.text.slice(0, 38) + "…" })), toolResult: toolRes, transfer };
      audit("customer-service", t0, result);
      return result;
    }
  };
  function formatToolReply(intent, r){
    if(intent === "order.query" && r.data.length){
      return "为您查询到最近的订单：\n" + r.data.map(o => `· ${o.id}　状态：${o.status}　实付：${moneyFmt(o.payable)}${o.trackingNo ? "　运单：" + o.trackingNo : ""}`).join("\n") + "\n金额与状态均来自订单系统实时返回。";
    }
    if(intent === "logistics.query") return `【${r.data.carrier || "物流"}】${r.data.no ? "运单号 " + r.data.no + "：" : ""}${r.data.msg}`;
    if(intent === "stock.query") return `「${r.data.name}」${r.data.onShelf ? "在售中" : "已下架"}，当前可用库存 ${r.data.available} 件。`;
    return "已为您查询业务系统。";
  }

  /* ============ 能力二：智能选品（FR-17~20，画像→多路召回→精排→规则过滤→多样性重排→兜底） ============ */
  function buildProfile(userId){
    const behs = DB.T.behaviors().filter(b => b.userId === userId);
    const catScore = {}, skuScore = {};
    const W = { expose: 0.2, click: 1, cart: 2, order: 3 };
    behs.forEach(b => {
      const w = W[b.type] || 0;
      if(b.catId) catScore[b.catId] = (catScore[b.catId] || 0) + w;
      if(b.spuId) skuScore[b.spuId] = (skuScore[b.spuId] || 0) + w;
    });
    return { userId, catScore, skuScore, eventCount: behs.length };
  }
  const Selection = {
    scene: "selection",
    execute(userId, opts){
      const t0 = performance.now();
      opts = opts || {};
      const cfg = DB.T.config();
      const prods = DB.T.products().filter(p => p.status === "on");
      const sellable = p => p.skus.some(k => k.stock.total - k.stock.locked > 0);          // BR-09
      const pool = prods.filter(sellable);
      const profile = buildProfile(userId);
      const cold = profile.eventCount < 3;
      const degraded = cfg.llmGateway !== "on";
      // 多路召回（演示并行）
      const routes = { behavior: [], semantic: [], hot: [], fresh: [] };
      pool.forEach(p => {
        // 行为协同：画像品类分 + 同品类内其他商品
        if(!cold && profile.catScore[p.categoryId]) routes.behavior.push({ p, s: profile.catScore[p.categoryId] });
        // 语义：画像已购/点击商品与候选的品类重合 + 名称关键词重合
        if(!cold){
          const bought = DB.T.products().filter(x => profile.skuScore[x.id]);
          let ov = 0; bought.forEach(b => { if(b.categoryId === p.categoryId) ov += 2; b.attrs.brand && b.attrs.brand === p.attrs.brand && (ov += 1); });
          if(ov) routes.semantic.push({ p, s: ov });
        }
        routes.hot.push({ p, s: p.skus.reduce((x, k) => x + (k.sales || 0), 0) });
        if(p.createdAt >= "2026-09-01") routes.fresh.push({ p, s: p.skus.reduce((x, k) => x + (k.sales || 0), 0) });
      });
      // 精排（多路加权）
      const norm = arr => { const max = Math.max(1, ...arr.map(x => x.s)); return new Map(arr.map(x => [x.p.id, x.s / max])); };
      const nb = norm(routes.behavior), ns = norm(routes.semantic), nh = norm(routes.hot);
      let ranked = pool.map(p => {
        const s = 0.5 * (nb.get(p.id) || 0) + 0.3 * (ns.get(p.id) || 0) + 0.2 * (nh.get(p.id) || 0);
        const from = [];
        if(nb.get(p.id)) from.push("行为协同");
        if(ns.get(p.id)) from.push("语义匹配");
        if((nh.get(p.id) || 0) > 0.25) from.push("热销榜");
        return { p, score: s, from: from.length ? from : ["热销榜"], price: Math.min(...p.skus.map(k => k.price)) };
      });
      // 业务规则过滤 + 同品类打散（BR-09/10：同一叶子品类 ≤ 50%）
      const cap = Math.max(1, Math.ceil((opts.limit || 6) * cfg.aiThresholds.diversityCatCap));
      ranked.sort((a, b) => b.score - a.score);
      const out = [], catCount = {};
      for(const it of ranked){
        const c = catCount[it.p.categoryId] || 0;
        if(c >= cap) continue;
        catCount[it.p.categoryId] = c + 1; out.push(it);
        if(out.length >= (opts.limit || 6)) break;
      }
      const fallback = out.length === 0;
      const items = (fallback ? ranked.slice(0, opts.limit || 6) : out).map(it => ({
        spuId: it.p.id, name: it.p.name, emoji: it.p.emoji, price: it.price,
        score: +it.score.toFixed(3), recallFrom: it.from, fallback,
        reason: it.from.includes("行为协同") ? "根据您近期的浏览偏好推荐" : it.from.includes("语义匹配") ? "与您关注过的商品相似" : "商城热销，口碑之选"
      }));
      const result = { degraded, degradeReason: degraded ? DEGRADE_OFF.degradeReason : null, cold, fallback,
        profileSummary: { events: profile.eventCount, topCat: Object.keys(profile.catScore).sort((a,b) => profile.catScore[b] - profile.catScore[a])[0] || null }, items };
      audit("selection", t0, result);
      return result;
    }
  };

  /* ============ 能力三：智能组货（FR-21~23，可行性校验 + 组合定价 + 毛利约束） ============ */
  const Bundle = {
    scene: "bundle",
    execute(mainSpuId){
      const t0 = performance.now();
      const cfg = DB.T.config();
      const prods = DB.T.products();
      const main = prods.find(p => p.id === mainSpuId);
      if(!main) return { degraded: false, error: "主商品不存在" };
      const rules = DB.T.assocRules().filter(r => r.mainCat === main.categoryId).sort((a, b) => b.lift - a.lift);
      const availSku = p => p.status === "on" && p.skus.some(k => k.stock.total - k.stock.locked > 0);
      const marginOf = k => (k.price - k.cost) / k.price;
      const mainSku = main.skus[0];
      const mainMargin = marginOf(mainSku);
      // 候选：关联规则命中品类 → 同场景 → 同一级品类兜底
      const candCats = rules.map(r => r.subCat);
      const cands = [];
      candCats.forEach(c => prods.filter(p => p.categoryId === c && p.id !== main.id && availSku(p)).forEach(p => cands.push({ p, via: rules.find(r => r.subCat === c), lift: rules.find(r => r.subCat === c).lift })));
      if(!cands.length) prods.filter(p => p.id !== main.id && availSku(p) && p.categoryId.startsWith(main.categoryId.split("_").slice(0, 2).join("_"))).forEach(p => cands.push({ p, via: null, lift: 0 }));
      // 组合生成与可行性校验（BR-11/12：≥2 SKU、全部可售、毛利达标）
      const bundles = [];
      for(const c of cands.slice(0, 4)){
        const subSku = c.p.skus[0];
        const sum = mainSku.price + subSku.price;
        const cost = mainSku.cost + subSku.cost;
        // 组合定价（FR-22）：在 95 折与毛利约束（BR-12：组合毛利率 ≥ 主商品单品毛利率）之间取高者
        const floorPrice = cost / (1 - mainMargin);                       // 保住主商品单品毛利率的最低组合价
        let bundlePrice = Math.max(Math.round(sum * 0.95 * 100) / 100, Math.ceil(floorPrice * 100) / 100);
        if(bundlePrice >= sum){                                           // 无让利空间则不生成组合方案
          continue;
        }
        const margin = (bundlePrice - cost) / bundlePrice;
        const marginOK = margin >= mainMargin - 1e-9;
        const reason = `搭配「${c.p.name}」（${c.via ? `关联规则 lift=${c.via.lift}，场景：${c.via.scene}` : "同场景互补"}），组合毛利率 ${(margin * 100).toFixed(1)}% ≥ 单品 ${(mainMargin * 100).toFixed(1)}%`;
        const feasible = availSku(main) && availSku(c.p);   // 库存与上架校验
        bundles.push({ items: [ { spuId: main.id, name: main.name, emoji: main.emoji, spec: Object.values(mainSku.specs)[0], price: mainSku.price, skuId: mainSku.id },
                                 { spuId: c.p.id, name: c.p.name, emoji: c.p.emoji, spec: Object.values(subSku.specs)[0], price: subSku.price, skuId: subSku.id } ],
          sumPrice: sum, bundlePrice, save: Math.round((sum - bundlePrice) * 100) / 100, margin: +margin.toFixed(3), marginOK, feasible, reason,
          accepted: feasible && marginOK });
      }
      const accepted = bundles.filter(b => b.accepted);
      const degraded = cfg.llmGateway !== "on" || accepted.length === 0;
      const degradeReason = cfg.llmGateway !== "on" ? DEGRADE_OFF.degradeReason : (accepted.length === 0 ? "无可行组合（毛利约束 BR-12 或可售性 BR-11 不满足），降级为同品类单品推荐" : null);
      const result = { degraded, degradeReason, mainSpuId,
        bundles: (accepted.length ? accepted : bundles).slice(0, 3).map(b => ({ items: b.items, sumPrice: b.sumPrice, bundlePrice: b.bundlePrice, save: b.save, reason: b.reason, margin: b.margin, accepted: b.accepted })),
        fallbackSingles: accepted.length === 0 ? prods.filter(p => p.id !== main.id && availSku(p) && p.categoryId === main.categoryId).slice(0, 4).map(p => ({ spuId: p.id, name: p.name, emoji: p.emoji, price: Math.min(...p.skus.map(k => k.price)) })) : [] };
      audit("bundle", t0, result);
      return result;
    }
  };

  /* 能力工厂（AiCapabilityFactory） */
  const REG = { "customer-service": CustomerService, "selection": Selection, "bundle": Bundle };
  function of(scene){ return REG[scene] || null; }
  function audit(scene, t0, result){
    const logs = DB.T.aiLogs();
    logs.unshift({ scene, at: DB.now(), ms: Math.round(performance.now() - t0),
      degraded: !!result.degraded, blocked: !!result.blocked, confidence: result.confidence || null });
    DB.save("aiLogs", logs.slice(0, 200));
  }
  return { of, guardInput, guardOutput, retrieveKnowledge, buildProfile };
})();
