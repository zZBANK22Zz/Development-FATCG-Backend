const xml2js = require('xml2js');
const { v4: uuidv4 } = require('uuid');

/**
 * handleFtaXml(xmlString)
 * - parse XML
 * - build fault tree (nodes/edges)
 * - derive fault scenarios (paths)
 * - generate test cases (inputs that trigger each basic event)
 *
 * Returns:
 * {
 *   total: N,
 *   testCases: [{ id, type:'fault', description, inputs, triggers: [basicEventIds] }],
 *   faultTree: { nodes: [{id,label,type}], edges: [{from,to}] }
 * }
 */

async function handleFtaXml(xml) {
  const parser = new xml2js.Parser({ explicitArray: false, trim: true });
  const parsed = await parser.parseStringPromise(xml);

  // support both single <faultPattern> or root containing multiple
  const root = parsed.faultPattern || parsed;
  // Normalize: allow an array of patterns
  const patterns = Array.isArray(root) ? root : (root.type ? [root] : (root.pattern ? toArray(root.pattern) : []));

  // If top-level contains multiple patterns as children:
  const extractedPatterns = [];
  if (root && root.pattern) {
    const toArray = (a) => Array.isArray(a) ? a : (a ? [a] : []);
    toArray(root.pattern).forEach(p => extractedPatterns.push(p));
  } else if (Array.isArray(root)) {
    root.forEach(p => extractedPatterns.push(p));
  } else if (root && root.$ && root.$.type) {
    extractedPatterns.push(root);
  } else if (root && root.type) {
    extractedPatterns.push(root);
  } else {
    // fallback: if parsed has topEvent or mappings etc treat as single pattern
    extractedPatterns.push(root);
  }

  // We'll build a unified faultTree model
  const nodes = [];
  const edges = [];
  const testCases = [];

  // Utility: add node
  const addNode = (label, type = 'basic') => {
    const id = uuidv4();
    nodes.push({ id, label, type });
    return id;
  };

  // For each pattern, build sub-tree and testcases
  for (const p of extractedPatterns) {
    const type = (p.$ && p.$.type) || p.type || (p['$'] && p['$'].type) || p['@'] && p['@'].type || p['pattern'] && p['pattern'].$ && p['pattern'].$.type || (p['$'] && p['$'].type) || (p['patternType']);
    const topName = (p.$ && p.$.name) || p.name || (p.topEvent && p.topEvent.$ && p.topEvent.$.name) || (p.topEvent && p.topEvent.label) || `TopEvent-${Math.random().toString(36).slice(2,6)}`;
    const topId = addNode(topName, 'top');

    if (type === 'invalid-range' || (p.$ && p.$.type === 'invalid-range') || p.type === 'invalid-range') {
      // parse variables -> each invalid range becomes basic event
      const vars = p.variables && p.variables.var ? (Array.isArray(p.variables.var) ? p.variables.var : [p.variables.var]) : [];
      for (const v of vars) {
        const varName = v.$?.name || v.name;
        // invalid entries may be child nodes <invalid>
        const invalids = [];
        if (v.invalid) {
          if (Array.isArray(v.invalid)) invalids.push(...v.invalid);
          else invalids.push(v.invalid);
        }
        // create a basic event node for each invalid token
        for (const inv of invalids) {
          const label = `${varName} = ${inv}`.trim();
          const nid = addNode(label, 'basic');
          edges.push({ from: nid, to: topId }); // basic -> top
          // Generate test case that sets this var to the invalid value, others to "nominal"
          const inputs = {};
          inputs[varName] = inv;
          testCases.push({
            id: `FCT-${testCases.length + 1}`,
            type: 'fault',
            description: `Trigger ${label}`,
            inputs,
            triggers: [nid]
          });
        }
      }
    } else if (type === 'invalid-mapping' || p.type === 'invalid-mapping' || (p.mappings)) {
      // mapping entries -> each mapping becomes an intermediate event path
      const mappings = p.mappings && p.mappings.mapping ? (Array.isArray(p.mappings.mapping) ? p.mappings.mapping : [p.mappings.mapping]) : (p.mapping ? (Array.isArray(p.mapping) ? p.mapping : [p.mapping]) : []);
      for (const m of mappings) {
        const desc = m.description || (m.$ && m.$.description) || 'Invalid Mapping';
        const mid = addNode(desc, 'intermediate');
        edges.push({ from: mid, to: topId });
        // conditions/conds -> basic events
        const conds = m.conditions && m.conditions.cond ? (Array.isArray(m.conditions.cond) ? m.conditions.cond : [m.conditions.cond]) : (m.cond ? (Array.isArray(m.cond) ? m.cond : [m.cond]) : []);
        const triggers = [];
        const inputs = {};
        for (const c of conds) {
          const varName = c.$?.var || c.var;
          const val = (typeof c === 'string') ? c : (c._ || c);
          const label = `${varName} = ${val}`.trim();
          const bid = addNode(label, 'basic');
          edges.push({ from: bid, to: mid });
          triggers.push(bid);
          inputs[varName] = val;
        }
        testCases.push({
          id: `FCT-${testCases.length + 1}`,
          type: 'fault',
          description: `Mapping: ${desc}`,
          inputs,
          triggers
        });
      }
    } else if (type === 'safety-property' || p.type === 'safety-property' || p.property || p.properties) {
      // safety properties: each property creates an intermediate + basic triggers
      const props = p.property ? (Array.isArray(p.property) ? p.property : [p.property]) : (p.properties && p.properties.property ? (Array.isArray(p.properties.property) ? p.properties.property : [p.properties.property]) : []);
      if (props.length === 0 && p.$ && p.$.description) {
        // fallback single property
        const pid = addNode(p.$.description, 'property');
        edges.push({ from: pid, to: topId });
        testCases.push({ id: `FCT-${testCases.length+1}`, type: 'fault', description: p.$.description, inputs: {}, triggers: [pid] });
      } else {
        for (const pr of props) {
          const desc = pr.$?.description || pr.description || pr._ || JSON.stringify(pr);
          const pid = addNode(desc, 'property');
          edges.push({ from: pid, to: topId });
          // we may have conds similar to mapping
          const conds = pr.conditions && pr.conditions.cond ? (Array.isArray(pr.conditions.cond) ? pr.conditions.cond : [pr.conditions.cond]) : [];
          const inputs = {};
          const triggers = [];
          for (const c of conds) {
            const varName = c.$?.var || c.var;
            const val = (typeof c === 'string') ? c : (c._ || c);
            const label = `${varName} = ${val}`.trim();
            const bid = addNode(label, 'basic');
            edges.push({ from: bid, to: pid });
            triggers.push(bid);
            inputs[varName] = val;
          }
          testCases.push({
            id: `FCT-${testCases.length + 1}`,
            type: 'fault',
            description: `Property: ${desc}`,
            inputs,
            triggers
          });
        }
      }
    } else {
      // Generic: if XML already provided a <topEvent> structure, try to map it
      if (p.topEvent) {
        // simple recursion could be added — but minimal fallback: flatten basic events under top
        const t = p.topEvent;
        const tname = t.$?.name || t.label || 'TopEvent';
        const tid = addNode(tname, 'top');
        if (t.basicEvent) {
          const bes = Array.isArray(t.basicEvent) ? t.basicEvent : [t.basicEvent];
          for (const be of bes) {
            const lbl = be.$?.label || be.label || be;
            const bid = addNode(lbl, 'basic');
            edges.push({ from: bid, to: tid });
            testCases.push({
              id: `FCT-${testCases.length + 1}`,
              type: 'fault',
              description: `Basic ${lbl}`,
              inputs: {},
              triggers: [bid]
            });
          }
        }
      }
    }
  } // end for patterns

  // Deduplicate nodes by label (simple)
  const uniq = {};
  const finalNodes = [];
  const labelToId = {};
  for (const n of nodes) {
    if (!uniq[n.label]) {
      uniq[n.label] = true;
      finalNodes.push(n);
      labelToId[n.label] = n.id;
    } else {
      // if duplicate label, map edges/triggers to first id
    }
  }

  // Map edges to unique node ids (by label) — edges already use generated ids, but duplicates may exist.
  // For simplicity, keep edges as-is. Frontend can lay out graph.

  return {
    total: testCases.length,
    testCases,
    faultTree: { nodes: finalNodes, edges }
  };
}

module.exports = { handleFtaXml };