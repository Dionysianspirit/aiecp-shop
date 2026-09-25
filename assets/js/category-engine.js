/* 智选云 AI-ECP · 品类引擎（FR-07~10 / BR-01~04 / V-01~12）
   五步链路：语法校验 → 结构语义校验 → 品类树构建 → 衍生能力生成 → 落库发布
   解析契约：全量校验、一次反馈；dry-run 与 commit 分离。 */
window.CategoryEngine = (function(){
  const DATA_TYPES = ["string","integer","decimal","boolean","enum","multiEnum","date","text","image"];
  const CODE_RE = /^[A-Z][A-Z0-9_]{1,63}$/;
  const MAX_NODES = 2000, MAX_ATTRS = 20000, MAX_BYTES = 2 * 1024 * 1024;

  function E(rule, path, detail){ return { rule, path, detail }; }

  /* ① 语法校验 + 规范版本 + 容量约束（V-01 / V-02 / V-12） */
  function parseSyntax(jsonText){
    const errors = [], bytes = new Blob([jsonText]).size;
    if(bytes > MAX_BYTES) errors.push(E("V-12", "<root>", `JSON 文本 ${(bytes/1024).toFixed(0)}KB 超过 2MB 上限`));
    let root = null;
    try { root = JSON.parse(jsonText); }
    catch(err){
      const m = /position (\d+)/.exec(err.message);
      let line = 1, col = 1;
      if(m){
        const upto = jsonText.slice(0, +m[1]);
        const nl = upto.split("\n");
        line = nl.length; col = nl[nl.length-1].length + 1;
      }
      errors.push(E("V-01", "<root>", `JSON 语法错误（第 ${line} 行，第 ${col} 列附近）：${err.message}`));
      return { root: null, errors };
    }
    if(root && root.schemaVersion !== "1.0")
      errors.push(E("V-02", "schemaVersion", `规范版本须为 "1.0"，当前为 ${JSON.stringify(root.schemaVersion)}`));
    if(!root || typeof root.category !== "object" || root.category === null || Array.isArray(root.category))
      errors.push(E("V-11", "category", "必须提供顶层 category 对象"));
    return { root, errors };
  }

  /* ② 结构语义校验（V-03~V-12 全量收集、一次反馈） */
  function validate(root){
    const errors = [], warnings = [];
    if(!root || typeof root !== "object") return { errors, warnings };
    const cat = root.category;
    if(!cat || typeof cat !== "object") return { errors, warnings };
    if(!cat.code || typeof cat.code !== "string") errors.push(E("V-11", "category.code", "品类编码必填"));
    if(!cat.name || typeof cat.name !== "string") errors.push(E("V-11", "category.name", "品类名称必填"));

    let nodeCount = 0, attrCount = 0;
    const seenCodes = new Set(), stack = [];

    function walk(node, path, depth, parentAttrs){
      nodeCount++;
      if(depth > 5){ errors.push(E("V-05", path, `品类树层级深度超过 5 层（当前 ${depth} 层）`)); return; }
      if(stack.includes(node)){ errors.push(E("V-10", path, "检测到循环引用")); return; }
      // 编码
      if(typeof node.code === "string"){
        if(!CODE_RE.test(node.code)) errors.push(E("V-04", `${path}.code`, `编码须匹配 ^[A-Z][A-Z0-9_]{1,63}$，当前为 ${JSON.stringify(node.code)}`));
        if(seenCodes.has(node.code)) errors.push(E("V-03", `${path}.code`, `品类编码重复：${node.code}`));
        seenCodes.add(node.code);
      }
      if(node.name && typeof node.name === "string" && node.name.length > 64)
        errors.push(E("V-11", `${path}.name`, "品类名称长度不超过 64 字符"));
      // 属性
      const attrs = Array.isArray(node.attributes) ? node.attributes : [];
      const codesHere = new Set();
      attrs.forEach((a, i) => {
        attrCount++;
        const ap = `${path}.attributes[${i}]`;
        if(!a.code || typeof a.code !== "string") errors.push(E("V-11", `${ap}.code`, "属性编码必填"));
        else {
          if(codesHere.has(a.code)) errors.push(E("V-06", `${ap}.code`, `同一品类内属性编码重复：${a.code}`));
          if(parentAttrs && parentAttrs[a.code] && parentAttrs[a.code].name !== a.name)
            warnings.push({ path: ap, detail: `属性 ${a.code} 与继承自父品类的同名属性冲突，将按覆盖处理（请确认）` });
          codesHere.add(a.code);
        }
        if(!a.name) errors.push(E("V-11", `${ap}.name`, "属性显示名称必填"));
        if(!DATA_TYPES.includes(a.dataType)) errors.push(E("V-07", `${ap}.dataType`, `数据类型须属于白名单 ${DATA_TYPES.join(" / ")}，当前为 ${JSON.stringify(a.dataType)}`));
        if((a.dataType === "enum" || a.dataType === "multiEnum") && (!Array.isArray(a.options) || a.options.length === 0))
          errors.push(E("V-08", `${ap}.options`, `枚举类型属性 ${a.code || ""} 必须提供非空 options`));
        if(a.range !== undefined){
          if(!Array.isArray(a.range) || a.range.length !== 2 || typeof a.range[0] !== "number" || typeof a.range[1] !== "number" || a.range[0] > a.range[1])
            errors.push(E("V-09", `${ap}.range`, "range 须为两元素数值数组且 min <= max"));
        }
      });
      // 递归
      const merged = Object.assign({}, parentAttrs);
      attrs.forEach(a => { if(a.code) merged[a.code] = a; });
      stack.push(node);
      if(Array.isArray(node.children)) node.children.forEach((c, i) => walk(c, `${path}.children[${i}]`, depth + 1, merged));
      stack.pop();
      node.__merged = merged; // 解析期临时：合并继承属性（不落库）
    }
    walk(cat, "category", 1, null);

    if(nodeCount > MAX_NODES) errors.push(E("V-12", "<root>", `品类节点总数 ${nodeCount} 超过 2000 上限`));
    if(attrCount > MAX_ATTRS) errors.push(E("V-12", "<root>", `属性总数 ${attrCount} 超过 20000 上限`));
    return { errors, warnings };
  }

  /* ③ 品类树构建：折叠为可落库结构，继承属性物化 */
  function buildTree(root){
    function clone(node){
      const n = { code: node.code, name: node.name, sort: node.sort || 0,
        attributes: (node.attributes || []).map(a => Object.assign({}, a)),
        children: (node.children || []).map(clone) };
      if(!n.children.length) delete n.children;
      return n;
    }
    return clone(root.category);
  }
  // 自顶向下物化合并后的属性 Schema（父 → 子继承，子可新增不可覆盖：同名覆盖并告警）
  function materializeSchemas(tree){
    const schemas = {}; // code -> {code,name,attrs:[...]}
    function down(node, inherited){
      const mine = Object.assign({}, inherited);
      (node.attributes || []).forEach(a => { mine[a.code] = a; });
      schemas[node.code] = { code: node.code, name: node.name, attrs: Object.values(mine).map(a => Object.assign({}, a)), leaf: !node.children };
      (node.children || []).forEach(c => down(c, mine));
    }
    down(tree, {});
    return schemas;
  }

  /* ④a 动态表单生成（FR-09）：属性 Schema → 前端表单描述 */
  function generateFormSchema(schema){
    return schema.attrs.map(a => {
      const f = { code: a.code, name: a.name, dataType: a.dataType, required: !!a.required, unit: a.unit || "" };
      if(a.dataType === "enum" || a.dataType === "multiEnum"){ f.control = "select"; f.multiple = a.dataType === "multiEnum"; f.options = a.options || []; }
      else if(a.dataType === "boolean"){ f.control = "switch"; }
      else if(a.dataType === "integer" || a.dataType === "decimal"){ f.control = "number"; if(a.range) f.min = a.range[0], f.max = a.range[1]; }
      else if(a.dataType === "date"){ f.control = "date"; }
      else if(a.dataType === "image"){ f.control = "image"; }
      else { f.control = a.dataType === "text" ? "textarea" : "text"; }
      return f;
    });
  }

  /* ④b 检索索引映射生成（FR-10）：filterable / searchable → 索引字段 */
  function generateIndexMapping(schema){
    const TYPE_MAP = { string: "keyword", integer: "long", decimal: "double", boolean: "boolean",
      enum: "keyword", multiEnum: "keyword", date: "date", text: "text", image: "keyword" };
    const fields = [];
    schema.attrs.forEach(a => {
      if(a.filterable) fields.push({ field: "attr_" + a.code, source: a.code, name: a.name, type: TYPE_MAP[a.dataType] || "keyword", use: "filter" });
      if(a.searchable) fields.push({ field: "attr_" + a.code + "_txt", source: a.code, name: a.name, type: "text", use: "search" });
    });
    return { fields };
  }

  /* 全链路：dry-run 仅校验+预览，不产生副作用 */
  function process(jsonText, mode){
    const syn = parseSyntax(jsonText);
    if(!syn.root) return { ok: false, stage: "syntax", errors: syn.errors, warnings: [] };
    const v = validate(syn.root);
    const tree = buildTree(syn.root);
    const schemas = materializeSchemas(tree);
    // 衍生预览
    let attrCount = 0, indexFields = 0, leaves = 0;
    Object.values(schemas).forEach(s => {
      attrCount += s.attrs.length;
      indexFields += generateIndexMapping(s).fields.length;
      if(s.leaf) leaves++;
    });
    const generated = { nodeCount: Object.keys(schemas).length, leafCount: leaves, attrCount, indexFields,
      formSchemas: Object.fromEntries(Object.entries(schemas).map(([c, s]) => [c, generateFormSchema(s)])),
      indexMappings: Object.fromEntries(Object.entries(schemas).map(([c, s]) => [c, generateIndexMapping(s)])) };
    if(mode === "dryRun") return { ok: v.errors.length === 0, stage: "validate", errors: v.errors, warnings: v.warnings, generated };
    return { ok: v.errors.length === 0, stage: "commit", errors: v.errors, warnings: v.warnings, tree, schemas, generated };
  }

  return { process, generateFormSchema, generateIndexMapping, materializeSchemas, DATA_TYPES };
})();
