/* 智选云 AI-ECP · 存储层（localStorage 落库，对应设计报告 7 数据设计） */
window.DB = (function(){
  const NS = "aiecp:";
  const tables = ["categories","products","users","coupons","knowledge","assocRules","orders","reviews","config","carts","sessions","behaviors","aiLogs","payments","inventoryLogs"];

  function read(key, fallback){
    try{ const v = localStorage.getItem(NS + key); return v ? JSON.parse(v) : fallback; }
    catch(e){ return fallback; }
  }
  function write(key, val){ localStorage.setItem(NS + key, JSON.stringify(val)); }

  function init(force){
    if(force || localStorage.getItem(NS + "categories") === null){
      write("categories", [ SEED.categoryTree, SEED.categoryTree2 ]);   // 每元素一棵已发布树（含历史版本 versions[]）
      write("products",   SEED.products);
      write("users",      SEED.users);
      write("coupons",    SEED.coupons);
      write("knowledge",  SEED.knowledge);
      write("assocRules", SEED.assocRules);
      write("orders",     SEED.orders);
      write("reviews",    SEED.reviews);
      write("config",     SEED.config);
      write("carts",      []);      // [{userId, items:[{skuId,spuId,name,spec,price,qty,source,bundleId?}]}]
      write("sessions",   []);      // [{token, userId, loginAt}]
      write("behaviors",  []);      // [{userId, type, skuId/spuId, catId, at}] —— FR-20 埋点
      write("aiLogs",     []);      // AI 调用审计（能力/耗时/降级/护栏命中）
      write("payments",   []);      // 支付单（幂等去重）
      write("inventoryLogs", []);   // 库存流水
    }
  }
  function reset(){ tables.forEach(t => localStorage.removeItem(NS + t)); init(true); }

  const T = {}; tables.forEach(t => T[t] = () => read(t, []));
  function save(t, rows){ write(t, rows); }

  // ===== 工具 =====
  const uid = p => p + Date.now().toString(36).toUpperCase() + Math.random().toString(36).slice(2, 6).toUpperCase();
  const now = () => { const d = new Date(), p = n => String(n).padStart(2,"0");
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };

  return { init, reset, read, write, T, save, uid, now, NS };
})();
