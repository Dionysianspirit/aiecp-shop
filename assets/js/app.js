/* 智选云 AI-ECP · 路由与会话（FR-26 统一鉴权 / NFR-08 会话令牌） */
window.App = (function(){
  const $ = sel => document.querySelector(sel);
  const esc = Views.esc;
  const state = { detail: null, checkout: null, chat: { open: false, history: [], session: "CS" + Date.now() } };

  /* ---------- 会话 ---------- */
  function session(){
    const token = localStorage.getItem(DB.NS + "token");
    if(!token) return null;
    const s = DB.T.sessions().find(x => x.token === token);
    return s || null;
  }
  function user(){ const s = session(); return s ? API.Auth.byToken(s.token) : null; }
  function needLogin(){ toast("请先登录", "err"); return Views.login(); }

  /* ---------- 路由 ---------- */
  const routes = [
    [/^#?\/?$/, () => Views.home()],
    [/^#\/login$/, () => Views.login()],
    [/^#\/list\??(.*)$/, m => Views.list(m[1] || "")],
    [/^#\/detail\?id=([\w-]+)/, m => Views.detail(m[1])],
    [/^#\/cart$/, () => Views.cart()],
    [/^#\/checkout$/, () => Views.checkout()],
    [/^#\/orders$/, () => Views.orders()],
    [/^#\/merchant\/(\w+)\??(.*)$/, m => merchantRoute(m[1], m[2])],
    [/^#\/console\/(\w+)\??(.*)$/, m => consoleRoute(m[1], m[2])]
  ];
  function merchantRoute(nav, qs){
    if(!session()) return Views.login();
    if(user().role !== "merchant") return deny();
    const map = { overview: Views.mOverview, category: Views.mCategory, tree: Views.mTree,
      publish: () => Views.mPublish(qs), goods: Views.mGoods, morders: Views.mOrders };
    return Views.merchant(nav, (map[nav] || Views.mOverview)());
  }
  function consoleRoute(nav){
    if(!session()) return Views.login();
    if(user().role !== "admin") return deny();
    const map = { dashboard: Views.aDashboard, users: Views.aUsers, acats: Views.aCats, ai: Views.aAI, audit: Views.aAudit };
    return Views.admin(nav, (map[nav] || Views.aDashboard)());
  }
  function deny(){ return `<div class="card empty"><div class="big">🔒</div>权限不足：该页面需要对应角色（FR-26 角色权限控制）<div style="margin-top:10px"><a class="btn btn-primary" href="#/login">切换账号</a></div></div>`; }
  function render(){
    const hash = location.hash || "#/";
    const view = $("#view");
    for(const [re, fn] of routes){ const m = re.exec(hash); if(m){ view.innerHTML = fn(m); break; } }
    renderTop(); renderCatNav(); bindChat();
    renderSkuRowsPublish();
    window.scrollTo(0, 0);
  }
  function go(h){ location.hash = h; }
  function goDetail(id){ go("#/detail?id=" + id); }
  function globalSearch(){ const kw = $("#global-kw").value.trim(); go("#/list?" + (kw ? "kw=" + encodeURIComponent(kw) : "")); }
  window.addEventListener("hashchange", render);

  /* ---------- 顶栏 / 品类导航 ---------- */
  function renderTop(){
    const s = session(), u = user();
    const cartN = s ? (DB.T.carts().find(c => c.userId === s.userId) || { items: [] }).items.length : 0;
    $("#top-actions").innerHTML = s ? `
      <a class="btn btn-ghost rel" href="#/cart">🛒 购物车${cartN ? `<span class="badge">${cartN}</span>` : ""}</a>
      <a class="btn btn-ghost" href="#/orders">📦 我的订单</a>
      ${u.role === "merchant" ? `<a class="btn btn-ghost" href="#/merchant/overview">🏪 商家后台</a>` : ""}
      ${u.role === "admin" ? `<a class="btn btn-ghost" href="#/console/dashboard">🛠 运营端</a>` : ""}
      <span class="muted" style="margin:0 4px">你好，${esc(u.nickname)}</span>
      <button class="btn btn-sm" onclick="App.logout()">退出</button>`
      : `<a class="btn btn-primary" href="#/login">登录 / 注册</a>`;
  }
  function renderCatNav(){
    const t = API.Catalog.tree().data;
    $("#cat-nav").innerHTML = `<div class="cat-nav-inner"><a href="#/" class="${(location.hash || "#/") === "#/" ? "on" : ""}">首页</a>
      ${t.map(x => `<a href="#/list?cat=${x.rootId}">${esc(x.rootName)}</a>`).join("")}
      <a href="#/list">全部商品</a></div>`;
  }

  /* ---------- 登录 ---------- */
  function doLogin(){
    const u = $("#li-u").value.trim(), p = $("#li-p").value;
    const r = API.Auth.login(u, p);
    if(r.code !== 0) return toast(r.message, "err");
    localStorage.setItem(DB.NS + "token", r.data.token);
    toast("欢迎回来，" + r.data.user.nickname, "ok"); go("#/");
  }
  function doRegister(){
    const r = API.Auth.register({ username: $("#rg-u").value.trim(), nickname: $("#rg-n").value.trim(), password: $("#rg-p").value });
    if(r.code !== 0) return toast(r.message, "err");
    localStorage.setItem(DB.NS + "token", r.data.token);
    toast("注册成功", "ok"); go("#/");
  }
  function logout(){ API.Auth.logout(localStorage.getItem(DB.NS + "token")); localStorage.removeItem(DB.NS + "token"); state.chat.history = []; go("#/"); render(); }
  function authTab(t){ $("#tab-login").classList.toggle("on", t === "login"); $("#tab-reg").classList.toggle("on", t === "reg"); $("#form-login").hidden = t !== "login"; $("#form-reg").hidden = t !== "reg"; }
  function fill(u, p){ $("#li-u").value = u; $("#li-p").value = p; $("#li-p").focus(); }

  /* ---------- 详情交互 ---------- */
  function pickSku(i){ state.detail.skuIdx = i; go(location.hash); }
  function setQty(d){ state.detail.qty = Math.max(1, state.detail.qty + d); $("#qty-b").textContent = state.detail.qty; }
  function curSku(){ const d = state.detail; return d.spu.skus[d.skuIdx]; }
  function addCart(spuId, buyNow){
    if(!session()) { go("#/login"); return toast("请先登录", "err"); }
    const d = state.detail, k = curSku();
    if(k.available < d.qty) return toast("库存不足", "err");
    const p = DB.T.products().find(x => x.id === spuId);
    logBehavior("cart", spuId, k.id, p.categoryId);
    API.Cart.add(session().userId, { skuId: k.id, spuId, name: d.spu.name, emoji: d.spu.emoji, spec: Object.values(k.specs).join(" / "), price: k.price, qty: d.qty, source: "single", checked: true });
    toast(buyNow ? "已加入，去结算" : "已加入购物车", "ok");
    if(buyNow) go("#/checkout"); else { render(); }
  }
  function addBundle(spuId, bi){
    if(!session()) { go("#/login"); return toast("请先登录", "err"); }
    const bundle = AI.of("bundle").execute(spuId);
    const b = bundle.bundles[bi]; if(!b || !b.accepted) return toast("该组合不可售", "err");
    const carts = DB.T.carts(); let cart = carts.find(c => c.userId === session().userId);
    if(!cart){ cart = { userId: session().userId, items: [] }; carts.push(cart); }
    const bid = "B" + Date.now();
    // 按组合价比例分摊到各 SKU（FR-22 组合定价 → FR-23 整单加入并保留组合标识归因）
    const factor = b.bundlePrice / b.sumPrice;
    let acc = 0;
    b.items.forEach((it, i) => {
      let price;
      if(i === b.items.length - 1){ price = Math.round((b.bundlePrice - acc) * 100) / 100; }  // 尾差归末位，保证合计恰为组合价
      else { price = Math.round(it.price * factor * 100) / 100; acc += price; }
      cart.items.push({ skuId: it.skuId, spuId: it.spuId, name: it.name, emoji: it.emoji, spec: it.spec, price, qty: 1, source: "bundle", bundleId: bid, checked: true });
    });
    DB.save("carts", carts);
    logBehavior("cart", spuId, b.items[0].skuId, DB.T.products().find(x => x.id === spuId).categoryId);
    toast("组合已按组合价一键加购（FR-23）", "ok");
    go("#/cart");
  }
  function logBehavior(type, spuId, skuId, catId){
    if(!session()) return;
    const behs = DB.T.behaviors();
    behs.push({ userId: session().userId, type, spuId, skuId, catId, at: DB.now() });
    DB.save("behaviors", behs.slice(-500));
  }

  /* ---------- 购物车 / 订单 ---------- */
  function cartToggle(i, c){ API.Cart.toggle(session().userId, i, c); render(); }
  function cartQty(i, d){ const it = API.Cart.get(session().userId).data.items[i]; API.Cart.updateQty(session().userId, i, it.qty + d); render(); }
  function cartRemove(i){ API.Cart.updateQty(session().userId, i, 0); render(); }
  function goCheckout(){ go("#/checkout"); }
  function submitOrder(){
    const c = API.Cart.get(session().userId).data;
    const items = c.items.filter(i => i.checked !== false).map(i => ({ spuId: i.spuId, skuId: i.skuId, qty: i.qty, source: i.source, bundleId: i.bundleId, price: i.price }));
    const addr = { name: $("#ck-name").value.trim(), phone: $("#ck-phone").value.trim(), detail: $("#ck-detail").value.trim() };
    if(!addr.name || !addr.phone || !addr.detail) return toast("请完整填写收货信息", "err");
    API.Auth.updateAddress(session().userId, addr);
    const r = API.Order.create(session().userId, { items, address: addr, couponId: $("#ck-coupon").value || null });
    if(r.code !== 0) return toast(r.message + (r.data && r.data.errors ? "" : ""), "err");
    API.Cart.removeChecked(session().userId);
    toast("订单已创建，库存已锁定（BR-06）", "ok");
    payModal(r.data.id, r.data.payable);
  }
  function payModal(orderId, payable){
    modal(`<h3>💳 模拟支付网关</h3>
      <p>订单 <b class="mono">${orderId}</b>　应付 <b style="color:var(--primary);font-size:20px">${Views.fmt(payable)}</b></p>
      <p class="muted" style="margin:10px 0">对应设计：支付回调验签 + 幂等（BR-08）；15 分钟超时未支付自动关单并释放库存。</p>
      <div class="row"><button class="btn btn-primary" style="flex:1;padding:10px" onclick="App.payOk('${orderId}')">✅ 支付成功</button>
      <button class="btn" style="flex:1" onclick="App.closeModal();App.go('#/orders')">稍后支付</button></div>`);
  }
  function payOk(id){
    const r = API.Order.pay(id, session().userId);
    closeModal();
    if(r.code !== 0) return toast(r.message, "err");
    toast("支付成功，订单进入已支付", "ok"); go("#/orders"); render();
  }
  function payOrder(id){ payModal(id, DB.T.orders().find(o => o.id === id).payable); }
  function cancelOrder(id){ const r = API.Order.cancel(id, session().userId); toast(r.code === 0 ? "订单已关闭，锁定库存已释放" : r.message, r.code === 0 ? "ok" : "err"); render(); }
  function confirmOrder(id){ const r = API.Order.confirm(id, session().userId); toast(r.code === 0 ? "确认收货完成" : r.message, r.code === 0 ? "ok" : "err"); render(); }
  function refundOrder(id){ const r = API.Order.refund(id, session().userId); toast(r.code === 0 ? "退款申请已提交" : r.message, r.code === 0 ? "ok" : "err"); render(); }
  function showOrder(id){
    const o = DB.T.orders().find(x => x.id === id);
    modal(`<h3>订单详情 <span class="mono" style="font-size:14px">${o.id}</span></h3>
      <div class="state-steps">${["待支付","已支付","待发货","已发货","已完成"].map(s => "").join("")}</div>
      <b>流转轨迹</b>
      <div class="code-box" style="margin:8px 0">${o.timeline.map(t => "· " + t).join("\n")}</div>
      ${o.trackingNo ? `<p>运单号：<span class="mono">${o.trackingNo}</span>（顺丰速运，演示轨迹）</p>` : ""}`);
  }

  /* ---------- 商家操作 ---------- */
  function mConfirmPaid(id){ const r = API.Order.confirmPaid(id, user().id); toast(r.code === 0 ? "已确认，进入待发货" : r.message, r.code === 0 ? "ok" : "err"); render(); }
  function mShip(id){
    modal(`<h3>🚚 发货录单 ${id}</h3>
      <div class="form-item"><label>运单号（状态机守卫：非空）</label><input id="ship-no" value=""></div>
      <button class="btn btn-primary" style="width:100%" onclick="App.doShip('${id}')">确认发货</button>`);
    $("#ship-no").value = "SF" + Math.floor(Math.random() * 1e10);
  }
  function doShip(id){ const r = API.Order.ship(id, user().id, $("#ship-no").value.trim()); closeModal(); toast(r.code === 0 ? "已发货" : r.message, r.code === 0 ? "ok" : "err"); render(); }
  function mRefund(id, ok){ const r = API.Order.handleRefund(id, user().id, ok); toast(r.code === 0 ? (ok ? "已同意退款" : "已驳回") : r.message, r.code === 0 ? "ok" : "err"); render(); }

  /* ---------- 品类导入 ---------- */
  function loadSample(){ $("#cat-json").value = JSON.stringify(SEED.categoryTree, null, 2); toast("已载入示例模板"); }
  function catValidate(){
    const r = API.CategoryAdmin.validate($("#cat-json").value);
    $("#cat-result").innerHTML = catResultHtml(r.data, true);
  }
  function catImport(){
    const r = API.CategoryAdmin.import_($("#cat-json").value, user());
    if(r.code !== 0){
      $("#cat-result").innerHTML = `<div class="err-item" style="margin-bottom:10px"><b>HTTP ${r.code}</b>${esc(r.message)}</div>` + catResultHtml({ ok: false, errors: r.data.errors, warnings: r.data.warnings }, false);
      return toast("导入失败：见错误清单", "err");
    }
    const d = r.data;
    $("#cat-result").innerHTML = `<div class="ok-item"><b>导入成功</b>　品类树 ${esc(d.rootCode)} · 版本 v${d.version} · 生成 ${d.generated.nodeCount} 节点 / ${d.generated.attrCount} 属性 / ${d.generated.indexFields} 索引字段 / ${d.generated.leafCount} 叶子品类
      ${(d.warnings || []).length ? `<div style="margin-top:6px">${d.warnings.map(w => `<span class="tag tag-warn">警告</span>${esc(w.path)}：${esc(w.detail)}`).join("<br>")}</div>` : ""}
      <div style="margin-top:8px">→ 现在<a href="#/merchant/publish?leaf=${Object.keys(viewLeaves(d.rootCode))[0] || ""}" style="color:var(--primary)">去「商品发布」用动态表单上架商品</a></div></div>`;
    toast("品类发布成功，衍生能力已生成（五步链路完成）", "ok");
    renderCatNav();
  }
  function viewLeaves(rootCode){
    const t = DB.T.categories().find(x => x.category.code === rootCode);
    const out = [];
    if(t) (function walk(n){ if(!n.children) out.push(n.code); else n.children.forEach(walk); })(t.category);
    return out;
  }
  function catResultHtml(d, withPreview){
    let html = "";
    if(d.errors && d.errors.length){
      html += `<p style="margin-bottom:8px"><b>校验未通过（${d.errors.length} 项错误 · 全量反馈一次返回）</b></p>`;
      html += d.errors.map(e => `<div class="err-item"><b>${e.rule}</b><span class="mono">${esc(e.path)}</span><br>${esc(e.detail)}</div>`).join("");
    } else if(d.ok){
      html += `<div class="ok-item"><b>✅ 校验通过</b>　未发现 V-01~V-12 违规</div>`;
    }
    if(d.warnings && d.warnings.length){
      html += d.warnings.map(w => `<div class="err-item" style="background:#fdf7ec;border-color:#f0dcb4"><b>WARN</b><span class="mono">${esc(w.path)}</span><br>${esc(w.detail)}</div>`).join("");
    }
    if(withPreview && d.ok && d.generated){
      const g = d.generated;
      const firstLeaf = Object.keys(g.formSchemas)[0];
      html += `<div class="sec-head" style="margin:14px 0 8px"><h3 style="font-size:15px">衍生能力预览（dry-run 无副作用）</h3></div>
      <div class="row" style="margin-bottom:8px"><span class="tag tag-info">${g.nodeCount} 节点</span><span class="tag tag-info">${g.leafCount} 叶子</span><span class="tag tag-info">${g.attrCount} 属性</span><span class="tag tag-info">${g.indexFields} 索引字段</span></div>
      <div class="code-box" style="max-height:220px">DynamicFormSchema（示例：${firstLeaf}）\n${esc(JSON.stringify(g.formSchemas[firstLeaf], null, 1))}\n\nIndexMapping（示例）\n${esc(JSON.stringify(g.indexMappings[firstLeaf], null, 1))}</div>`;
    }
    return html || "";
  }
  function rollback(code){
    const r = API.CategoryAdmin.rollback(code, user());
    toast(r.code === 0 ? `已回滚，新版本 v${r.data.version}` : r.message, r.code === 0 ? "ok" : "err"); render();
  }

  /* ---------- 商品发布（动态表单） ---------- */
  function renderField(f, id){
    const req = f.required ? '<span class="req">*</span>' : "";
    let ctl = "";
    if(f.control === "select"){
      ctl = `<select id="${id}">${f.multiple ? "" : '<option value="">请选择</option>'}${(f.options || []).map(o => `<option>${esc(o)}</option>`).join("")}</select>${f.multiple ? '<div class="hint">多值枚举：按住 Ctrl 多选</div>' : ""}`;
      if(f.multiple) ctl = `<select id="${id}" multiple size="${Math.min(4, (f.options || []).length)}">${(f.options || []).map(o => `<option>${esc(o)}</option>`).join("")}</select>`;
    }
    else if(f.control === "switch") ctl = `<label style="display:flex;gap:6px;align-items:center;font-weight:400"><input type="checkbox" id="${id}"> 是</label>`;
    else if(f.control === "number") ctl = `<input type="number" id="${id}" ${f.min != null ? `min="${f.min}" max="${f.max}"` : ""} placeholder="${f.min != null ? f.min + " ~ " + f.max : ""}">`;
    else if(f.control === "date") ctl = `<input type="date" id="${id}">`;
    else if(f.control === "textarea") ctl = `<textarea id="${id}" rows="2"></textarea>`;
    else ctl = `<input type="text" id="${id}">`;
    return `<div class="form-item"><label>${esc(f.name)}${req}${f.unit ? `（${esc(f.unit)}）` : ""}</label>${ctl}</div>`;
  }
  window.App_renderField = renderField;
  let skuRows = 1;
  function addSkuRow(){
    skuRows++;
    $("#pf-skus").insertAdjacentHTML("beforeend", skuRowHtml(skuRows - 1));
  }
  function skuRowHtml(i){
    return `<div class="row" style="margin-top:8px" data-sku-row="${i}">
      <input class="sk-spec" style="width:140px;border:1px solid #d6dae1;border-radius:8px;padding:8px" placeholder="规格，如 颜色:红">
      <input class="sk-price" type="number" style="width:110px;border:1px solid #d6dae1;border-radius:8px;padding:8px" placeholder="售价*">
      <input class="sk-market" type="number" style="width:110px;border:1px solid #d6dae1;border-radius:8px;padding:8px" placeholder="市场价">
      <input class="sk-cost" type="number" style="width:110px;border:1px solid #d6dae1;border-radius:8px;padding:8px" placeholder="成本价*">
      <input class="sk-stock" type="number" style="width:110px;border:1px solid #d6dae1;border-radius:8px;padding:8px" placeholder="库存*" value="100">
    </div>`;
  }
  function renderSkuRowsPublish(){
    const box = $("#pf-skus");
    if(box && !box.children.length) box.innerHTML = skuRowHtml(0);
  }
  function publishProduct(cat){
    const schemas = Views.findSchemas(cat);
    const form = { categoryId: cat, name: $("#pf-name").value.trim(), emoji: $("#pf-emoji").value.trim() || "🛍️", detail: $("#pf-detail").value.trim(), attrs: {}, skus: [] };
    schemas.attrs.forEach(a => {
      const el = $("#pf-attr-" + a.code);
      if(!el) return;
      if(el.type === "checkbox") form.attrs[a.code] = el.checked;
      else if(el.multiple) form.attrs[a.code] = Array.from(el.selectedOptions).map(o => o.value);
      else if((a.dataType === "integer" || a.dataType === "decimal") && el.value !== "") form.attrs[a.code] = Number(el.value);
      else form.attrs[a.code] = el.value;
    });
    document.querySelectorAll("[data-sku-row]").forEach(row => {
      const spec = row.querySelector(".sk-spec").value.trim() || "默认";
      const price = Number(row.querySelector(".sk-price").value), market = Number(row.querySelector(".sk-market").value), cost = Number(row.querySelector(".sk-cost").value), stockTotal = Number(row.querySelector(".sk-stock").value) || 0;
      if(!price) return;
      const specs = {}; spec.split(/[,，;；]/).forEach(kv => { const [k, ...v] = kv.split(":"); if(v.length) specs[k.trim()] = v.join(":").trim(); else specs["规格"] = kv.trim(); });
      form.skus.push({ specs, price, marketPrice: market || price * 1.25, cost, stockTotal });
    });
    const r = API.Catalog.saveProduct(form, user());
    if(r.code !== 0) return toast(r.message, "err");
    toast("商品发布成功（动态表单完成 FR-09/11）", "ok");
    go("#/goods");
  }
  function toggleShelf(id){ const r = API.Catalog.toggleShelf(id, user()); toast(r.code === 0 ? "已切换上下架" : r.message, r.code === 0 ? "ok" : "err"); render(); }

  /* ---------- 运营端 ---------- */
  function toggleGateway(){
    const cfg = DB.T.config();
    API.Console.setGateway(cfg.llmGateway !== "on");
    toast(cfg.llmGateway === "on" ? "网关已开启，AI 恢复在线" : "网关已关闭：三项 AI 能力降级为规则策略（NFR-07）", "ok");
    render();
  }

  /* ---------- 智能客服（悬浮窗） ---------- */
  function bindChat(){
    const old = $(".chat-fab"); if(old) old.remove();
    const oldp = $(".chat-panel"); if(oldp) oldp.remove();
    const fab = document.createElement("div"); fab.className = "chat-fab"; fab.textContent = "🤖"; fab.title = "智能客服（FR-13~16）"; fab.onclick = toggleChat;
    document.body.appendChild(fab);
    if(state.chat.open){ document.body.appendChild(chatPanelEl()); }
  }
  function toggleChat(){ state.chat.open = !state.chat.open; if(state.chat.open) document.body.appendChild(chatPanelEl()); else { const p = $(".chat-panel"); if(p) p.remove(); } }
  function chatPanelEl(){
    const p = document.createElement("div"); p.className = "chat-panel";
    p.innerHTML = `
      <div class="chat-head"><div><b>小智 · 智能客服</b><div class="muted">意图分流 · 知识 RAG · 受控工具调用</div></div><button class="btn btn-sm btn-ghost" style="color:#fff" onclick="App.toggleChat()">✕</button></div>
      <div class="chat-body" id="chat-body"></div>
      <div class="chat-input"><input id="chat-in" placeholder="试试：我的订单到哪了 / 退货政策 / Air3 有货吗" onkeydown="if(event.key==='Enter')App.chatSend()"><button class="btn btn-primary" onclick="App.chatSend()">发送</button></div>
      <div class="chat-foot" id="chat-foot">响应携带 intent / confidence / citations / degraded 字段（表17 降级契约）</div>`;
    const body = p.querySelector("#chat-body");
    state.chat.history.forEach(m => body.appendChild(msgEl(m)));
    if(!state.chat.history.length){
      const welcome = { role: "ai", text: "您好，我是智能客服小智 🤖\n可以问我：\n· 「我的订单到哪了」（业务工具查询）\n· 「退货政策是什么」（知识检索）\n· 「声岚耳机有货吗」（库存工具）\n置信度不足时我会建议转接人工。" };
      state.chat.history.push(welcome); body.appendChild(msgEl(welcome));
    }
    body.scrollTop = body.scrollHeight;
    return p;
  }
  function msgEl(m){
    const div = document.createElement("div");
    div.className = "msg " + (m.role === "ai" ? "ai" : "user");
    let inner = `<div class="av">${m.role === "ai" ? "🤖" : "🙂"}</div><div class="bubble">${esc(m.text).replace(/\n/g, "<br>")}`;
    if(m.citations && m.citations.length) inner += `<div class="cite" onclick="App.showCites(${JSON.stringify(m.citations).replace(/"/g, "&quot;")})">📎 来源 ${m.citations.map(c => c.id).join("、")}</div>`;
    if(m.tool) inner += `<div class="muted" style="font-size:11.5px;margin-top:4px">🔧 已调用业务工具：${m.tool}（金额/时效以业务系统为准 · BR-13）</div>`;
    if(m.degraded) inner += `<div class="muted" style="font-size:11.5px;margin-top:4px;color:#e5484d">⚠ 已降级：${esc(m.degradeReason || "")}</div>`;
    if(m.transfer) inner += `<div style="margin-top:6px"><button class="btn btn-sm btn-err" onclick="App.toast('已创建人工工单，坐席将带会话摘要接入（FR-16）','ok')">转接人工</button></div>`;
    inner += `</div>`;
    div.innerHTML = inner;
    return div;
  }
  function chatSend(){
    const inp = $("#chat-in"); const q = inp.value.trim(); if(!q) return;
    inp.value = "";
    state.chat.history.push({ role: "user", text: q });
    const body = $("#chat-body"); body.appendChild(msgEl({ role: "user", text: q })); body.scrollTop = body.scrollHeight;
    const res = AI.of("customer-service").execute(q, { history: state.chat.history.filter(h => h.role).slice(-10) });
    const m = { role: "ai", text: res.reply, citations: res.citations, tool: res.toolResult ? res.toolResLabel || res.toolResult.tool : null, degraded: res.degraded, degradeReason: res.degradeReason, transfer: res.transfer };
    state.chat.history.push(m);
    body.appendChild(msgEl(m)); body.scrollTop = body.scrollHeight;
    $("#chat-foot").textContent = `intent=${res.intent} · confidence=${res.confidence} · degraded=${res.degraded}${res.toolResult ? " · tool=" + res.toolResult.tool : ""}`;
  }
  function showCites(cites){ modal(`<h3>📎 引用来源（可回查）</h3>${cites.map(c => `<div class="ok-item" style="margin-bottom:8px"><span class="tag tag-info">${esc(c.id)} · ${esc(c.topic)}</span><div style="margin-top:4px">${esc(c.snippet)}</div></div>`).join("")}`); }

  /* ---------- 弹层 / toast ---------- */
  function modal(html){ $("#modal-box").innerHTML = html; $("#modal-mask").hidden = false; }
  function closeModal(){ $("#modal-mask").hidden = true; }
  function toast(msg, type){
    const t = $("#toast"); t.textContent = msg; t.className = "toast " + (type || ""); t.hidden = false;
    clearTimeout(t._h); t._h = setTimeout(() => t.hidden = true, 2600);
  }

  /* ---------- 启动 ---------- */
  function boot(){
    DB.init();
    render();
    // 曝光埋点：列表/首页渲染后对可见商品记录 expose
    setTimeout(() => {
      if(!session()) return;
      const cards = document.querySelectorAll(".prod-card");
      if(cards.length <= 8) return;
      // 首屏商品记一次曝光（避免每次刷新刷屏，仅首页）
      if((location.hash || "#/") === "#/"){
        const items = AI.of("selection").execute(session().userId, { limit: 6 });
        // execute 已记录调用；曝光不再重复写，保持日志精简
      }
    }, 200);
    $("#modal-mask").addEventListener("click", e => { if(e.target.id === "modal-mask") closeModal(); });
  }
  document.addEventListener("DOMContentLoaded", boot);

  return { go, goDetail, globalSearch, session, user, needLogin, state, render, renderCatNav,
    doLogin, doRegister, logout, authTab, fill,
    pickSku, setQty, addCart, addBundle,
    cartToggle, cartQty, cartRemove, goCheckout, submitOrder, payOrder, payOk, cancelOrder, confirmOrder, refundOrder, showOrder,
    mConfirmPaid, mShip, doShip, mRefund,
    loadSample, catValidate, catImport, rollback, addSkuRow, publishProduct, toggleShelf, renderField,
    toggleGateway,
    toggleChat, chatSend, showCites, toast, modal, closeModal };
})();
