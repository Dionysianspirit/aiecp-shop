/* 智选云 AI-ECP · 视图层（商城 / 商家后台 / 运营端） */
window.Views = (function(){
  const $ = sel => document.querySelector(sel);
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const fmt = n => "￥" + (Math.round(n * 100) / 100).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  const stTag = s => ({ "待支付":"tag-warn","已支付":"tag-info","待发货":"tag-info","已发货":"tag-ok","已完成":"tag-ok","已关闭":"tag-err","退款中":"tag-err","已退款":"tag-err" }[s] || "");

  /* ==================== 首页 ==================== */
  function home(){
    const rec = App.session() ? AI.of("selection").execute(App.session().userId, { limit: 6 }) : null;
    const trees = API.Catalog.tree().data;
    let recHtml = "";
    if(rec){
      recHtml = rec.items.map(it => `
        <div class="prod-card" onclick="App.goDetail('${it.spuId}')">
          <div class="prod-thumb">${it.emoji}</div>
          <div class="prod-body">
            <div class="prod-name">${esc(it.name)}</div>
            <div class="prod-price">${fmt(it.price)}</div>
            <div class="why">✨ ${esc(it.reason)}</div>
            <div class="prod-meta"><span>${it.recallFrom.map(esc).join(" / ")}</span>${rec.fallback ? '<span class="tag tag-warn">冷启动兜底</span>' : ""}</div>
          </div>
        </div>`).join("");
    }
    return `
    <div class="hero-banner">
      <div>
        <h2>品类 JSON 自定义 · AI 能力内建</h2>
        <p>商家提交品类定义，分钟级生效，无需发版 —— 智能客服 / 智能选品 / 智能组货 三项 AI 能力随行</p>
      </div>
      <div class="row">
        <button class="btn btn-primary" onclick="App.go('#/login')">立即体验</button>
        <a class="btn btn-hero" href="#/merchant/category">商家入口</a>
      </div>
    </div>
    <div class="grid prod-grid">${recHtml}</div>
    ${rec ? `<p class="muted" style="margin-top:8px">🤖 智能选品（FR-17~20）：画像事件 ${rec.profileSummary.events} 条${rec.cold ? "，行为不足进入冷启动热门兜底（fallback）" : ""}${rec.degraded ? `；<span class="tag tag-err">已降级：${esc(rec.degradeReason)}</span>` : ""} · 刷新页面行为埋点更新后，推荐会随浏览变化</p>` : ""}
    <div class="sec-head"><h3>🧭 按品类逛</h3><a class="muted" href="#/list">全部商品 →</a></div>
    <div class="row">
      ${trees.map(t => `<a class="card card-pad" style="min-width:180px" href="#/list?cat=${t.rootId}"><b>${esc(t.rootName)}</b><div class="muted" style="font-size:12px">${Object.values(t.schemas).filter(s => s.leaf).length} 个叶子品类 · v${t.version}</div></a>`).join("")}
    </div>
    <div class="sec-head"><h3>🔥 热销好物</h3></div>
    ${prodGrid(API.Catalog.list({ sort: "sales" }).data.slice(0, 6))}
    <div class="sec-head"><h3>🆕 新品上架</h3></div>
    ${prodGrid(API.Catalog.list({ sort: "fresh" }).data.slice(0, 6))}`;
  }
  function prodGrid(list){
    if(!list.length) return `<div class="card empty"><div class="big">🛒</div>没有找到相关商品</div>`;
    return `<div class="grid prod-grid">${list.map(p => `
      <div class="prod-card" onclick="App.goDetail('${p.id}')">
        <div class="prod-thumb">${p.emoji}</div>
        <div class="prod-body">
          <div class="prod-name">${esc(p.name)}</div>
          <div class="prod-price">${fmt(p.minPrice)}<small>${p.skus[0].marketPrice > p.minPrice ? fmt(p.skus[0].marketPrice) : ""}</small></div>
          <div class="prod-meta"><span>已售 ${p.sales}</span><span>${Object.values(p.attrs)[0] ? esc(Object.entries(p.attrs).find(([k]) => k === "brand")?.[1] || "") : ""}</span></div>
        </div>
      </div>`).join("")}</div>`;
  }

  /* ==================== 列表页（动态筛选 FR-01/FR-10） ==================== */
  function list(qs){
    const params = Object.fromEntries(new URLSearchParams(qs || ""));
    const trees = API.Catalog.tree().data;
    const tree = trees.find(t => t.rootId === params.cat) || trees[0];
    let leafCode = params.leaf;
    if(!leafCode && tree){ // 默认第一个叶子
      const firstLeaf = Object.values(tree.schemas).find(s => s.leaf); leafCode = firstLeaf && firstLeaf.code;
    }
    const facets = leafCode ? API.Catalog.facets(leafCode).data : [];
    const applied = params.filters ? JSON.parse(params.filters) : {};
    const listData = API.Catalog.list({ kw: params.kw, leafCode: params.kw ? null : leafCode, rootCode: params.cat, attrFilters: applied, sort: params.sort }).data;
    const renderFilters = () => JSON.stringify(applied);
    return `
    <div class="list-layout">
      <div>
        <div class="card facet-box">
          <h4>品类树</h4>
          ${trees.map(t => `
            <div style="margin-bottom:10px">
              <b style="font-size:13.5px">${esc(t.rootName)}</b> <span class="muted" style="font-size:11px">v${t.version}</span>
              ${catTreeHtml(t.root, t.schemas, t.rootId, leafCode)}
            </div>`).join("")}
        </div>
        ${leafCode ? `<div class="card facet-box" style="margin-top:12px">
          <h4>属性筛选 <span class="muted" style="font-weight:400">（由品类 Schema 动态生成 · FR-10）</span></h4>
          ${facets.length ? facets.map(f => facetHtml(f, applied)).join("") : `<p class="muted" style="font-size:12.5px">该品类暂无 filterable 属性</p>`}
        </div>` : ""}
      </div>
      <div>
        <div class="row spread" style="margin-bottom:10px">
          <div>${listData.length} 件商品 ${params.kw ? `· 关键词「${esc(params.kw)}」` : ""}</div>
          <div class="row">
            ${[["", "综合"], ["sales", "销量"], ["priceAsc", "价格↑"], ["priceDesc", "价格↓"], ["fresh", "最新"]].map(([v, l]) =>
              `<a class="btn btn-sm ${(params.sort || "") === v ? "btn-primary" : ""}" href="#/list?${new URLSearchParams(Object.assign({}, params, { sort: v, filters: renderFilters() })).toString()}">${l}</a>`).join("")}
          </div>
        </div>
        ${prodGrid(listData)}
      </div>
    </div>`;
  }
  function catTreeHtml(node, schemas, rootId, leafCode){
    const kids = node.children || [];
    return `<div class="tree-item">
      <a class="${leafCode === node.code ? "on" : ""}" style="${leafCode === node.code ? "color:var(--primary);font-weight:600" : ""}" href="#/list?cat=${rootId}&leaf=${node.code}">${esc(node.name)}</a>${schemas[node.code] && schemas[node.code].leaf ? '<span class="leaf-chip">叶子</span>' : ""}
      ${kids.length ? `<div class="tree-kids">${kids.map(k => catTreeHtml(k, schemas, rootId, leafCode)).join("")}</div>` : ""}
    </div>`;
  }
  function facetHtml(f, applied){
    const cur = applied[f.code];
    if(f.type === "enum"){
      return `<div style="margin-bottom:10px"><b style="font-size:12.5px">${esc(f.name)}</b>
        <div class="row" style="gap:6px;margin-top:4px">
          <a class="btn btn-sm ${cur == null ? "btn-primary" : ""}" href="${facetLink(f.code, undefined)}">全部</a>
          ${f.options.map(o => `<a class="btn btn-sm ${cur === o ? "btn-primary" : ""}" href="${facetLink(f.code, o)}">${esc(o)}</a>`).join("")}
        </div></div>`;
    }
    if(f.type === "bool"){
      return `<div style="margin-bottom:10px"><b style="font-size:12.5px">${esc(f.name)}</b>
        <div class="row" style="gap:6px;margin-top:4px">
          <a class="btn btn-sm ${cur == null ? "btn-primary" : ""}" href="${facetLink(f.code, undefined)}">全部</a>
          <a class="btn btn-sm ${cur === "true" ? "btn-primary" : ""}" href="${facetLink(f.code, "true")}">是</a>
          <a class="btn btn-sm ${cur === "false" ? "btn-primary" : ""}" href="${facetLink(f.code, "false")}">否</a>
        </div></div>`;
    }
    if(f.type === "range"){
      return `<div style="margin-bottom:10px"><b style="font-size:12.5px">${esc(f.name)}${f.unit ? "（" + esc(f.unit) + "）" : ""}</b>
        <p class="muted" style="font-size:12px">合法区间 ${f.range ? f.range.join(" ~ ") : "-"}</p></div>`;
    }
    return "";
    function facetLink(code, val){
      const filters = Object.assign({}, applied);
      if(val === undefined) delete filters[code]; else filters[code] = val;
      const q = new URLSearchParams(location.hash.split("?")[1] || "");
      if(Object.keys(filters).length) q.set("filters", JSON.stringify(filters)); else q.delete("filters");
      return "#/list?" + q.toString();
    }
  }

  /* ==================== 详情页（FR-02 + 智能组货 FR-21~23） ==================== */
  function detail(spuId){
    const r = API.Catalog.detail(spuId);
    if(r.code !== 0) return `<div class="card empty"><div class="big">😕</div>${esc(r.message)}</div>`;
    const p = r.data;
    const keep = App.state.detail && App.state.detail.spu && App.state.detail.spu.id === p.id ? App.state.detail : null;
    App.state.detail = { spu: p, skuIdx: keep ? keep.skuIdx : 0, qty: keep ? keep.qty : 1 };
    const bundle = AI.of("bundle").execute(p.id);
    const schemas = findSchemas(p.categoryId);
    return `
    <div class="detail-layout">
      <div class="card prod-thumb detail-thumb">${p.emoji}</div>
      <div>
        <h1 style="font-size:20px;margin-bottom:6px">${esc(p.name)}</h1>
        <p class="muted" style="margin-bottom:10px">${esc(p.detail)}</p>
        <div class="card card-pad" style="background:#fff8f5;border-color:#ffd9c7">
          <div class="row spread">
            <div><span style="font-size:24px;color:var(--primary);font-weight:700">${fmt(p.skus[0].price)}</span>
            <small class="muted" style="text-decoration:line-through;margin-left:8px">市场价 ${fmt(p.skus[0].marketPrice)}</small></div>
            <div class="muted" style="font-size:12.5px">已售 ${p.sales} · <span class="${p.skus[0].available > 0 ? "" : "tag tag-err"}">${p.skus[0].available > 0 ? "库存 " + p.skus[0].available : "缺货"}</span></div>
          </div>
        </div>
        <div style="margin:14px 0"><b style="font-size:13px">选择规格</b>
          <div class="row" style="gap:8px;margin-top:6px">
            ${p.skus.map((k, i) => `<button class="sku-btn ${i === 0 ? "on" : ""}" onclick="App.pickSku(${i})">${esc(Object.values(k.specs).join(" / "))}　${fmt(k.price)}</button>`).join("")}
          </div>
        </div>
        <div class="row" style="margin-bottom:14px">
          <span class="muted">数量</span>
          <button class="btn btn-sm" onclick="App.setQty(-1)">−</button><b id="qty-b">1</b>
          <button class="btn btn-sm" onclick="App.setQty(1)">＋</button>
        </div>
        <div class="row">
          <button class="btn btn-primary" style="padding:10px 26px" onclick="App.addCart('${p.id}', false)">加入购物车</button>
          <button class="btn btn-err" style="padding:10px 26px" onclick="App.addCart('${p.id}', true)">立即购买</button>
        </div>
        <div style="margin-top:12px" class="muted" style="font-size:12px">🤖 智能客服已就位，右下角可随时咨询；会员积分按实付 1 元 = 1 分</div>
      </div>
    </div>
    <div class="sec-head"><h3><span class="tag tag-ai">智能组货</span> 一键搭购 · 组合更省</h3><span class="muted" style="font-size:12px">FR-21~23：可行性校验 + 组合定价 + 毛利约束${bundle.degraded ? ` · <span class="tag tag-err">已降级：${esc(bundle.degradeReason)}</span>` : ""}</span></div>
    ${bundleHtml(p, bundle)}
    <div class="sec-head"><h3>📋 商品参数（动态表单发布 · 品类 ${esc(leafName(schemas, p.categoryId))}）</h3></div>
    <div class="card card-pad">
      <table class="attr-table">
        ${Object.entries(p.attrs).map(([k, v]) => {
          const a = schemas && schemas.attrs.find(x => x.code === k);
          return `<tr><td>${esc(a ? a.name : k)}</td><td>${esc(v)}${a && a.unit ? " " + esc(a.unit) : ""}</td></tr>`;
        }).join("")}
      </table>
    </div>
    <div class="sec-head"><h3>💬 商品评价（${p.reviews.length}）</h3></div>
    <div class="card card-pad">
      ${p.reviews.length ? p.reviews.map(rv => `<div style="padding:8px 0;border-bottom:1px dashed var(--line)"><b>${esc(rv.nickname)}</b> <span style="color:#f7a500">${"★".repeat(rv.rating)}${"☆".repeat(5 - rv.rating)}</span> <span class="muted" style="font-size:12px">${rv.createdAt}</span><div>${esc(rv.content)}</div></div>`).join("") : `<p class="muted">暂无评价</p>`}
    </div>`;
  }
  function bundleHtml(p, bundle){
    if(!bundle.bundles || !bundle.bundles.length){
      return `<div class="card card-pad">${bundle.fallbackSingles && bundle.fallbackSingles.length ? `<p class="muted" style="margin-bottom:8px">暂无可行组合，为您推荐同品类单品：</p><div class="row">${bundle.fallbackSingles.map(s => `<a class="btn btn-sm" href="#/detail?id=${s.spuId}">${s.emoji} ${esc(s.name)} ${fmt(s.price)}</a>`).join("")}</div>` : `<p class="muted">暂无组货方案</p>`}</div>`;
    }
    return bundle.bundles.map((b, bi) => `
      <div class="bundle-card">
        <div class="row spread" style="margin-bottom:6px">
          <b>方案 ${bi + 1}</b>
          <div><span class="muted" style="text-decoration:line-through;margin-right:8px">${fmt(b.sumPrice)}</span>
          <b style="color:var(--primary);font-size:17px">${fmt(b.bundlePrice)}</b>
          <span class="tag tag-ok">省 ${fmt(b.save)}</span>
          ${b.accepted ? "" : `<span class="tag tag-err">毛利校验未通过 · 仅供参考</span>`}</div>
        </div>
        ${b.items.map(it => `<div class="bundle-item"><span style="font-size:22px">${it.emoji}</span><div style="flex:1">${esc(it.name)}<span class="muted" style="font-size:12px">　${esc(it.spec)}</span></div><div>${fmt(it.price)}</div></div>`).join("")}
        <div style="margin-top:8px" class="row spread">
          <span class="why">✨ ${esc(b.reason)} · 组合毛利率 ${(b.margin * 100).toFixed(1)}%</span>
          ${b.accepted ? `<button class="btn btn-primary btn-sm" onclick="App.addBundle('${p.id}', ${bi})">一键加购组合（FR-23）</button>` : ""}
        </div>
      </div>`).join("");
  }
  function findSchemas(leafCode){
    for(const t of DB.T.categories()){
      const s = CategoryEngine.materializeSchemas(t.category);
      if(s[leafCode]) return s[leafCode];
    }
    return null;
  }
  function leafName(schemas, code){ return schemas ? schemas.name : code; }

  /* ==================== 购物车 / 结算（FR-03/04） ==================== */
  function cart(){
    if(!App.session()) return App.needLogin();
    const c = API.Cart.get(App.session().userId).data;
    const coupons = DB.T.coupons();
    let total = 0;
    return `
    <h1 class="page-title">🛒 购物车</h1>
    <div class="card card-pad">
      ${c.items.length ? c.items.map((it, i) => {
        const sub = it.price * it.qty; if(it.checked !== false) total += sub;
        return `<div class="row spread" style="padding:10px 0;border-bottom:1px dashed var(--line)">
          <div class="row">
            <input type="checkbox" ${it.checked !== false ? "checked" : ""} onchange="App.cartToggle(${i}, this.checked)">
            <span style="font-size:24px">${it.emoji || "🛍️"}</span>
            <div><b>${esc(it.name)}</b> <span class="muted" style="font-size:12px">${esc(it.spec)}</span>
              ${it.source === "bundle" ? `<span class="tag tag-ai">组货组合</span>` : ""}
              <div class="muted" style="font-size:12.5px">${fmt(it.price)} × ${it.qty}</div></div>
          </div>
          <div class="row">
            <b>${fmt(sub)}</b>
            <button class="btn btn-sm" onclick="App.cartQty(${i},-1)">−</button>
            <button class="btn btn-sm" onclick="App.cartQty(${i},1)">＋</button>
            <button class="btn btn-sm btn-ghost" onclick="App.cartRemove(${i})">移除</button>
          </div>
        </div>`;
      }).join("") : `<div class="empty"><div class="big">🧺</div>购物车还是空的</div>`}
      <div class="row spread" style="margin-top:14px">
        <span>可用优惠券：${coupons.map(cp => `${esc(cp.name)}（${cp.scope}满${cp.threshold}减${cp.amount}）`).join("　")}</span>
        <div><b>合计：</b><span style="color:var(--primary);font-size:20px;font-weight:700">${fmt(total)}</span>
          <button class="btn btn-primary" style="margin-left:14px" onclick="App.goCheckout()" ${total ? "" : "disabled"}>去结算</button></div>
      </div>
    </div>`;
  }
  function checkout(){
    if(!App.session()) return App.needLogin();
    const c = API.Cart.get(App.session().userId).data;
    const items = c.items.filter(i => i.checked !== false);
    if(!items.length) return `<div class="card empty">请先在购物车勾选商品</div>`;
    const amount = items.reduce((s, i) => s + i.price * i.qty, 0);
    const u = DB.T.users().find(x => x.id === App.session().userId);
    const coupons = DB.T.coupons().filter(cp => amount >= cp.threshold);
    App.state.checkout = { items, amount };
    return `
    <h1 class="page-title">📝 确认订单</h1>
    <div class="card card-pad" style="margin-bottom:14px">
      <b>收货地址</b>
      <div class="form-item" style="margin-top:8px">
        <div class="row">
          <input id="ck-name" style="flex:1;border:1px solid #d6dae1;border-radius:8px;padding:8px 10px" placeholder="收件人" value="${u.address ? esc(u.address.name) : ""}">
          <input id="ck-phone" style="flex:1;border:1px solid #d6dae1;border-radius:8px;padding:8px 10px" placeholder="手机号" value="${u.address ? esc(u.address.phone) : ""}">
        </div>
        <input id="ck-detail" style="width:100%;border:1px solid #d6dae1;border-radius:8px;padding:8px 10px;margin-top:8px" placeholder="详细地址" value="${u.address ? esc(u.address.detail) : ""}">
      </div>
    </div>
    <div class="card card-pad" style="margin-bottom:14px">
      <b>商品清单</b>
      ${items.map(i => `<div class="row spread" style="padding:7px 0;border-bottom:1px dashed var(--line)"><span>${i.emoji || "🛍️"} ${esc(i.name)} <span class="muted" style="font-size:12px">${esc(i.spec)} × ${i.qty}</span></span><b>${fmt(i.price * i.qty)}</b></div>`).join("")}
      <div class="form-item" style="margin-top:12px">
        <label>优惠券</label>
        <select id="ck-coupon" style="width:100%;border:1px solid #d6dae1;border-radius:8px;padding:8px 10px">
          <option value="">不使用优惠券</option>
          ${coupons.map(cp => `<option value="${cp.id}">${esc(cp.name)}（${esc(cp.scope)}满${cp.threshold}减${cp.amount}）</option>`).join("")}
        </select>
      </div>
    </div>
    <div class="card card-pad row spread">
      <span>商品金额 <b>${fmt(amount)}</b>，优惠在提交时按券规则核销</span>
      <button class="btn btn-primary" style="padding:10px 30px" onclick="App.submitOrder()">提交订单（锁定库存）</button>
    </div>`;
  }

  /* ==================== 我的订单（FR-05/06 + 状态机） ==================== */
  function orders(){
    if(!App.session()) return App.needLogin();
    const list = API.Order.listMine(App.session().userId).data;
    const STEP = { "待支付": 0, "已支付": 1, "待发货": 2, "已发货": 3, "已完成": 4 };
    return `
    <h1 class="page-title">📦 我的订单</h1>
    ${list.length ? list.map(o => `
      <div class="card card-pad" style="margin-bottom:12px">
        <div class="row spread">
          <div><b class="mono">${o.id}</b> <span class="tag ${stTag(o.status)}">${o.status}</span> <span class="muted" style="font-size:12px">${o.createdAt}</span></div>
          <b>实付 <span style="color:var(--primary)">${fmt(o.payable)}</span>${o.discount ? ` <span class="muted" style="font-size:12px">(已省${fmt(o.discount)}${o.couponName ? "·" + esc(o.couponName) : ""})</span>` : ""}</b>
        </div>
        ${["待支付","已支付","待发货","已发货","已完成"].includes(o.status) ? stateSteps(o.status) : ""}
        ${o.items.map(it => `<div class="row spread" style="padding:6px 0"><span>${it.emoji || "🛍️"} ${esc(it.name)} <span class="muted" style="font-size:12px">${esc(it.spec)} × ${it.qty}${it.source === "bundle" ? "　<span class='tag tag-ai'>组货</span>" : ""}</span></span><span>${fmt(it.price * it.qty)}</span></div>`).join("")}
        <div class="row spread" style="margin-top:8px">
          <span class="muted" style="font-size:12px">${o.address.name}　${o.address.phone}　${esc(o.address.detail)}</span>
          <span class="row">
            ${o.status === "待支付" ? `<button class="btn btn-primary btn-sm" onclick="App.payOrder('${o.id}')">去支付</button><button class="btn btn-sm" onclick="App.cancelOrder('${o.id}')">取消订单</button>` : ""}
            ${o.status === "已发货" ? `<button class="btn btn-primary btn-sm" onclick="App.confirmOrder('${o.id}')">确认收货</button>` : ""}
            ${["已支付","待发货","已发货"].includes(o.status) ? `<button class="btn btn-sm" onclick="App.refundOrder('${o.id}')">申请退款</button>` : ""}
            <button class="btn btn-sm btn-ghost" onclick="App.showOrder('${o.id}')">详情</button>
          </span>
        </div>
      </div>`).join("") : `<div class="card empty"><div class="big">📦</div>还没有订单，去首页逛逛吧</div>`}`;
  }
  function stateSteps(cur){
    const steps = ["待支付", "已支付", "待发货", "已发货", "已完成"];
    const idx = steps.indexOf(cur);
    return `<div class="state-steps">${steps.map((s, i) => `
      <div class="state-step ${i <= idx ? "done" : ""} ${i < steps.length - 1 ? "" : ""}">
        <span class="dot">${i <= idx ? "✓" : i + 1}</span><span class="lb">${s}</span>
      </div>${i < steps.length - 1 ? `<div style="width:26px;height:1px;background:#e3e6ec"></div>` : ""}`).join("")}</div>`;
  }

  /* ==================== 登录 / 注册 ==================== */
  function login(){
    return `
    <div class="auth-wrap">
      <div class="auth-hero">
        <h2>智选云 AI 电商在线售货系统</h2>
        <p>AI-ECP V1.0 · 课程演示实现</p>
        <ul>
          <li><b>品类 JSON 自定义</b>：12 条校验规则全量反馈，动态表单与检索索引分钟级生效</li>
          <li><b>智能客服</b>：意图分流 + 知识检索 + 受控工具调用，置信度不足自动建议转人工</li>
          <li><b>智能选品</b>：多路召回 → 精排 → 规则过滤 → 多样性重排 → 冷启动兜底</li>
          <li><b>智能组货</b>：大模型给理由，业务算账 —— 库存/价格/毛利四维校验后才可售</li>
          <li><b>降级契约</b>：运营端可关闭模型网关，AI 全线降级不阻断交易（NFR-07）</li>
        </ul>
      </div>
      <div class="auth-form">
        <div class="auth-tabs"><a id="tab-login" class="on" onclick="App.authTab('login')">登录</a><a id="tab-reg" onclick="App.authTab('reg')">注册</a></div>
        <div id="form-login">
          <div class="form-item"><label>用户名</label><input id="li-u" type="text" placeholder="admin / shop001 / buyer001"></div>
          <div class="form-item"><label>密码</label><input id="li-p" type="password" placeholder="对应密码" onkeydown="if(event.key==='Enter')App.doLogin()"></div>
          <button class="btn btn-primary" style="width:100%;padding:10px" onclick="App.doLogin()">登 录</button>
          <div class="demo-accounts">
            <b>演示账号（点击自动填充）</b>
            <div class="acc"><span>👑 平台管理员 admin / admin123</span><button class="btn btn-sm" onclick="App.fill('admin','admin123')">填充</button></div>
            <div class="acc"><span>🏪 商家 shop001 / 123456</span><button class="btn btn-sm" onclick="App.fill('shop001','123456')">填充</button></div>
            <div class="acc"><span>🛍️ 消费者 buyer001 / 123456</span><button class="btn btn-sm" onclick="App.fill('buyer001','123456')">填充</button></div>
          </div>
        </div>
        <div id="form-reg" hidden>
          <div class="form-item"><label>用户名（≥4 位）</label><input id="rg-u" type="text"></div>
          <div class="form-item"><label>昵称</label><input id="rg-n" type="text"></div>
          <div class="form-item"><label>密码（≥6 位）</label><input id="rg-p" type="password"></div>
          <button class="btn btn-primary" style="width:100%;padding:10px" onclick="App.doRegister()">注册并登录（消费者）</button>
        </div>
      </div>
    </div>`;
  }

  /* ==================== 商家后台 ==================== */
  const M_NAV = [["overview","📊 经营总览"],["category","🧩 品类 JSON 导入"],["tree","🗂 品类树与版本"],["publish","📦 商品发布（动态表单）"],["goods","🛍 商品与库存"],["morders","🚚 订单履约"]];
  function merchant(nav, body){
    return `<div class="console">
      <div class="card console-side">${M_NAV.map(([k, l]) => `<a href="#/merchant/${k}" class="${nav === k ? "on" : ""}">${l}</a>`).join("")}<hr style="border:none;border-top:1px solid var(--line);margin:8px 0"><a href="#/">→ 返回商城</a></div>
      <div>${body}</div>
    </div>`;
  }
  function mOverview(){
    const u = App.user();
    const mine = DB.T.products().filter(p => p.merchantId === u.id);
    const orders = DB.T.orders();
    const paid = orders.filter(o => ["已支付","待发货","已发货","已完成","退款中","已退款"].includes(o.status));
    return `<h1 class="page-title">📊 经营总览</h1>
    <div class="grid stat-grid">
      <div class="card stat"><div class="l">在售商品</div><div class="v">${mine.filter(p => p.status === "on").length}</div></div>
      <div class="card stat"><div class="l">累计销量</div><div class="v">${mine.reduce((s, p) => s + p.skus.reduce((x, k) => x + (k.sales || 0), 0), 0)}</div></div>
      <div class="card stat"><div class="l">已成交订单</div><div class="v">${paid.length}</div></div>
      <div class="card stat"><div class="l">待发货</div><div class="v">${orders.filter(o => o.status === "待发货").length}</div></div>
    </div>
    <div class="card card-pad" style="margin-top:14px">
      <b>低库存预警（FR-12）</b>
      <table class="table" style="margin-top:8px">${mine.flatMap(p => p.skus.map(k => ({ p, k }))).filter(({ k }) => k.stock.total - k.stock.locked < 10)
        .map(({ p, k }) => `<tr><td>${p.emoji} ${esc(p.name)}</td><td>${esc(Object.values(k.specs).join("/"))}</td><td class="num"><span class="tag ${k.stock.total - k.stock.locked < 5 ? "tag-err" : "tag-warn"}">可用 ${k.stock.total - k.stock.locked}</span></td></tr>`).join("") || '<tr><td class="muted">库存充足</td></tr>'}</table>
    </div>`;
  }
  function mCategory(){
    const sample = JSON.stringify(SEED.categoryTree, null, 2);
    return `<h1 class="page-title">🧩 品类 JSON 导入（FR-07~10）</h1>
    <p class="muted" style="margin-bottom:10px">粘贴或编辑品类定义 JSON → 「校验（dry-run）」全量反馈错误且无副作用 → 「正式导入」走五步链路：语法校验 → 结构语义校验 → 品类树构建 → 衍生能力生成 → 落库发布</p>
    <div class="card card-pad">
      <div class="row spread" style="margin-bottom:8px">
        <div class="row"><button class="btn btn-sm" onclick="App.loadSample()">载入示例模板</button><span class="muted" style="font-size:12px">V-01~V-12 校验 · 一次反馈全部错误</span></div>
        <div class="row"><button class="btn" onclick="App.catValidate()">🔍 校验（dry-run）</button><button class="btn btn-primary" onclick="App.catImport()">🚀 正式导入</button></div>
      </div>
      <textarea id="cat-json" class="mono" style="width:100%;height:340px;border:1px solid #d6dae1;border-radius:10px;padding:12px;font-size:12.5px;outline:none">${esc(sample)}</textarea>
      <div id="cat-result" style="margin-top:12px"></div>
    </div>`;
  }
  function mTree(){
    const cats = DB.T.categories();
    return `<h1 class="page-title">🗂 品类树与版本（NFR-12 可回滚）</h1>
    ${cats.map(t => `
      <div class="card card-pad" style="margin-bottom:12px">
        <div class="row spread"><b>${esc(t.category.name)} <span class="mono muted" style="font-size:12px">${t.category.code}</span></b>
        <div class="row"><span class="tag tag-info">当前 v${t.version}</span>
        ${t.versions && t.versions.length ? `<button class="btn btn-sm" onclick="App.rollback('${t.category.code}')">回滚到 v${t.versions[t.versions.length - 1].version}</button>` : ""}</div></div>
        ${treeDom(t.category)}
      </div>`).join("")}`;
  }
  function treeDom(node){
    return `<div class="tree-item">▪ ${esc(node.name)} <span class="mono muted" style="font-size:11px">${node.code}</span>${node.attributes && node.attributes.length ? `<span class="muted" style="font-size:11px">　属性：${node.attributes.map(a => esc(a.name)).join("、")}</span>` : ""}
      ${(node.children || []).length ? `<div class="tree-kids">${node.children.map(treeDom).join("")}</div>` : '<span class="leaf-chip">叶子·可挂商品</span>'}</div>`;
  }
  function mPublish(qs){
    const params = Object.fromEntries(new URLSearchParams(qs || ""));
    const trees = API.Catalog.tree().data;
    const leaves = [];
    trees.forEach(t => (function walk(n){ if(!n.children){ leaves.push({ tree: t.rootId, code: n.code, name: t.rootName + " / " + n.name }); } else n.children.forEach(walk); })(t.root));
    const sel = params.leaf || (leaves[0] && leaves[0].code);
    let formHtml = `<p class="muted">没有可用的叶子品类，请先在「品类 JSON 导入」中创建</p>`;
    if(sel){
      const schemas = findSchemas(sel);
      const fields = CategoryEngine.generateFormSchema(schemas).map(f => App.renderField(f, "pf-attr-" + f.code));
      formHtml = `
      <div class="row spread">
        <div class="form-item" style="min-width:320px"><label>目标叶子品类 <span class="req">*</span></label>
          <select id="pf-cat" onchange="location.hash='#/merchant/publish?leaf='+this.value">
            ${leaves.map(l => `<option value="${l.code}" ${l.code === sel ? "selected" : ""}>${esc(l.name)}</option>`).join("")}
          </select><div class="hint">表单由该品类的属性 Schema 动态渲染 —— 新增品类无需开发页面（FR-09）</div></div>
        <div class="row"><input id="pf-emoji" style="width:64px;text-align:center;border:1px solid #d6dae1;border-radius:8px;padding:8px" value="🛍️" title="商品图标 emoji"><input id="pf-name" style="width:280px;border:1px solid #d6dae1;border-radius:8px;padding:8px" placeholder="商品名称 *"></div>
      </div>
      ${fields.join("")}
      <div class="form-item"><label>商品详情</label><textarea id="pf-detail" rows="2" style="width:100%;border:1px solid #d6dae1;border-radius:8px;padding:8px 10px"></textarea></div>
      <b style="font-size:13.5px">SKU（价格 / 市场价 / 成本 / 库存）</b>
      <div id="pf-skus"></div>
      <button class="btn btn-sm" onclick="App.addSkuRow()">＋ 添加 SKU</button>
      <div class="row" style="margin-top:14px"><button class="btn btn-primary" onclick="App.publishProduct('${sel}')">发布商品</button><span class="muted" style="font-size:12px">校验：BR-02 仅叶子可挂商品 · BR-05 售价 ≤ 市场价 · required 属性必填</span></div>`;
    }
    return `<h1 class="page-title">📦 商品发布（动态表单 FR-09）</h1><div class="card card-pad">${formHtml}</div>`;
  }
  function mGoods(){
    const u = App.user();
    const mine = API.Catalog.merchantProducts(u.id).data;
    return `<h1 class="page-title">🛍 商品与库存（FR-11/12）</h1>
    <div class="card card-pad">
      <table class="table">
        <tr><th>商品</th><th>品类</th><th>SKU</th><th class="num">售价</th><th class="num">总/锁/可用</th><th>状态</th><th>操作</th></tr>
        ${mine.map(p => p.skus.map((k, i) => `<tr>
          ${i === 0 ? `<td rowspan="${p.skus.length}">${p.emoji} ${esc(p.name)}</td><td rowspan="${p.skus.length}"><span class="mono" style="font-size:11px">${p.categoryId}</span></td>` : ""}
          <td>${esc(Object.values(k.specs).join(" / "))}</td>
          <td class="num">${fmt(k.price)}</td>
          <td class="num">${k.stock.total} / ${k.stock.locked} / ${k.stock.total - k.stock.locked}</td>
          ${i === 0 ? `<td rowspan="${p.skus.length}"><span class="tag ${p.status === "on" ? "tag-ok" : "tag-err"}">${p.status === "on" ? "在售" : "已下架"}</span></td>
          <td rowspan="${p.skus.length}"><button class="btn btn-sm" onclick="App.toggleShelf('${p.id}')">${p.status === "on" ? "下架" : "上架"}</button></td>` : ""}
        </tr>`).join("")).join("")}
      </table>
    </div>
    <h1 class="page-title" style="margin-top:18px;font-size:16px">📜 库存流水（最近 10 条）</h1>
    <div class="card card-pad"><table class="table">${DB.T.inventoryLogs().slice(0, 10).map(l => `<tr><td class="mono">${l.skuId}</td><td>${l.action}</td><td class="num">${l.qty}</td><td class="muted">${esc(l.note)}</td><td class="muted">${l.at}</td></tr>`).join("") || '<tr><td class="muted">暂无流水</td></tr>'}</table></div>`;
  }
  function mOrders(){
    const orders = DB.T.orders();
    const pending = orders.filter(o => ["已支付", "待发货", "退款中"].includes(o.status));
    const done = orders.filter(o => !["已支付", "待发货", "退款中"].includes(o.status));
    const row = o => `<tr>
      <td class="mono">${o.id}</td><td>${esc(o.userId)}</td>
      <td>${o.items.map(it => `${it.emoji || "🛍️"}${esc(it.name)}×${it.qty}`).join("<br>")}</td>
      <td class="num">${fmt(o.payable)}</td>
      <td><span class="tag ${stTag(o.status)}">${o.status}</span></td>
      <td>
        ${o.status === "已支付" ? `<button class="btn btn-sm btn-primary" onclick="App.mConfirmPaid('${o.id}')">确认订单</button>` : ""}
        ${o.status === "待发货" ? `<button class="btn btn-sm btn-primary" onclick="App.mShip('${o.id}')">发货录单</button>` : ""}
        ${o.status === "退款中" ? `<button class="btn btn-sm btn-ok" onclick="App.mRefund('${o.id}', true)">同意退款</button><button class="btn btn-sm btn-err" onclick="App.mRefund('${o.id}', false)">驳回</button>` : ""}
        ${o.trackingNo ? `<span class="muted mono" style="font-size:11px">${o.trackingNo}</span>` : ""}
      </td></tr>`;
    return `<h1 class="page-title">🚚 订单履约（BR-07 状态机守卫）</h1>
    <div class="card card-pad" style="margin-bottom:14px"><b>待处理</b><table class="table" style="margin-top:8px">
      <tr><th>订单号</th><th>买家</th><th>明细</th><th class="num">实付</th><th>状态</th><th>操作</th></tr>
      ${pending.map(row).join("") || '<tr><td colspan="6" class="muted">暂无待处理订单</td></tr>'}</table></div>
    <div class="card card-pad"><b>已处理</b><table class="table" style="margin-top:8px">
      <tr><th>订单号</th><th>买家</th><th>明细</th><th class="num">实付</th><th>状态</th><th></th></tr>
      ${done.map(row).join("") || '<tr><td colspan="6" class="muted">暂无</td></tr>'}</table></div>`;
  }

  /* ==================== 运营端（平台管理员） ==================== */
  const A_NAV = [["dashboard","📈 平台看板"],["users","👥 用户与权限"],["acats","🗂 全平台品类"],["ai","🤖 AI 中台治理"],["audit","🧾 AI 调用审计"]];
  function admin(nav, body){
    return `<div class="console">
      <div class="card console-side">${A_NAV.map(([k, l]) => `<a href="#/console/${k}" class="${nav === k ? "on" : ""}">${l}</a>`).join("")}<hr style="border:none;border-top:1px solid var(--line);margin:8px 0"><a href="#/">→ 返回商城</a></div>
      <div>${body}</div>
    </div>`;
  }
  function aDashboard(){
    const s = API.Console.stats().data;
    return `<h1 class="page-title">📈 平台看板（FR-25）</h1>
    <div class="grid stat-grid">
      <div class="card stat"><div class="l">消费者</div><div class="v">${s.userCount}</div></div>
      <div class="card stat"><div class="l">在售商品</div><div class="v">${s.productCount}</div></div>
      <div class="card stat"><div class="l">订单数</div><div class="v">${s.orderCount}</div></div>
      <div class="card stat"><div class="l">GMV（模拟）</div><div class="v">${fmt(s.gmv)}</div></div>
      <div class="card stat"><div class="l">AI 调用</div><div class="v">${s.aiCalls}</div><div class="l">其中降级 ${s.aiDegraded} 次</div></div>
      <div class="card stat"><div class="l">品类树</div><div class="v">${s.catTrees}</div></div>
    </div>
    <div class="row" style="margin-top:14px;align-items:stretch">
      <div class="card card-pad" style="flex:1;min-width:300px"><b>热销 TOP5</b>
        ${s.topProducts.map((p, i) => `<div class="row spread" style="padding:6px 0;border-bottom:1px dashed var(--line)"><span>${i + 1}. ${p.emoji} ${esc(p.name)}</span><b>${p.sales}</b></div>`).join("")}</div>
      <div class="card card-pad" style="flex:1;min-width:300px"><b>订单状态分布</b>
        ${s.stateDist.map(x => `<div class="row spread" style="padding:6px 0;border-bottom:1px dashed var(--line)"><span><span class="tag ${stTag(x.state)}">${x.state}</span></span><b>${x.n}</b></div>`).join("") || '<p class="muted">暂无订单</p>'}</div>
    </div>`;
  }
  function aUsers(){
    const us = API.Console.users().data;
    return `<h1 class="page-title">👥 用户与权限（FR-26：角色三级）</h1>
    <div class="card card-pad"><table class="table"><tr><th>ID</th><th>用户名</th><th>昵称</th><th>角色</th><th>注册时间</th></tr>
    ${us.map(u => `<tr><td class="mono">${u.id}</td><td class="mono">${esc(u.username)}</td><td>${esc(u.nickname)}</td><td><span class="tag ${u.role === "admin" ? "tag-err" : u.role === "merchant" ? "tag-info" : "tag-ok"}">${({admin:"平台管理员",merchant:"商家",consumer:"消费者"})[u.role]}</span></td><td class="muted">${u.createdAt || "-"}</td></tr>`).join("")}</table></div>`;
  }
  function aCats(){
    const cats = DB.T.categories();
    return `<h1 class="page-title">🗂 全平台品类治理</h1>
    ${cats.map(t => `<div class="card card-pad" style="margin-bottom:12px">
      <div class="row spread"><b>${esc(t.category.name)}</b><span class="tag tag-info">v${t.version} · 商家 ${esc(t.merchantId)}</span></div>
      ${treeDom(t.category)}</div>`).join("")}`;
  }
  function aAI(){
    const cfg = DB.T.config();
    return `<h1 class="page-title">🤖 AI 中台治理（FR-27 / NFR-07）</h1>
    <div class="card card-pad" style="margin-bottom:14px">
      <div class="row spread">
        <div><b>大模型网关</b><div class="muted" style="font-size:12.5px">主模型 ${esc(cfg.modelRoute.primary)} · 备用 ${esc(cfg.modelRoute.backup)} · ${esc(cfg.modelRoute.strategy)}</div>
        <div class="hint" style="font-size:12px;color:var(--muted)">关闭后三项 AI 能力全部降级为规则策略（响应携带 degraded/degradeReason），交易主流程不受影响 —— 可现场演示降级契约</div></div>
        <button class="btn ${cfg.llmGateway === "on" ? "btn-err" : "btn-ok"}" onclick="App.toggleGateway()">${cfg.llmGateway === "on" ? "⛔ 关闭网关（触发降级）" : "✅ 开启网关（恢复在线）"}</button>
      </div>
    </div>
    <div class="card card-pad" style="margin-bottom:14px"><b>提示词模板（版本管理）</b>
      ${cfg.promptTemplates.map(p => `<div style="padding:8px 0;border-bottom:1px dashed var(--line)"><span class="tag tag-ai">${esc(p.scene)} ${esc(p.version)}</span><div style="font-size:13px;margin-top:4px">${esc(p.text)}</div></div>`).join("")}
    </div>
    <div class="card card-pad"><b>知识库片段（客服 RAG 语料，FR-27）</b>
      <table class="table" style="margin-top:8px"><tr><th>主题</th><th>内容</th></tr>
      ${DB.T.knowledge().map(k => `<tr><td><span class="tag">${esc(k.topic)}</span></td><td style="font-size:13px">${esc(k.text)}</td></tr>`).join("")}</table>
    </div>`;
  }
  function aAudit(){
    const logs = API.Console.aiLogs().data;
    const behs = API.Console.behaviors().data;
    return `<h1 class="page-title">🧾 AI 调用审计与行为埋点（FR-20 / NFR-14）</h1>
    <div class="card card-pad" style="margin-bottom:14px"><b>AI 调用记录（最近 30 条）</b>
    <table class="table" style="margin-top:8px"><tr><th>时间</th><th>能力场景</th><th class="num">耗时</th><th>降级</th><th class="num">置信度</th></tr>
    ${logs.slice(0, 30).map(l => `<tr><td class="muted">${l.at}</td><td>${({ "customer-service":"智能客服", "selection":"智能选品", "bundle":"智能组货" })[l.scene] || l.scene}</td><td class="num">${l.ms} ms</td><td>${l.degraded ? '<span class="tag tag-err">降级</span>' : (l.blocked ? '<span class="tag tag-warn">护栏拦截</span>' : '<span class="tag tag-ok">正常</span>')}</td><td class="num">${l.confidence ?? "-"}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">暂无调用</td></tr>'}</table></div>
    <div class="card card-pad"><b>行为埋点（画像与推荐样本回流，最近 20 条）</b>
    <table class="table" style="margin-top:8px"><tr><th>时间</th><th>用户</th><th>行为</th><th>SPU</th><th>品类</th></tr>
    ${behs.slice(-20).reverse().map(b => `<tr><td class="muted">${b.at}</td><td class="mono">${esc(b.userId)}</td><td>${({expose:"曝光",click:"点击",cart:"加购",order:"下单"})[b.type] || b.type}</td><td class="mono">${esc(b.spuId || "")}</td><td class="mono" style="font-size:11px">${esc(b.catId || "")}</td></tr>`).join("") || '<tr><td colspan="5" class="muted">暂无埋点</td></tr>'}</table></div>`;
  }

  return { home, list, detail, cart, checkout, orders, login,
    merchant, mOverview, mCategory, mTree, mPublish, mGoods, mOrders,
    admin, aDashboard, aUsers, aCats, aAI, aAudit,
    prodGrid, findSchemas, stTag, esc, fmt };
})();
