// utils/ecpValidGenerator.js
// Purpose: Generate VALID ECP test cases from Data Dictionary + Decision Tree
// using a map-based pipeline.
// Exports:
//  - parseDataDictByMaps(dd): builds conditionMap and actionMap (+ partitions)
//  - parseDecisionTreeByMaps(dt, conditionMap, actionMap): extracts rules
//  - generateValidEcpFromRules(rules, conditionMap, actionMap): test cases
//  - generateValidEcpFromFiles(dd, dt): high-level convenience (valid cases)
// Inputs: Buffer or file path for XMLs. Output: Array<{ testCaseID, type, inputs, expected }> (type='Valid')

const { parseXMLFile } = require('../xmlParser');

const ensureArray = (x) => (Array.isArray(x) ? x : (x ? [x] : []));

async function parseDataDictByMaps(dataDictPath) {
  const doc = await parseXMLFile(dataDictPath);
  const uc = doc?.UC?.Usecase;
  if (!uc) throw new Error('Invalid data dictionary XML');

  const inputs = ensureArray(uc.Input);
  const outputs = ensureArray(uc.Output);

  const conditionMap = new Map(); // id -> { id, varId, varName, dataType, scale, kind, min, max, value }
  const partitions = [];

  for (const inp of inputs) {
    if (!inp) continue;
    const varId = String(inp.VarID ?? '').trim();
    const varName = String(inp.Varname ?? '').trim();
    const dataType = String(inp.DataType ?? '').trim();
    const scale = String(inp.Scale ?? '').trim();

    const conds = ensureArray(inp.Condition);
    if (conds.length > 0) {
      const group = { name: varName, items: [] };
      for (const c of conds) {
        const cAttrs = c.$ || {};
        const id = String(cAttrs.id ?? '').trim();
        if (!id) continue;
        const valueAttr = cAttrs.value != null ? String(cAttrs.value) : undefined;
        const minAttr = cAttrs.min != null ? Number(cAttrs.min) : undefined;
        const maxAttr = cAttrs.max != null ? Number(cAttrs.max) : undefined;
        const kind = valueAttr != null ? 'nominal' : 'range';

        conditionMap.set(id, {
          id,
          varId,
          varName,
          dataType,
          scale,
          kind,
          value: valueAttr,
          min: minAttr,
          max: maxAttr,
        });

        const label =
          kind === 'nominal'
            ? `${varName} = ${valueAttr}`
            : `${varName} ∈ [${minAttr}..${maxAttr}]`;
        group.items.push({ id, label });
      }
      if (group.items.length) partitions.push(group);
    }
  }

  const actionMap = new Map(); // id -> { id, varId, varName, value }
  for (const out of outputs) {
    if (!out) continue;
    const varId = String(out.VarID ?? '').trim();
    const varName = String(out.Varname ?? '').trim();
    const acts = ensureArray(out.Action);
    for (const a of acts) {
      const aAttrs = a.$ || {};
      const id = String(aAttrs.id ?? '').trim();
      if (!id) continue;
      actionMap.set(id, {
        id,
        varId,
        varName,
        value: String(aAttrs.value ?? '').trim(),
      });
    }
  }

  return { conditionMap, actionMap, partitions };
}

function parseDecisionTreeByMapsSync(doc, conditionMap, actionMap) {
  const root = doc?.DecisionTree?.DecisionS;
  if (!root) throw new Error('Invalid decision tree XML');
  const decisions = ensureArray(root.Decision);
  const rules = [];

  const walk = (node, pathRefIds) => {
    if (!node || typeof node !== 'object') return;
    // ACTION leaf
    if (node.ACTION) {
      const actionAttrs = (node.ACTION.$ || {});
      const actionId = String(actionAttrs.refid ?? '').trim();
      if (!actionId) return;
      const unknown = pathRefIds.filter((rid) => !conditionMap.has(rid));
      if (unknown.length) return; // skip invalid rule
      if (!actionMap.has(actionId)) return; // unknown action id
      rules.push({ conditionRefIds: [...pathRefIds], actionId });
      return;
    }
    // Dive into child Conditions (may be array or single)
    const conds = ensureArray(node.Condition);
    for (const c of conds) {
      const cAttrs = c.$ || {};
      const rid = String(cAttrs.refid ?? '').trim();
      if (!rid) continue;
      if (!conditionMap.has(rid)) continue;
      walk(c, [...pathRefIds, rid]);
    }
  };

  for (const d of decisions) walk(d, []);
  return rules;
}

async function parseDecisionTreeByMaps(decisionTreePath, conditionMap, actionMap) {
  const doc = await parseXMLFile(decisionTreePath);
  return parseDecisionTreeByMapsSync(doc, conditionMap, actionMap);
}

function pickRepresentative(cond) {
  if (!cond) return null;
  if (cond.kind === 'nominal') return cond.value;
  const min = Number(cond.min);
  const max = Number(cond.max);
  if (Number.isFinite(min) && Number.isFinite(max)) {
    const mid = (min + max) / 2;
    const t = (cond.dataType || '').toLowerCase();
    if (t === 'integer' || t === 'int' || t === 'long') return Math.round(mid);
    // For decimal/float-like types, round to 2 decimal places
    const rounded = Math.round(mid * 100) / 100;
    return Number(rounded.toFixed(2));
  }
  return null;
}

function generateValidEcpFromRules(rules, conditionMap, actionMap) {
  const testCases = [];
  let seq = 1;
  for (const rule of rules) {
    const inputs = {};
    for (const rid of rule.conditionRefIds) {
      const cond = conditionMap.get(rid);
      const value = pickRepresentative(cond);
      inputs[cond.varName] = value;
    }
    const action = actionMap.get(rule.actionId);
    const expected = {};
    expected[action.varName] = String(action.value);
    testCases.push({
      testCaseID: `TC${String(seq).padStart(3, '0')}`,
      type: 'Valid',
      inputs,
      expected,
    });
    seq += 1;
  }
  return testCases;
}

async function generateValidEcpFromFiles(dataDictPath, decisionTreePath) {
  const { conditionMap, actionMap } = await parseDataDictByMaps(dataDictPath);
  const rules = await parseDecisionTreeByMaps(decisionTreePath, conditionMap, actionMap);
  return generateValidEcpFromRules(rules, conditionMap, actionMap);
}

module.exports = {
  parseDataDictByMaps,
  parseDecisionTreeByMaps,
  generateValidEcpFromRules,
  generateValidEcpFromFiles,
};