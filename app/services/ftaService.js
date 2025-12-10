const xml2js = require('xml2js');
const { v4: uuidv4 } = require('uuid');
const FtaModel = require('../model/ftaModel');

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

async function handleFtaXml(xml, userId = null) {
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

  // Utility: parse basic event from XML (supports both new format and legacy format)
  // New format: <basicEvent id="101" min="1" max="2"/> (Integer) or <basicEvent id="201" value="Regular"/> (String)
  // Legacy format: <basicEvent name="< 30 km/h"/>
  const parseBasicEvent = (be) => {
    const attrs = be.$ || {};
    const beId = attrs.id || null;
    const min = attrs.min !== undefined && attrs.min !== null ? String(attrs.min).trim() : null;
    const max = attrs.max !== undefined && attrs.max !== null ? String(attrs.max).trim() : null;
    const value = attrs.value !== undefined && attrs.value !== null ? String(attrs.value).trim() : null;
    const name = attrs.name || be.name || be._ || String(be);
    
    // Check if it's new format (has id and either (min+max) or value)
    if (beId && (min !== null || max !== null || value !== null)) {
      // New format
      if (min !== null && max !== null && min !== '' && max !== '') {
        // Integer format: id, min, max
        return {
          format: 'new',
          type: 'Integer',
          id: beId,
          min: min,
          max: max,
          label: `[${beId}] Range: ${min}-${max}`,
          inputs: { id: beId, min: min, max: max }
        };
      } else if (value !== null && value !== '') {
        // String format: id, value
        return {
          format: 'new',
          type: 'String',
          id: beId,
          value: value,
          label: `[${beId}] Value: ${value}`,
          inputs: { id: beId, value: value }
        };
      }
    }
    
    // Legacy format: use name attribute
    return {
      format: 'legacy',
      type: 'String',
      name: name,
      label: name,
      inputs: { name: name }
    };
  };

  // Extract pattern type and system name from XML
  let faultPatternType = null;
  let systemName = null;
  let testCaseName = null;

  // For each pattern, build sub-tree and testcases
  for (const p of extractedPatterns) {
    const type = (p.$ && p.$.type) || p.type || (p['$'] && p['$'].type) || p['@'] && p['@'].type || p['pattern'] && p['pattern'].$ && p['pattern'].$.type || (p['$'] && p['$'].type) || (p['patternType']);
    faultPatternType = type || 'unknown';
    
    // Extract system name from pattern name attribute
    const patternName = (p.$ && p.$.name) || p.name || 'Unknown System';
    systemName = patternName;
    
    // Extract test case name from topEvent
    const topName = (p.topEvent && p.topEvent.$ && p.topEvent.$.name) || (p.topEvent && p.topEvent.label) || patternName;
    testCaseName = topName || `FTA_${Date.now()}`;
    
    const topId = addNode(topName, 'top');

    if (type === 'invalid-range' || (p.$ && p.$.type === 'invalid-range') || p.type === 'invalid-range') {
      // Check if hierarchical structure exists (topEvent -> intermediateEvent -> basicEvent)
      if (p.topEvent && p.topEvent.intermediateEvent) {
        // Process hierarchical structure with intermediate events
        const topEvent = p.topEvent;
        const intermediateEvents = topEvent.intermediateEvent ? 
          (Array.isArray(topEvent.intermediateEvent) ? topEvent.intermediateEvent : [topEvent.intermediateEvent]) : [];
        
        // Process each intermediate event
        for (const ie of intermediateEvents) {
          const ieName = ie.$?.name || ie.name || 'Intermediate Event';
          const ieId = addNode(ieName, 'intermediate');
          edges.push({ from: ieId, to: topId });
          
          // Get basic events for this intermediate event
          const basicEvents = ie.basicEvent ? 
            (Array.isArray(ie.basicEvent) ? ie.basicEvent : [ie.basicEvent]) : [];
          
          // Generate one test case per basic event
          for (const be of basicEvents) {
            const parsedBe = parseBasicEvent(be);
            const beNodeId = addNode(parsedBe.label, 'basic');
            edges.push({ from: beNodeId, to: ieId });
            
            // Use parsed inputs from new format or parse from legacy format
            let inputs = {};
            if (parsedBe.format === 'new') {
              // New format: use parsed inputs directly
              inputs = parsedBe.inputs;
            } else {
              // Legacy format: parse inputs from basic event name (e.g., "Age = <0" or "Age = >120")
              const match = parsedBe.name.match(/(\w+)\s*=\s*(.+)/);
              if (match) {
                const [, varName, value] = match;
                inputs[varName] = value.trim();
              } else {
                // Fallback: use the whole name as a single input
                inputs[parsedBe.name] = '';
              }
            }
            
            testCases.push({
              id: `FCT-${testCases.length + 1}`,
              type: 'fault',
              description: `${ieName}: ${parsedBe.label}`,
              inputs,
              triggers: [beNodeId]
            });
          }
        }
      } else {
        // Original format: parse variables -> each invalid range becomes basic event
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
      }
    } else if (type === 'invalid-mapping' || p.type === 'invalid-mapping' || (p.mappings)) {
      // For invalid-mapping, use conditions from mappings section to create intermediate events
      // Each condition maps to a stage (RISK, INJURY, FAILURE, etc.), which becomes an intermediate event
      // Basic events come from topEvent section and are mapped to appropriate intermediate events
      
      // Read mappings section to extract conditions and their stages
      const mappings = p.mappings && p.mappings.mapping ? (Array.isArray(p.mappings.mapping) ? p.mappings.mapping : [p.mappings.mapping]) : (p.mapping ? (Array.isArray(p.mapping) ? p.mapping : [p.mapping]) : []);
      
      // Map to store stage -> intermediate event ID
      const stageToIntermediateId = new Map();
      
      // First pass: Create intermediate events from conditions in mappings section
      // Each condition has a value (stage) that becomes an intermediate event
      for (const m of mappings) {
        const conds = m.conditions && m.conditions.cond ? (Array.isArray(m.conditions.cond) ? m.conditions.cond : [m.conditions.cond]) : (m.cond ? (Array.isArray(m.cond) ? m.cond : [m.cond]) : []);
        
        for (const c of conds) {
          const condVar = c.$?.var || c.var || '';
          const condValue = (typeof c === 'string') ? c : (c._ || c || '');
          
          // Extract stage from condition value (e.g., "RISK", "INJURY", "FAILURE")
          // The stage is the value part of the condition
          const stage = condValue.trim();
          
          if (stage && !stageToIntermediateId.has(stage)) {
            // Create intermediate event for this stage
            const ieName = `Incorrect ${stage} stage`;
            const ieId = addNode(ieName, 'intermediate');
            edges.push({ from: ieId, to: topId });
            stageToIntermediateId.set(stage, ieId);
          }
        }
      }
      
      // Second pass: Process basic events from topEvent section and map them to intermediate events
      if (p.topEvent) {
        const topEvent = p.topEvent;
        const topEventName = topEvent.$?.name || topEvent.name || topName || 'TopEvent';
        
        // Get intermediate events from topEvent (these are the groups)
        const intermediateEvents = topEvent.intermediateEvent ? 
          (Array.isArray(topEvent.intermediateEvent) ? topEvent.intermediateEvent : [topEvent.intermediateEvent]) : [];
        
        // Process each intermediate event group from topEvent
        for (const ie of intermediateEvents) {
          const ieGroupName = ie.$?.name || ie.name || 'Intermediate Event';
          
          // Get basic events for this intermediate event group
          const basicEvents = ie.basicEvent ? 
            (Array.isArray(ie.basicEvent) ? ie.basicEvent : [ie.basicEvent]) : [];
          
          // For each basic event, try to determine which stage it belongs to
          // by matching against conditions in mappings
          for (const be of basicEvents) {
            const parsedBe = parseBasicEvent(be);
            const beId = addNode(parsedBe.label, 'basic');
            const beName = parsedBe.label; // Use parsed label for matching
            
            // Try to find matching stage by checking conditions
            // Match basic events to stages based on variable ranges (generic, works with any variable name)
            let matchedStage = null;
            let matchedIeId = null;
            
            // Extract variable range from text (generic function, works with any variable name)
            // Examples: "GFR ≥ 90", "GFR 60-89", "BP = 120-140", "Temperature < 0"
            const extractVariableRange = (text) => {
              // Remove curly braces and other formatting
              const cleanText = text.replace(/[{}]/g, '').trim();
              
              // Match patterns: VAR >= 90, VAR ≥ 90, VAR 60-89, VAR = 15–29, VAR < 15
              // Generic pattern: any variable name followed by operator and number(s)
              // First try with operator: VAR >= 90, VAR = 60-89
              let rangeMatch = cleanText.match(/(\w+)\s*(>=|≥|>|<=|≤|<|=)\s*(\d+)(?:\s*[-–]\s*(\d+))?/i);
              if (rangeMatch) {
                const varName = rangeMatch[1];
                const operator = rangeMatch[2] || '=';
                const start = parseInt(rangeMatch[3]);
                const end = rangeMatch[4] ? parseInt(rangeMatch[4]) : null;
                return { varName, operator, start, end };
              }
              // Try without operator: VAR 60–89
              rangeMatch = cleanText.match(/(\w+)\s+(\d+)(?:\s*[-–]\s*(\d+))?/i);
              if (rangeMatch) {
                const varName = rangeMatch[1];
                const start = parseInt(rangeMatch[2]);
                const end = rangeMatch[3] ? parseInt(rangeMatch[3]) : null;
                return { varName, operator: '=', start, end };
              }
              return null;
            };
            
            const beRange = extractVariableRange(beName);
            
            // Check each mapping to find which stage this basic event belongs to
            // Priority: match by variable range first, then by stage name
            for (const m of mappings) {
              const conds = m.conditions && m.conditions.cond ? (Array.isArray(m.conditions.cond) ? m.conditions.cond : [m.conditions.cond]) : (m.cond ? (Array.isArray(m.cond) ? m.cond : [m.cond]) : []);
              
              for (const c of conds) {
                const condVar = c.$?.var || c.var || '';
                const condValue = (typeof c === 'string') ? c : (c._ || c || '');
                const stage = condValue.trim();
                
                // Extract variable range from condition variable
                const condRange = extractVariableRange(condVar);
                
                // Match if variable ranges overlap or match (and same variable name)
                if (beRange && condRange && beRange.varName && condRange.varName) {
                  // Check if same variable name (case-insensitive)
                  const sameVariable = beRange.varName.toLowerCase() === condRange.varName.toLowerCase();
                  
                  if (sameVariable) {
                    let matches = false;
                    
                    // Check if ranges match based on values
                    if (beRange.start !== null && condRange.start !== null) {
                      // Case 1: Both are ranges (e.g., "VAR 60-89" vs "VAR = 60–89")
                      if (beRange.end && condRange.end) {
                        // Check if ranges overlap or match exactly
                        matches = (beRange.start === condRange.start && beRange.end === condRange.end) ||
                                  (beRange.start <= condRange.end && beRange.end >= condRange.start);
                      }
                      // Case 2: Both are single values with >= operator (e.g., "VAR ≥ 90" vs "VAR ≥ 90")
                      else if (!beRange.end && !condRange.end) {
                        // Match if same value and both use >= or ≥
                        if ((beRange.operator.match(/>=|≥/) && condRange.operator.match(/>=|≥/)) ||
                            (beRange.operator === '=' && condRange.operator === '=')) {
                          matches = (beRange.start === condRange.start);
                        }
                      }
                      // Case 3: be is range, cond is single value
                      else if (beRange.end && !condRange.end) {
                        // Check if cond value is within be range
                        matches = (condRange.start >= beRange.start && condRange.start <= beRange.end);
                      }
                      // Case 4: be is single value with >=, cond is range
                      else if (!beRange.end && condRange.end) {
                        // For >= operator, check if be start is within cond range
                        if (beRange.operator.match(/>=|≥/)) {
                          matches = (beRange.start >= condRange.start && beRange.start <= condRange.end);
                        }
                      }
                    }
                    
                    if (matches) {
                      matchedStage = stage;
                      matchedIeId = stageToIntermediateId.get(stage);
                      break;
                    }
                  }
                } else {
                  // Fallback: try simple string matching if range extraction failed
                  const beMatches = beName.toLowerCase();
                  const condMatches = condVar.toLowerCase();
                  // Extract variable name from condition (before operator)
                  const varName = condMatches.split(/[<>=≥≤]/)[0]?.trim() || '';
                  if (varName && beMatches.includes(varName.toLowerCase())) {
                    matchedStage = stage;
                    matchedIeId = stageToIntermediateId.get(stage);
                    break;
                  }
                }
              }
              if (matchedStage) break;
            }
            
            // If no match found, use the first intermediate event from topEvent structure
            // Or create a default intermediate event
            if (!matchedIeId) {
              // Use the intermediate event group name from topEvent as fallback
              if (!stageToIntermediateId.has(ieGroupName)) {
                const fallbackIeId = addNode(ieGroupName, 'intermediate');
                edges.push({ from: fallbackIeId, to: topId });
                stageToIntermediateId.set(ieGroupName, fallbackIeId);
              }
              matchedIeId = stageToIntermediateId.get(ieGroupName);
            }
            
            // Connect basic event to intermediate event
            if (matchedIeId) {
              edges.push({ from: beId, to: matchedIeId });
            } else {
              // Last resort: connect to top event
              edges.push({ from: beId, to: topId });
            }
            
            // Parse inputs from basic event (new format or legacy format)
            let inputs = {};
            if (parsedBe.format === 'new') {
              // New format: use parsed inputs directly
              inputs = parsedBe.inputs;
            } else {
              // Legacy format: parse inputs from basic event name
              const parts = beName.split(/and|&/i).map(p => p.trim());
              for (const part of parts) {
                const match = part.match(/(\w+)\s*(>=|<=|>|<|=)\s*(.+)/);
                if (match) {
                  const [, varName, operator, value] = match;
                  inputs[varName] = `${operator}${value}`.trim();
                } else {
                  const simpleMatch = part.match(/(\w+)\s+(.+)/);
                  if (simpleMatch) {
                    const [, varName, value] = simpleMatch;
                    inputs[varName] = value.trim();
                  }
                }
              }
            }
            
            testCases.push({
              id: `FCT-${testCases.length + 1}`,
              type: 'fault',
              description: `${matchedStage ? `Incorrect ${matchedStage} stage` : ieGroupName}: ${parsedBe.label}`,
              inputs,
              triggers: [beId]
            });
          }
        }
      } else {
        // Fallback: if no topEvent, use mappings section directly (backward compatibility)
        for (const m of mappings) {
          const desc = m.description || (m.$ && m.$.description) || 'Invalid Mapping';
          const mid = addNode(desc, 'intermediate');
          edges.push({ from: mid, to: topId });
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
      }
    } else if (type === 'safety-property' || p.type === 'safety-property' || p.property || p.properties) {
      // For safety-property, read from hierarchical structure: topEvent -> intermediateEvent -> basicEvent
      // This generates one test case per basic event (same as Invalid Mapping)
      
      // First, read properties section for data definition (optional, for backward compatibility)
      const props = p.property ? (Array.isArray(p.property) ? p.property : [p.property]) : (p.properties && p.properties.property ? (Array.isArray(p.properties.property) ? p.properties.property : [p.properties.property]) : []);
      
      // Read hierarchical structure from topEvent
      if (p.topEvent) {
        const topEvent = p.topEvent;
        const topEventName = topEvent.$?.name || topEvent.name || topName || 'TopEvent';
        
        // Get intermediate events from topEvent
        const intermediateEvents = topEvent.intermediateEvent ? 
          (Array.isArray(topEvent.intermediateEvent) ? topEvent.intermediateEvent : [topEvent.intermediateEvent]) : [];
        
        // Process each intermediate event
        for (const ie of intermediateEvents) {
          const ieName = ie.$?.name || ie.name || 'Intermediate Event';
          const ieId = addNode(ieName, 'intermediate');
          edges.push({ from: ieId, to: topId });
          
          // Get basic events for this intermediate event
          const basicEvents = ie.basicEvent ? 
            (Array.isArray(ie.basicEvent) ? ie.basicEvent : [ie.basicEvent]) : [];
          
          // Generate one test case per basic event
          for (const be of basicEvents) {
            const parsedBe = parseBasicEvent(be);
            const beId = addNode(parsedBe.label, 'basic');
            edges.push({ from: beId, to: ieId });
            
            // Parse inputs from basic event (new format or legacy format)
            let inputs = {};
            if (parsedBe.format === 'new') {
              // New format: use parsed inputs directly
              inputs = parsedBe.inputs;
            } else {
              // Legacy format: For safety-property, basic events are descriptions
              // Try to parse inputs from basic event name if it contains condition patterns
              // Otherwise, use basic event name as input key with description as value
              let hasParsedInputs = false;
              
              // Try parsing only if the name looks like a condition expression
              // Look for patterns like "VAR = VALUE", "VAR >= VALUE", etc.
              const parts = parsedBe.name.split(/and|&/i).map(p => p.trim());
              for (const part of parts) {
                // Try to match patterns like "GFR >= 90", "GFR = 30-59", "UO < 30"
                const match = part.match(/(\w+)\s*(>=|<=|>|<|=)\s*(.+)/);
                if (match) {
                  const [, varName, operator, value] = match;
                  inputs[varName] = `${operator}${value}`.trim();
                  hasParsedInputs = true;
                } else {
                  // Fallback: try simple "VAR VALUE" pattern (only if it looks like a condition)
                  const simpleMatch = part.match(/(\w+)\s+(.+)/);
                  if (simpleMatch) {
                    const [, varName, value] = simpleMatch;
                    // Only add if value looks like a number or condition value
                    if (/[\d<>=]/.test(value)) {
                      inputs[varName] = value.trim();
                      hasParsedInputs = true;
                    }
                  }
                }
              }
              
              // If no inputs were parsed, use basic event name as input key
              // This ensures test cases have meaningful input data even for descriptive basic events
              if (!hasParsedInputs) {
                // Use a generic key like "event" or "condition" with the basic event name as value
                // Or extract key components from the description
                const eventKey = 'event';
                inputs[eventKey] = parsedBe.name.trim();
              }
            }
            
            testCases.push({
              id: `FCT-${testCases.length + 1}`,
              type: 'fault',
              description: `${ieName}: ${parsedBe.label}`,
              inputs,
              triggers: [beId]
            });
          }
        }
      } else {
        // Fallback: if no hierarchical structure, use properties section (backward compatibility)
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
            const parsedBe = parseBasicEvent(be);
            const bid = addNode(parsedBe.label, 'basic');
            edges.push({ from: bid, to: tid });
            
            // Use parsed inputs from new format or empty for legacy
            const inputs = parsedBe.format === 'new' ? parsedBe.inputs : {};
            
            testCases.push({
              id: `FCT-${testCases.length + 1}`,
              type: 'fault',
              description: `Basic ${parsedBe.label}`,
              inputs,
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

  const result = {
    total: testCases.length,
    testCases,
    faultTree: { nodes: finalNodes, edges }
  };

  // Save FTA data to database if userId is provided
  if (userId) {
    try {
      // Pass result object directly as JSONB (PostgreSQL will handle conversion)
      await FtaModel.saveFta(userId, result, faultPatternType, systemName, testCaseName);
      console.log(`FTA data saved for user ${userId}: ${testCaseName}`);
    } catch (dbError) {
      console.error('Error saving FTA data to database:', dbError);
      // Don't fail the request if database save fails, just log the error
    }
  }

  return result;
}

module.exports = { handleFtaXml };