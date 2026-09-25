/* 智选云 AI-ECP · 种子数据（首启落库） */
window.SEED = (function(){

  // ===== 品类树（商家 shop001）——与《需求分析报告》3.6.2 示例同构 =====
  const categoryTree = {
    schemaVersion: "1.0", version: 1, merchantId: "shop001",
    category: {
      code: "HOME_APPLIANCE", name: "家用电器", sort: 10,
      attributes: [
        { code: "brand", name: "品牌", dataType: "string", required: true, filterable: true, searchable: true },
        { code: "energyLevel", name: "能效等级", dataType: "enum", options: ["一级","二级","三级"], required: true, filterable: true }
      ],
      children: [
        {
          code: "HOME_APPLIANCE_KITCHEN", name: "厨房电器", sort: 20,
          attributes: [
            { code: "capacity", name: "容量", dataType: "decimal", unit: "L", range: [0.5, 60], required: false, filterable: true }
          ],
          children: [
            {
              code: "HOME_APPLIANCE_KITCHEN_RICE", name: "电饭煲", sort: 21,
              attributes: [
                { code: "innerPot", name: "内胆材质", dataType: "enum", options: ["铝合金","不锈钢","陶瓷","铸铁"], required: true, filterable: true },
                { code: "keepWarmHours", name: "保温时长", dataType: "integer", unit: "小时", range: [0, 48], required: false, filterable: true }
              ]
            },
            {
              code: "HOME_APPLIANCE_KITCHEN_KETTLE", name: "电水壶", sort: 22,
              attributes: [
                { code: "volume", name: "容积", dataType: "enum", options: ["1L","1.5L","1.7L","2L"], required: true, filterable: true },
                { code: "antiScale", name: "除垢功能", dataType: "boolean", required: false, filterable: true }
              ]
            },
            {
              code: "HOME_APPLIANCE_KITCHEN_JUICER", name: "破壁机", sort: 23,
              attributes: [
                { code: "powerW", name: "额定功率", dataType: "integer", unit: "W", range: [200, 2200], required: true, filterable: true },
                { code: "cups", name: "杯数", dataType: "enum", options: ["单人","双人","家庭装"], required: false, filterable: true }
              ]
            }
          ]
        },
        {
          code: "HOME_APPLIANCE_CLEANING", name: "清洁电器", sort: 30,
          attributes: [
            { code: "suctionPower", name: "吸力", dataType: "integer", unit: "Pa", range: [1000, 40000], required: false, filterable: true }
          ],
          children: [
            {
              code: "HOME_APPLIANCE_CLEANING_VACUUM", name: "吸尘器", sort: 31,
              attributes: [
                { code: "vacType", name: "类型", dataType: "enum", options: ["手持无线","卧式","立式"], required: true, filterable: true },
                { code: "runtime", name: "续航", dataType: "integer", unit: "分钟", range: [5, 120], required: false, filterable: true }
              ]
            },
            {
              code: "HOME_APPLIANCE_CLEANING_MOP", name: "洗地机", sort: 32,
              attributes: [
                { code: "selfClean", name: "自清洁", dataType: "boolean", required: true, filterable: true }
              ]
            }
          ]
        }
      ]
    }
  };

  // ===== 第二棵树（数码电子，2 层）=====
  const categoryTree2 = {
    schemaVersion: "1.0", version: 1, merchantId: "shop001",
    category: {
      code: "DIGITAL", name: "数码电子", sort: 20,
      attributes: [
        { code: "brand", name: "品牌", dataType: "string", required: true, filterable: true, searchable: true }
      ],
      children: [
        {
          code: "DIGITAL_AUDIO", name: "影音设备", sort: 10,
          attributes: [
            { code: "connectType", name: "连接方式", dataType: "enum", options: ["蓝牙","有线","2.4G无线"], required: true, filterable: true }
          ],
          children: [
            { code: "DIGITAL_AUDIO_EARBUDS", name: "真无线耳机", sort: 11,
              attributes: [ { code: "anc", name: "主动降噪", dataType: "boolean", required: false, filterable: true },
                            { code: "playbackH", name: "续航", dataType: "integer", unit: "小时", range: [3, 80], required: false, filterable: true } ] },
            { code: "DIGITAL_AUDIO_SPEAKER", name: "智能音箱", sort: 12,
              attributes: [ { code: "voiceAssist", name: "语音助手", dataType: "enum", options: ["小智","小爱","天猫精灵"], required: true, filterable: true } ] }
          ]
        },
        {
          code: "DIGITAL_OFFICE", name: "办公外设", sort: 20,
          attributes: [],
          children: [
            { code: "DIGITAL_OFFICE_KB", name: "机械键盘", sort: 21,
              attributes: [ { code: "switchType", name: "轴体", dataType: "enum", options: ["红轴","青轴","茶轴","静音轴"], required: true, filterable: true },
                            { code: "layout", name: "配列", dataType: "enum", options: ["61键","87键","104键"], required: false, filterable: true } ] },
            { code: "DIGITAL_OFFICE_MOUSE", name: "无线鼠标", sort: 22,
              attributes: [ { code: "dpi", name: "DPI", dataType: "integer", range: [800, 26000], required: false, filterable: true } ] }
          ]
        }
      ]
    }
  };

  // ===== 商品（SPU + SKU）=====
  let pid = 0, skid = 0;
  const P = (name, cat, brand, emoji, detail, attrs, skus, sales, createdAt) => {
    pid++;
    const spu = { id: "SPU" + String(pid).padStart(4, "0"), name, categoryId: cat, merchantId: "shop001",
      status: "on", emoji, detail, createdAt: createdAt || "2026-08-01", sales: sales || 0, attrs };
    spu.skus = skus.map(s => { skid++; return Object.assign({ id: "SKU" + String(skid).padStart(4, "0"), spuId: spu.id, stock: { total: 200, locked: 0 } }, s); });
    return spu;
  };

  const products = [
    // 电饭煲
    P("云选 IH 电磁加热电饭煲 4L", "HOME_APPLIANCE_KITCHEN_RICE", "云选", "🍚",
      "IH 电磁环绕加热，球形内胆受热均匀，24 小时预约，煮饭快人一步。支持柴火饭、杂粮饭、蛋糕等多种模式。",
      { brand: "云选", energyLevel: "一级", capacity: 4, innerPot: "不锈钢", keepWarmHours: 24 },
      [{ specs: { "配色": "雅黑" }, price: 399, marketPrice: 499, cost: 250, sales: 612 },
       { specs: { "配色": "象牙白" }, price: 409, marketPrice: 509, cost: 258, sales: 233 }], 845),
    P("云选 迷你电饭煲 2L 一人食", "HOME_APPLIANCE_KITCHEN_RICE", "云选", "🍱",
      "2L 黄金容量，适合单身与宿舍场景；陶瓷内胆易清洗，可煮汤煮粥。",
      { brand: "云选", energyLevel: "二级", capacity: 2, innerPot: "陶瓷", keepWarmHours: 12 },
      [{ specs: { "配色": "奶白" }, price: 179, marketPrice: 219, cost: 108, sales: 430 }], 430, "2026-08-20"),
    P("迅腾 金属机身电饭煲 5L", "HOME_APPLIANCE_KITCHEN_RICE", "迅腾", "🍛",
      "5L 大容量家用聚餐无忧，铸铁内胆蓄热强，米饭粒粒分明。",
      { brand: "迅腾", energyLevel: "三级", capacity: 5, innerPot: "铸铁", keepWarmHours: 18 },
      [{ specs: { "配色": "深灰" }, price: 289, marketPrice: 359, cost: 178, sales: 205 }], 205),
    // 电水壶
    P("云选 双层防烫电水壶 1.7L", "HOME_APPLIANCE_KITCHEN_KETTLE", "云选", "🫖",
      "双层隔热壶身防烫伤，1.7L 大容量，5 分钟速沸，自动断电保护。",
      { brand: "云选", energyLevel: "一级", volume: "1.7L", antiScale: true },
      [{ specs: { "颜色": "冰川白" }, price: 89, marketPrice: 119, cost: 48, sales: 921 },
       { specs: { "颜色": "曜石黑" }, price: 89, marketPrice: 119, cost: 48, sales: 512 }], 1433),
    P("迅腾 恒温电水壶 1.5L 除垢版", "HOME_APPLIANCE_KITCHEN_KETTLE", "迅腾", "☕",
      "12 小时恒温，冲奶泡茶随取随用；一键除垢，水质更安心。",
      { brand: "迅腾", energyLevel: "二级", volume: "1.5L", antiScale: true },
      [{ specs: { "颜色": "浅杉绿" }, price: 139, marketPrice: 179, cost: 78, sales: 368 }], 368),
    // 破壁机
    P("云选 静音破壁机 1.75L 家庭装", "HOME_APPLIANCE_KITCHEN_JUICER", "云选", "🥤",
      " SoundReduce 静音舱降噪 40%，1200W 大动力破壁，豆浆鱼汤一键搞定。",
      { brand: "云选", energyLevel: "一级", powerW: 1200, cups: "家庭装" },
      [{ specs: { "颜色": "晨雾灰" }, price: 649, marketPrice: 899, cost: 420, sales: 158 }], 158, "2026-08-26"),
    P("迅腾 便携破壁机 单人款", "HOME_APPLIANCE_KITCHEN_JUICER", "迅腾", "🧃",
      "350W 轻音破壁，一机一杯，办公室即榨即饮。",
      { brand: "迅腾", energyLevel: "二级", powerW: 350, cups: "单人" },
      [{ specs: { "颜色": "蜜桃粉" }, price: 199, marketPrice: 259, cost: 110, sales: 277 }], 277),
    // 吸尘器
    P("云选 无线手持吸尘器 V9", "HOME_APPLIANCE_CLEANING_VACUUM", "云选", "🌀",
      "25000Pa 大吸力，60 分钟超长续航，五级过滤拦截微尘，床褥除螨一机搞定。",
      { brand: "云选", suctionPower: 25000, vacType: "手持无线", runtime: 60 },
      [{ specs: { "版本": "标准版" }, price: 1299, marketPrice: 1699, cost: 850, sales: 342 },
       { specs: { "版本": "除螨版" }, price: 1499, marketPrice: 1899, cost: 990, sales: 121 }], 463),
    P("迅腾 立式吸尘器 轻量款", "HOME_APPLIANCE_CLEANING_VACUUM", "迅腾", "🧹",
      "1.2kg 轻巧机身，随手立停，小户型日常清扫好帮手。",
      { brand: "迅腾", suctionPower: 12000, vacType: "立式", runtime: 35 },
      [{ specs: { "颜色": "月白" }, price: 599, marketPrice: 799, cost: 360, sales: 189 }], 189),
    // 洗地机
    P("云选 智能洗地机 X2 自清洁版", "HOME_APPLIANCE_CLEANING_MOP", "云选", "🚿",
      "吸拖洗一体，滚刷自清洁免手洗；固液分离，干湿垃圾一次带走。",
      { brand: "云选", suctionPower: 18000, selfClean: true },
      [{ specs: { "版本": "X2" }, price: 2299, marketPrice: 2999, cost: 1500, sales: 96 }], 96, "2026-08-28"),
    P("迅腾 有线洗地机 经典款", "HOME_APPLIANCE_CLEANING_MOP", "迅腾", "💧",
      "有线持续大吸力，无需续航焦虑，大平层深度清洁。",
      { brand: "迅腾", suctionPower: 15000, selfClean: false },
      [{ specs: { "颜色": "藏蓝" }, price: 999, marketPrice: 1299, cost: 610, sales: 88 }], 88),
    // 真无线耳机
    P("声岚 TWS 降噪耳机 Air3", "DIGITAL_AUDIO_EARBUDS", "声岚", "🎧",
      "42dB 主动降噪，单次 8 小时 + 仓 32 小时续航，入耳检测，低延迟游戏模式。",
      { brand: "声岚", anc: true, playbackH: 40 },
      [{ specs: { "颜色": "云白" }, price: 499, marketPrice: 649, cost: 300, sales: 523 },
       { specs: { "颜色": "夜幕黑" }, price: 499, marketPrice: 649, cost: 300, sales: 476 }], 999, "2026-09-02"),
    P("声岚 半入耳耳机 Air SE", "DIGITAL_AUDIO_EARBUDS", "声岚", "🎵",
      "轻巧半入耳佩戴，蓝牙 5.3 稳连不断，通勤追剧好伴侣。",
      { brand: "声岚", anc: false, playbackH: 28 },
      [{ specs: { "颜色": "薄荷绿" }, price: 199, marketPrice: 259, cost: 105, sales: 611 }], 611, "2026-09-05"),
    // 智能音箱
    P("声岚 智能音箱 Box mini", "DIGITAL_AUDIO_SPEAKER", "声岚", "🔊",
      "小智语音助手加持，定闹钟、查天气、控制家电一句话搞定。",
      { brand: "声岚", connectType: "蓝牙", voiceAssist: "小智" },
      [{ specs: { "颜色": "布纹灰" }, price: 149, marketPrice: 199, cost: 80, sales: 702 }], 702),
    // 键盘
    P("码客 98 键机械键盘 G68", "DIGITAL_OFFICE_KB", "码客", "⌨️",
      "Gasket 结构三模连接，热插拔轴座，PBT 键帽不油手。",
      { brand: "码客", connectType: "蓝牙", switchType: "红轴", layout: "87键" },
      [{ specs: { "轴体": "红轴" }, price: 329, marketPrice: 399, cost: 190, sales: 245 },
       { specs: { "轴体": "茶轴" }, price: 349, marketPrice: 419, cost: 205, sales: 154 }], 399, "2026-09-08"),
    P("码客 静音轴办公键盘 K61", "DIGITAL_OFFICE_KB", "码客", "🖥️",
      "静音轴体深夜码字不扰人，61 键便携配列，出差随行。",
      { brand: "码客", connectType: "2.4G无线", switchType: "静音轴", layout: "61键" },
      [{ specs: { "轴体": "静音轴" }, price: 219, marketPrice: 269, cost: 120, sales: 132 }], 132, "2026-09-10"),
    // 鼠标
    P("码客 双模无线鼠标 M5 Pro", "DIGITAL_OFFICE_MOUSE", "码客", "🖱️",
      "26000DPI 旗舰传感器，58g 轻量化设计，电竞办公两相宜。",
      { brand: "码客", dpi: 26000 },
      [{ specs: { "颜色": "黑" }, price: 249, marketPrice: 299, cost: 140, sales: 210 },
       { specs: { "颜色": "白" }, price: 249, marketPrice: 299, cost: 140, sales: 187 }], 397),
    P("码客 静音办公鼠标 M2", "DIGITAL_OFFICE_MOUSE", "码客", "🐁",
      "静音微动点击不扰邻，人体工学右手设计，久握不累。",
      { brand: "码客", dpi: 4000 },
      [{ specs: { "颜色": "灰蓝" }, price: 99, marketPrice: 129, cost: 48, sales: 508 }], 508)
  ];
  // 两个演示商品做库存预警与下架示例
  products[10].skus[0].stock.total = 8;   // 迅腾有线洗地机 低库存
  products[6].status = "on";

  // ===== 用户 =====
  const users = [
    { id: "U001", username: "admin",   password: "admin123", role: "admin",    nickname: "平台管理员", phone: "13800000001", createdAt: "2026-08-01" },
    { id: "U002", username: "shop001", password: "123456",   role: "merchant", nickname: "云选旗舰店", phone: "13800000002", createdAt: "2026-08-01" },
    { id: "U003", username: "buyer001", password: "123456",  role: "consumer", nickname: "小明",       phone: "13800000003", createdAt: "2026-08-03",
      address: { name: "小明", phone: "13800000003", detail: "辽宁省大连市甘井子区软件园路 1 号" } },
    { id: "U004", username: "buyer002", password: "123456",  role: "consumer", nickname: "小美",       phone: "13800000004", createdAt: "2026-08-06",
      address: { name: "小美", phone: "13800000004", detail: "北京市朝阳区望京街道 2 号" } }
  ];

  // ===== 优惠券（FR-24）=====
  const coupons = [
    { id: "C001", name: "新人立减券", threshold: 0,   amount: 20,   scope: "全场",   validTo: "2027-12-31" },
    { id: "C002", name: "家电满减券", threshold: 999, amount: 100,  scope: "家用电器", validTo: "2027-12-31" },
    { id: "C003", name: "数码满减券", threshold: 300, amount: 30,   scope: "数码电子", validTo: "2027-12-31" }
  ];

  // ===== 知识库片段（FR-27 / 智能客服 RAG 语料）=====
  const knowledge = [
    { id: "K01", topic: "物流", text: "本商城默认快递为顺丰速运。付款后 48 小时内发货，江浙沪地区 1-2 天送达，东北及偏远地区 3-5 天送达。发货后可在订单详情页查看物流轨迹。" },
    { id: "K02", topic: "物流", text: "受天气与节假日影响，物流时效可能顺延 1-2 天；如超时未更新，可联系在线客服提交催单工单。" },
    { id: "K03", topic: "售后", text: "自签收之日起 7 天内，商品未使用且不影响二次销售的，可申请无理由退货；15 天内出现质量问题可申请换新。" },
    { id: "K04", topic: "售后", text: "退款路径：订单详情页点击“申请退款”，商家审核通过后原路退回，3-7 个工作日到账。" },
    { id: "K05", topic: "售后", text: "家用电器类商品整机保修 1 年，电机等核心部件保修 3 年，保修期内非人为损坏免费维修。" },
    { id: "K06", topic: "支付", text: "本商城支持余额支付与模拟网关支付；支付超时 15 分钟订单自动关闭，库存自动释放。" },
    { id: "K07", topic: "会员", text: "会员积分按实付金额 1 元 = 1 积分累计，积分可在积分商城兑换优惠券与实物礼品。" },
    { id: "K08", topic: "商品", text: "云选 IH 电磁加热电饭煲 4L 采用 IH 电磁环绕加热，配备不锈钢球形内胆，支持 24 小时预约与多种烹饪模式。" },
    { id: "K09", topic: "商品", text: "声岚 TWS 降噪耳机 Air3 支持 42dB 主动降噪，单次续航 8 小时，配合充电仓总续航约 40 小时。" },
    { id: "K10", topic: "品类", text: "本商城品类由商家以 JSON 自定义并即时生效；消费者可按品类属性（如能效等级、容量、降噪）筛选商品。" },
    { id: "K11", topic: "订单", text: "订单状态流转：待支付 → 已支付 → 待发货 → 已发货 → 已完成；未支付订单可直接取消，已支付订单取消将进入退款流程。" },
    { id: "K12", topic: "物流", text: "海外及港澳台地区暂不支持配送；新疆西藏地区部分大件商品加收运费，下单时页面会有提示。" },
    { id: "K13", topic: "售后", text: "退换货请保持商品包装完整，附赠品与发票一同寄回；因质量问题产生的运费由商家承担。" },
    { id: "K14", topic: "支付", text: "开具电子发票：订单完成后在订单详情页申请，发票将在 1-3 个工作日内发送至预留邮箱。" },
    { id: "K15", topic: "商品", text: "码客 98 键机械键盘 G68 支持 2.4G/蓝牙/有线三模连接与热插拔换轴，适合办公与游戏双场景。" }
  ];

  // ===== 关联规则（智能组货召回种子，FR-21）=====
  const assocRules = [
    { mainCat: "HOME_APPLIANCE_KITCHEN_RICE",   subCat: "HOME_APPLIANCE_KITCHEN_KETTLE",   lift: 2.6, scene: "厨房新居" },
    { mainCat: "HOME_APPLIANCE_KITCHEN_RICE",   subCat: "HOME_APPLIANCE_KITCHEN_JUICER",   lift: 1.9, scene: "厨房新居" },
    { mainCat: "HOME_APPLIANCE_KITCHEN_KETTLE", subCat: "HOME_APPLIANCE_KITCHEN_RICE",     lift: 2.2, scene: "茶饮办公" },
    { mainCat: "HOME_APPLIANCE_CLEANING_VACUUM",subCat: "HOME_APPLIANCE_CLEANING_MOP",     lift: 2.1, scene: "全屋清洁" },
    { mainCat: "DIGITAL_AUDIO_EARBUDS",         subCat: "DIGITAL_AUDIO_SPEAKER",           lift: 1.8, scene: "影音娱乐" },
    { mainCat: "DIGITAL_OFFICE_KB",             subCat: "DIGITAL_OFFICE_MOUSE",            lift: 3.1, scene: "桌面办公" },
    { mainCat: "DIGITAL_OFFICE_MOUSE",          subCat: "DIGITAL_OFFICE_KB",               lift: 2.9, scene: "桌面办公" },
    { mainCat: "DIGITAL_AUDIO_SPEAKER",         subCat: "DIGITAL_AUDIO_EARBUDS",           lift: 1.7, scene: "影音娱乐" },
    { mainCat: "HOME_APPLIANCE_CLEANING_MOP",   subCat: "HOME_APPLIANCE_CLEANING_VACUUM",  lift: 2.0, scene: "全屋清洁" },
    { mainCat: "HOME_APPLIANCE_KITCHEN_JUICER", subCat: "HOME_APPLIANCE_KITCHEN_RICE",     lift: 1.8, scene: "健康轻食" }
  ];

  // ===== 演示订单（供后台看板/发货演示）=====
  const orders = [
    { id: "SO20260920001", userId: "U004", items: [{ skuId: "SKU0009", spuId: products[3].id, name: products[3].name, spec: "颜色:冰川白", price: 89, qty: 1, source: "single" }],
      amount: 89, discount: 0, payable: 89, status: "已完成", createdAt: "2026-09-20 10:12",
      address: { name: "小美", phone: "13800000004", detail: "北京市朝阳区望京街道 2 号" }, payId: "PAY20260920001", trackingNo: "SF1380000008765", timeline: ["2026-09-20 10:12 创建订单", "2026-09-20 10:13 支付成功", "2026-09-20 18:02 商家确认，待发货", "2026-09-21 09:15 已发货 SF1380000008765", "2026-09-22 14:30 确认收货，交易完成"] },
    { id: "SO20260921002", userId: "U003", items: [{ skuId: "SKU0012", spuId: products[7].id, name: products[7].name, spec: "版本:标准版", price: 1299, qty: 1, source: "single" }],
      amount: 1199, discount: 100, payable: 1199, status: "待发货", createdAt: "2026-09-21 21:44",
      address: { name: "小明", phone: "13800000003", detail: "辽宁省大连市甘井子区软件园路 1 号" }, payId: "PAY20260921002", timeline: ["2026-09-21 21:44 创建订单", "2026-09-21 21:45 支付成功", "2026-09-21 22:10 商家确认，待发货"] },
    { id: "SO20260922003", userId: "U003", items: [{ skuId: "SKU0004", spuId: products[0].id, name: products[0].name, spec: "配色:雅黑", price: 399, qty: 1, source: "single" }],
      amount: 379, discount: 20, payable: 379, status: "待支付", createdAt: "2026-09-22 08:30",
      address: { name: "小明", phone: "13800000003", detail: "辽宁省大连市甘井子区软件园路 1 号" }, timeline: ["2026-09-22 08:30 创建订单"] }
  ];

  // ===== 评论 =====
  const reviews = [
    { id: "R1", spuId: products[3].id, userId: "U004", nickname: "小美", rating: 5, content: "烧水特别快，双层壶身外面不烫手，好评！", createdAt: "2026-09-22 09:00" },
    { id: "R2", spuId: products[0].id, userId: "U003", nickname: "小明", rating: 4, content: "米饭口感不错，就是预约设置要研究一下。", createdAt: "2026-09-23 20:11" }
  ];

  // ===== 平台配置（FR-26/27：模型路由、提示词、降级开关）=====
  const config = {
    llmGateway: "on",              // on=在线模型(模拟)；off=降级为规则策略（演示 NFR-07）
    modelRoute: { primary: "qwen-plus", backup: "deepseek-v3", strategy: "故障自动切换" },
    aiThresholds: { csConfidence: 0.35, bundleMarginMin: 0.12, diversityCatCap: 0.5 },
    promptTemplates: [
      { id: "PT01", scene: "customer-service", version: "v1.3", text: "你是智选云商城的智能客服「小智」。请仅依据命中的知识片段与工具返回的业务事实作答，金额与时效以业务系统返回值为准，不得编造；无法回答时坦诚说明并建议转人工。" },
      { id: "PT02", scene: "selection",        version: "v1.1", text: "基于用户画像与召回结果生成推荐理由，禁止推荐下架、无库存商品，同一叶子品类占比不超过 50%。" },
      { id: "PT03", scene: "bundle",           version: "v1.2", text: "为主商品生成 2-4 个 SKU 的搭配方案并撰写搭配理由；组合毛利率不得低于主商品单品毛利率，可行性与价格以业务服务校验结果为准。" }
    ]
  };

  return { categoryTree, categoryTree2, products, users, coupons, knowledge, assocRules, orders, reviews, config };
})();
