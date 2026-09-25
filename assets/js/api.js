/* 智选云 AI-ECP · 服务层（REST 契约的进程内实现；统一响应体 {code,message,data,traceId}） */
window.API = (function(){
  const traceId = () => "t" + Math.random().toString(36).slice(2, 10);
  const OK = (data = null) => ({ code: 0, message: "ok", data, traceId: traceId() });
  const ERR = (code, message, data = null) => ({ code, message, data, traceId: traceId() });

  /* ===================== 鉴权（FR-26） ===================== */
  const Auth = {
    login(username, password){
      const u = DB.T.users().find(u => u.username === username && u.password === password);
      if(!u) return ERR(40100, "用户名或密码错误");
      const token = DB.uid("tk");
      const sessions = DB.T.sessions();
      sessions.push({ token, userId: u.id, role: u.role, loginAt: DB.now() });
      DB.save("sessions", sessions);
      return OK({ token, user: { id: u.id, username: u.username, role: u.role, nickname: u.nickname, address: u.address } });
    },
    register(form){
      const users = DB.T.users();
      if(!form.username || form.username.length < 4) return ERR(40001, "用户名至少 4 位");
      if(!form.password || form.password.length < 6) return ERR(40001, "密码至少 6 位");
      if(users.some(u => u.username === form.username)) return ERR(40900, "用户名已存在");
      const u = { id: DB.uid("U"), username: form.username, password: form.password, role: "consumer",
        nickname: form.nickname || form.username, phone: form.phone || "", createdAt: DB.now().slice(0, 10),
        address: null };
      users.push(u); DB.save("users", users);
      return Auth.login(form.username, form.password);
    },
    logout(token){ DB.save("sessions", DB.T.sessions().filter(s => s.token !== token)); return OK(); },
    byToken(token){ const s = DB.T.sessions().find(s => s.token === token); return s ? DB.T.users().find(u => u.id === s.userId) : null; },
    updateAddress(userId, addr){
      const users = DB.T.users(); const u = users.find(x => x.id === userId); if(!u) return ERR(40400, "用户不存在");
      u.address = addr; DB.save("users", users); return OK(u.address);
    }
  };

  /* ===================== 品类与商品（FR-01/02/10/11） ===================== */
  const Catalog = {
    publishedTrees(){ return DB.T.categories().filter(c => c.status !== "draft"); },
    // 品类树：消费者端返回精简树 + 每节点合并后的属性 Schema
    tree(){
      const trees = Catalog.publishedTrees();
      return OK(trees.map(t => {
        const schemas = CategoryEngine.materializeSchemas(t.category);
        return { rootId: t.category.code, rootName: t.category.name, version: t.version, schemaVersion: t.schemaVersion, schemas, root: strip(t.category) };
      }));
      function strip(node){
        const n = { code: node.code, name: node.name, sort: node.sort || 0, children: (node.children || []).map(strip) };
        if(!n.children.length) delete n.children;
        return n;
      }
    },
    leafCategories(){
      const leaves = [];
      Catalog.publishedTrees().forEach(t => {
        (function walk(n){ if(!n.children){ leaves.push({ tree: t.category.code, code: n.code, name: n.name }); } else n.children.forEach(walk); })(t.category);
      });
      return leaves;
    },
    list(params){
      params = params || {};
      let prods = DB.T.products().filter(p => p.status === "on");
      if(params.leafCode) prods = prods.filter(p => p.categoryId === params.leafCode);
      else if(params.rootCode){ // 未选叶子时按整棵树浏览
        const tree = Catalog.publishedTrees().find(t => t.category.code === params.rootCode);
        if(tree){ const leaves = new Set(Object.keys(CategoryEngine.materializeSchemas(tree.category)).filter(c => { const s = CategoryEngine.materializeSchemas(tree.category)[c]; return s && s.leaf; }));
          prods = prods.filter(p => leaves.has(p.categoryId)); }
      }
      if(params.kw){
        const kw = params.kw.toLowerCase();
        prods = prods.filter(p => p.name.toLowerCase().includes(kw)
          || p.detail.toLowerCase().includes(kw)
          || Object.entries(p.attrs).some(([k, v]) => String(v).toLowerCase().includes(kw) && isSearchable(p.categoryId, k)));
      }
      if(params.attrFilters){ // {attrCode: value} 仅 filterable 属性
        prods = prods.filter(p => Object.entries(params.attrFilters).every(([k, v]) => v === null || v === "" || String(p.attrs[k]) === String(v)));
      }
      if(params.priceMin != null) prods = prods.filter(p => Math.min(...p.skus.map(s => s.price)) >= params.priceMin);
      if(params.priceMax != null) prods = prods.filter(p => Math.min(...p.skus.map(s => s.price)) <= params.priceMax);
      const sorters = {
        sales: (a, b) => skuSum(b, "sales") - skuSum(a, "sales"),
        priceAsc: (a, b) => minPrice(a) - minPrice(b),
        priceDesc: (a, b) => minPrice(b) - minPrice(a),
        fresh: (a, b) => b.createdAt.localeCompare(a.createdAt)
      };
      if(params.sort && sorters[params.sort]) prods = [...prods].sort(sorters[params.sort]);
      return OK(prods.map(p => view(p)));
      function skuSum(p, f){ return p.skus.reduce((s, k) => s + (k[f] || 0), 0); }
      function minPrice(p){ return Math.min(...p.skus.map(k => k.price)); }
    },
    detail(spuId){
      const p = DB.T.products().find(x => x.id === spuId && x.status === "on");
      if(!p) return ERR(40400, "商品不存在或已下架");
      const reviews = DB.T.reviews().filter(r => r.spuId === spuId);
      return OK(Object.assign(view(p), { reviews, attrTable: p.attrs }));
    },
    facets(leafCode){
      const trees = Catalog.publishedTrees();
      for(const t of trees){
        const schemas = CategoryEngine.materializeSchemas(t.category);
        if(schemas[leafCode]){
          const s = schemas[leafCode];
          return OK(s.attrs.filter(a => a.filterable).map(a => ({
            code: a.code, name: a.name, dataType: a.dataType,
            type: a.options ? "enum" : (a.dataType === "boolean" ? "bool" : (a.dataType === "integer" || a.dataType === "decimal") ? "range" : "text"),
            options: a.options || null, unit: a.unit || null, range: a.range || null
          })));
        }
      }
      return OK([]);
    },
    merchantProducts(merchantId){ return OK(DB.T.products().filter(p => p.merchantId === merchantId).map(view)); },
    saveProduct(form, editor){
      const products = DB.T.products();
      const trees = DB.T.categories();
      let schemas = null;
      for(const t of trees){ const s = CategoryEngine.materializeSchemas(t.category); if(s[form.categoryId]){ schemas = s[form.categoryId]; break; } }
      if(!schemas) return ERR(42200, "品类不存在");
      if(schemas.leaf === false) return ERR(42201, "BR-02：仅叶子品类允许挂载商品");
      // required 属性校验
      const missing = schemas.attrs.filter(a => a.required && (form.attrs[a.code] === undefined || form.attrs[a.code] === "" || form.attrs[a.code] === null));
      if(missing.length) return ERR(42202, "必填属性未填写：" + missing.map(a => a.name).join("、"));
      if(!form.skus || !form.skus.length) return ERR(42203, "至少提供一个 SKU");
      for(const k of form.skus){
        if(!(k.price > 0)) return ERR(42204, "SKU 售价须大于 0");
        if(k.marketPrice && k.price > k.marketPrice) return ERR(42205, "BR-05：售价不得超过市场价");
        if(k.price <= k.cost) return ERR(42206, "演示约束：售价须大于成本价（毛利校验依赖）");
      }
      if(form.id){
        const i = products.findIndex(p => p.id === form.id); if(i < 0) return ERR(40400, "商品不存在");
        products[i] = Object.assign(products[i], { name: form.name, detail: form.detail, emoji: form.emoji || products[i].emoji, attrs: form.attrs, skus: form.skus.map(k => Object.assign({ id: k.id || DB.uid("SKU"), spuId: form.id, stock: { total: k.stockTotal | 0, locked: 0 } }, k)) });
        DB.save("products", products); return OK({ id: form.id });
      }
      const id = DB.uid("SPU");
      products.push({ id, name: form.name, categoryId: form.categoryId, merchantId: editor.id, status: "on", emoji: form.emoji || "🛍️",
        detail: form.detail || "", createdAt: DB.now().slice(0, 10), sales: 0, attrs: form.attrs,
        skus: form.skus.map(k => Object.assign({ id: DB.uid("SKU"), spuId: id, stock: { total: k.stockTotal | 0, locked: 0 } }, k)) });
      DB.save("products", products);
      return OK({ id });
    },
    toggleShelf(spuId, editor){
      const products = DB.T.products(); const p = products.find(x => x.id === spuId);
      if(!p || p.merchantId !== editor.id) return ERR(40300, "无权操作该商品");
      p.status = p.status === "on" ? "off" : "on"; DB.save("products", products);
      return OK({ status: p.status });
    }
  };
  function view(p){
    return { id: p.id, name: p.name, categoryId: p.categoryId, emoji: p.emoji, detail: p.detail, status: p.status,
      createdAt: p.createdAt, sales: p.skus.reduce((s, k) => s + (k.sales || 0), 0),
      attrs: p.attrs,
      skus: p.skus.map(k => ({ id: k.id, specs: k.specs, price: k.price, marketPrice: k.marketPrice, sales: k.sales || 0,
        available: k.stock.total - k.stock.locked })),
      minPrice: Math.min(...p.skus.map(k => k.price)) };
  }
  function isSearchable(catId, attrCode){
    const trees = DB.T.categories();
    for(const t of trees){
      const schemas = CategoryEngine.materializeSchemas(t.category);
      const s = schemas[catId]; if(!s) continue;
      const a = s.attrs.find(x => x.code === attrCode);
      return a ? !!a.searchable : false;
    }
    return false;
  }

  /* ===================== 品类导入（FR-07~10） ===================== */
  const CategoryAdmin = {
    validate(jsonText){ // dry-run
      const r = CategoryEngine.process(jsonText, "dryRun");
      return OK({ ok: r.ok, stage: r.stage, errors: r.errors, warnings: r.warnings, generated: r.generated });
    },
    import_(jsonText, merchant){
      const r = CategoryEngine.process(jsonText, "commit");
      if(!r.ok) return ERR(42201, "品类结构校验未通过", { errors: r.errors, warnings: r.warnings });
      const cats = DB.T.categories();
      const existsIdx = cats.findIndex(c => c.category.code === r.tree.code);
      const record = { schemaVersion: r.tree.schemaVersion || "1.0", category: r.tree, merchantId: merchant.id,
        version: existsIdx >= 0 ? cats[existsIdx].version + 1 : 1, status: "published", importedAt: DB.now(),
        stats: r.generated };
      if(existsIdx >= 0){
        const old = cats[existsIdx];
        old.versions = old.versions || [];
        old.versions.push({ version: old.version, category: old.category, archivedAt: DB.now() });   // 版本可回滚（NFR-12）
        cats[existsIdx] = record;
      } else cats.push(record);
      DB.save("categories", cats);
      return OK({ rootCode: r.tree.code, version: record.version, generated: { nodeCount: r.generated.nodeCount, attrCount: r.generated.attrCount, indexFields: r.generated.indexFields, leafCount: r.generated.leafCount }, warnings: r.warnings });
    },
    rollback(rootCode, merchant){
      const cats = DB.T.categories(); const c = cats.find(x => x.category.code === rootCode);
      if(!c || !c.versions || !c.versions.length) return ERR(40400, "没有可回滚的历史版本");
      const prev = c.versions.pop();
      c.versions.push ? null : null;
      const cur = { schemaVersion: c.schemaVersion, category: c.category, merchantId: c.merchantId, version: c.version, status: c.status, stats: c.stats };
      c.versions.push({ version: prev.version, category: prev.category, archivedAt: DB.now() });
      const restored = { schemaVersion: "1.0", category: prev.category, merchantId: merchant.id, version: c.version + 1, status: "published", stats: null };
      cats[cats.indexOf(c)] = restored;
      restored.versions = [cur];
      DB.save("categories", cats);
      return OK({ rootCode, version: restored.version });
    }
  };

  /* ===================== 购物车（FR-03 / FR-23） ===================== */
  const Cart = {
    get(userId){ return OK(DB.T.carts().find(c => c.userId === userId) || { userId, items: [] }); },
    add(userId, entry){
      const carts = DB.T.carts(); let cart = carts.find(c => c.userId === userId);
      if(!cart){ cart = { userId, items: [] }; carts.push(cart); }
      cart.items.push(entry); DB.save("carts", carts); return Cart.get(userId);
    },
    updateQty(userId, idx, qty){
      const carts = DB.T.carts(); const cart = carts.find(c => c.userId === userId);
      if(!cart || !cart.items[idx]) return ERR(40400, "购物车项不存在");
      if(qty <= 0) cart.items.splice(idx, 1); else cart.items[idx].qty = qty;
      DB.save("carts", carts); return Cart.get(userId);
    },
    removeChecked(userId){
      const carts = DB.T.carts(); const cart = carts.find(c => c.userId === userId);
      if(cart){ cart.items = cart.items.filter(i => !i.checked); DB.save("carts", carts); }
      return Cart.get(userId);
    },
    toggle(userId, idx, checked){
      const carts = DB.T.carts(); const cart = carts.find(c => c.userId === userId);
      if(cart && cart.items[idx]){ cart.items[idx].checked = checked !== false; DB.save("carts", carts); }
      return Cart.get(userId);
    }
  };

  /* ===================== 订单（FR-04/05/06 + 状态机 BR-07 + 库存 BR-06 + 支付幂等 BR-08） ===================== */
  const NEXT_STATE = { "待支付": ["已支付", "已关闭"], "已支付": ["待发货", "退款中"], "待发货": ["已发货", "退款中"], "已发货": ["已完成", "退款中"], "退款中": ["已退款", "已发货"], "已完成": [], "已关闭": [], "已退款": [] };
  const Order = {
    can(next, cur){ return (NEXT_STATE[cur] || []).includes(next); },
    create(userId, form){
      const products = DB.T.products(); const items = [];
      let amount = 0;
      for(const line of form.items){
        const p = products.find(x => x.id === line.spuId); if(!p) return ERR(40400, "商品不存在：" + line.spuId);
        if(p.status !== "on") return ERR(41000, "商品已下架：" + p.name);
        const sku = p.skus.find(k => k.id === line.skuId);
        if(!sku) return ERR(40400, "规格不存在");
        if(sku.stock.total - sku.stock.locked < line.qty) return ERR(41001, "库存不足：" + p.name);   // BR-06
        // 计价：单品以目录价为准（防篡改）；组货组合按分摊价入单（FR-22/23），钳制在 [成本, 目录价] 区间
        let unitPrice = sku.price;
        if(line.source === "bundle" && line.price > 0){
          unitPrice = Math.min(Math.max(line.price, sku.cost), sku.price);
        }
        sku.stock.locked += line.qty;   // 锁定
        items.push({ skuId: sku.id, spuId: p.id, name: p.name, emoji: p.emoji, spec: Object.entries(sku.specs).map(([k, v]) => k + ":" + v).join(" "), price: unitPrice, qty: line.qty, source: line.source || "single", bundleId: line.bundleId || null });
        amount += unitPrice * line.qty;
        invLog(sku.id, "lock", line.qty, "下单锁定");
      }
      DB.save("products", products);
      const u = DB.T.users().find(x => x.id === userId);
      if(!form.address || !form.address.detail) return ERR(42200, "请填写收货地址");
      // 优惠（FR-24）：券
      let discount = 0, couponName = null;
      if(form.couponId){
        const cp = DB.T.coupons().find(c => c.id === form.couponId);
        if(cp){
          const leaf = DB.T.categories().length && leafOf(items[0].spuId);
          const scopeOK = cp.scope === "全场" || items.every(it => catRoot(leaf ? it.spuId : null) === cp.scope) || (leaf && cp.scope === rootNameOf(leaf));
          if(scopeOK && amount >= cp.threshold){ discount = cp.amount; couponName = cp.name; }
        }
      }
      const payable = Math.max(0, Math.round((amount - discount) * 100) / 100);
      const order = { id: "SO" + Date.now(), userId, items, amount, discount, couponName, payable, status: "待支付",
        createdAt: DB.now(), address: form.address, timeline: [DB.now() + " 创建订单"] };
      const orders = DB.T.orders(); orders.unshift(order); DB.save("orders", orders);
      logBehavior(userId, "order", items[0]);
      return OK(order);
    },
    pay(orderId, userId){
      const orders = DB.T.orders(); const o = orders.find(x => x.id === orderId);
      if(!o || o.userId !== userId) return ERR(40400, "订单不存在");
      if(o.status !== "待支付") return ERR(40900, "订单状态不是待支付（可能已支付）");
      // 幂等：同支付单只生效一次（BR-08）
      const payments = DB.T.payments();
      if(payments.some(p => p.orderId === orderId && p.result === "success")) return OK(o);
      payments.push({ id: DB.uid("PAY"), orderId, result: "success", at: DB.now() }); DB.save("payments", payments);
      o.status = "已支付"; o.payId = payments[payments.length - 1].id;
      o.timeline.push(DB.now() + " 支付成功（模拟网关回调，验签通过）");
      // 锁定转扣减
      const products = DB.T.products();
      o.items.forEach(it => { const p = products.find(x => x.id === it.spuId); const k = p.skus.find(s => s.id === it.skuId);
        k.stock.total -= it.qty; k.stock.locked -= it.qty; k.sales = (k.sales || 0) + it.qty; invLog(k.id, "deduct", it.qty, "支付成功扣减"); });
      DB.save("products", products);
      DB.save("orders", orders);
      return OK(o);
    },
    cancel(orderId, userId){
      const orders = DB.T.orders(); const o = orders.find(x => x.id === orderId);
      if(!o || o.userId !== userId) return ERR(40400, "订单不存在");
      if(o.status !== "待支付") return ERR(40900, "仅待支付订单可直接取消");
      release(o); o.status = "已关闭"; o.timeline.push(DB.now() + " 用户取消，库存锁定已释放"); DB.save("orders", orders);
      return OK(o);
    },
    refund(orderId, userId){
      const orders = DB.T.orders(); const o = orders.find(x => x.id === orderId);
      if(!o || o.userId !== userId) return ERR(40400, "订单不存在");
      if(!["已支付", "待发货", "已发货"].includes(o.status)) return ERR(40900, "当前状态不可申请退款");
      o.status = "退款中"; o.timeline.push(DB.now() + " 用户申请退款"); DB.save("orders", orders); return OK(o);
    },
    confirm(orderId, userId){
      const orders = DB.T.orders(); const o = orders.find(x => x.id === orderId);
      if(!o || o.userId !== userId) return ERR(40400, "订单不存在");
      if(o.status !== "已发货") return ERR(40900, "订单尚未发货");
      o.status = "已完成"; o.timeline.push(DB.now() + " 确认收货，交易完成"); DB.save("orders", orders); return OK(o);
    },
    /* 商家操作 */
    ship(orderId, merchant, trackingNo){
      const orders = DB.T.orders(); const o = orders.find(x => x.id === orderId);
      if(!o) return ERR(40400, "订单不存在");
      if(o.status !== "待发货") return ERR(40900, "订单不处于待发货状态");
      if(!trackingNo) return ERR(42200, "运单号非空（状态机守卫）");
      o.status = "已发货"; o.trackingNo = trackingNo;
      o.timeline.push(DB.now() + ` 已发货 ${trackingNo}（顺丰速运）`); DB.save("orders", orders); return OK(o);
    },
    confirmPaid(orderId, merchant){
      const orders = DB.T.orders(); const o = orders.find(x => x.id === orderId);
      if(!o) return ERR(40400, "订单不存在");
      if(o.status !== "已支付") return ERR(40900, "订单不处于已支付状态");
      o.status = "待发货"; o.timeline.push(DB.now() + " 商家确认，待发货"); DB.save("orders", orders); return OK(o);
    },
    handleRefund(orderId, merchant, approve){
      const orders = DB.T.orders(); const o = orders.find(x => x.id === orderId);
      if(!o) return ERR(40400, "订单不存在");
      if(o.status !== "退款中") return ERR(40900, "订单不处于退款中");
      if(approve){
        o.status = "已退款"; o.timeline.push(DB.now() + " 商家同意退款，原路退回（3-7 个工作日到账）");
        const products = DB.T.products();
        o.items.forEach(it => { const p = products.find(x => x.id === it.spuId); const k = p && p.skus.find(s => s.id === it.skuId); if(k){ k.stock.total += it.qty; invLog(k.id, "restock", it.qty, "退款回补"); } });
        DB.save("products", products);
      } else {
        o.status = "待发货"; o.timeline.push(DB.now() + " 商家驳回退款");   // 状态机：退款中 → 已发货/回退
      }
      DB.save("orders", orders); return OK(o);
    },
    listMine(userId){ return OK(DB.T.orders().filter(o => o.userId === userId)); },
    listAll(){ return OK(DB.T.orders()); }
  };
  function release(o){
    const products = DB.T.products();
    o.items.forEach(it => { const p = products.find(x => x.id === it.spuId); const k = p && p.skus.find(s => s.id === it.skuId); if(k){ k.stock.locked -= it.qty; invLog(k.id, "release", it.qty, "取消释放"); } });
    DB.save("products", products);
  }
  function invLog(skuId, action, qty, note){
    const logs = DB.T.inventoryLogs(); logs.unshift({ skuId, action, qty, note, at: DB.now() }); DB.save("inventoryLogs", logs.slice(0, 300));
  }
  function leafOf(spuId){ const p = DB.T.products().find(x => x.id === spuId); return p ? p.categoryId : null; }
  function catRoot(){ return null; }
  function rootNameOf(leafCode){
    for(const t of DB.T.categories()){
      const schemas = CategoryEngine.materializeSchemas(t.category);
      if(schemas[leafCode]) return t.category.name;
    }
    return "";
  }
  function logBehavior(userId, type, it){
    const p = DB.T.products().find(x => x.id === it.spuId);
    const behs = DB.T.behaviors(); behs.push({ userId, type, spuId: it.spuId, skuId: it.skuId, catId: p ? p.categoryId : null, at: DB.now() });
    DB.save("behaviors", behs.slice(-500));
  }

  /* ===================== 评论（FR-06） ===================== */
  const Review = {
    add(userId, spuId, rating, content){
      const u = DB.T.users().find(x => x.id === userId);
      const reviews = DB.T.reviews();
      reviews.unshift({ id: DB.uid("R"), spuId, userId, nickname: u ? u.nickname : "匿名", rating, content, createdAt: DB.now() });
      DB.save("reviews", reviews); return OK();
    }
  };

  /* ===================== 运营与治理（FR-25/27） ===================== */
  const Console = {
    stats(){
      const orders = DB.T.orders(), users = DB.T.users(), prods = DB.T.products();
      const paid = orders.filter(o => ["已支付", "待发货", "已发货", "已完成", "退款中", "已退款"].includes(o.status));
      const gmv = paid.reduce((s, o) => s + o.payable, 0);
      const aiLogs = DB.T.aiLogs();
      return OK({
        userCount: users.filter(u => u.role === "consumer").length,
        productCount: prods.filter(p => p.status === "on").length,
        orderCount: orders.length, gmv: gmv,
        catTrees: DB.T.categories().length,
        aiCalls: aiLogs.length, aiDegraded: aiLogs.filter(l => l.degraded).length,
        topProducts: prods.map(p => ({ name: p.name, sales: p.skus.reduce((s, k) => s + (k.sales || 0), 0), emoji: p.emoji }))
          .sort((a, b) => b.sales - a.sales).slice(0, 5),
        stateDist: ["待支付", "已支付", "待发货", "已发货", "已完成", "已关闭", "退款中", "已退款"].map(s => ({ state: s, n: orders.filter(o => o.status === s).length })).filter(x => x.n)
      });
    },
    setGateway(on){
      const cfg = DB.T.config(); cfg.llmGateway = on ? "on" : "off"; DB.save("config", cfg); return OK(cfg);
    },
    saveConfig(cfg){ DB.save("config", cfg); return OK(cfg); },
    users(){ return OK(DB.T.users().map(u => ({ id: u.id, username: u.username, role: u.role, nickname: u.nickname, createdAt: u.createdAt }))); },
    aiLogs(){ return OK(DB.T.aiLogs()); },
    knowledge(){ return OK(DB.T.knowledge()); },
    behaviors(userId){
      const all = DB.T.behaviors();
      return OK(userId ? all.filter(b => b.userId === userId) : all);
    }
  };

  return { Auth, Catalog, CategoryAdmin, Cart, Order, Review, Console };
})();
