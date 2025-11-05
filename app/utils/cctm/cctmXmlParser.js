const fs = require('fs');
const { parseStringPromise } = require('xml2js');

/**
 * Parse range string like "0-30", "30.1-120", "-inf-0, >300", "0", "60.1-100"
 * Returns { min, max, valid } or null if cannot parse
 */
function parseRangeString(rangeStr) {
  if (!rangeStr || typeof rangeStr !== 'string') return null;
  
  const trimmed = rangeStr.trim();
  
  // Handle infinity cases (e.g., "-inf-0, >300")
  if (trimmed.includes('-inf') || trimmed.includes('inf') || trimmed.includes('>') || trimmed.includes('<')) {
    // For comma-separated invalid ranges, we'll use the first part as the primary range
    // and mark the whole thing as invalid
    const parts = trimmed.split(',').map(s => s.trim());
    const firstPart = parts[0];
    
    if (firstPart.startsWith('-inf')) {
      // Extract max value (e.g., "-inf-0" -> min: -Infinity, max: 0)
      const match = firstPart.match(/-inf-(\d+\.?\d*)/);
      if (match) {
        return { min: -Infinity, max: Number(match[1]), valid: false };
      }
    } else if (firstPart.startsWith('>')) {
      // Extract min value (e.g., ">300" -> min: 300.1, max: Infinity)
      const match = firstPart.match(/>(\d+\.?\d*)/);
      if (match) {
        return { min: Number(match[1]) + 0.1, max: Infinity, valid: false };
      }
    } else if (firstPart.startsWith('<')) {
      // Extract max value (e.g., "<0" -> min: -Infinity, max: -0.1)
      const match = firstPart.match(/<(\d+\.?\d*)/);
      if (match) {
        return { min: -Infinity, max: Number(match[1]) - 0.1, valid: false };
      }
    } else if (firstPart.includes('-')) {
      const [minStr, maxStr] = firstPart.split('-').map(s => s.trim());
      return { 
        min: minStr === '-inf' ? -Infinity : Number(minStr), 
        max: maxStr === 'inf' || maxStr === '∞' ? Infinity : Number(maxStr),
        valid: false
      };
    }
    
    // If we can't parse the first part, return a generic invalid range
    return { min: -Infinity, max: Infinity, valid: false };
  }
  
  // Handle single value like "0"
  if (!trimmed.includes('-')) {
    const num = Number(trimmed);
    if (!isNaN(num)) {
      return { min: num, max: num, valid: true };
    }
    // Could be boolean or enum value
    if (trimmed === 'true') return { min: undefined, max: undefined, values: [true], valid: true };
    if (trimmed === 'false') return { min: undefined, max: undefined, values: [false], valid: true };
    return { min: undefined, max: undefined, values: [trimmed], valid: true };
  }
  
  // Handle range like "0-30" or "30.1-120"
  const parts = trimmed.split('-').map(s => s.trim());
  if (parts.length === 2) {
    const min = Number(parts[0]);
    const max = Number(parts[1]);
    if (!isNaN(min) && !isNaN(max)) {
      return { min, max, valid: true };
    }
  }
  
  return null;
}

/**
 * parseCctmXml(filePath) -> Promise<Variable[]>
 * Variable: { name, type, terminalClasses: [ { id, label, min, max, values, valid } ] }
 * 
 * Supports:
 * 1. classificationTrees structure (with treeVersion wrapper)
 * 2. classificationTree structure (single tree format)
 * 3. DataDictionary structure (old format for backward compatibility)
 * 4. Draw.io mxfile format (diagrams.net)
 */
async function parseCctmXml(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  
  // Check if it's a draw.io format
  if (xml.includes('<mxfile') || xml.includes('<mxGraphModel')) {
    const { parseDrawioXml } = require('./drawioXmlParser');
    return await parseDrawioXml(xml);
  }
  
  const doc = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true });

  let variables = [];
  let useCase = null;
  let output = null;

  // Try classificationTrees structure (with treeVersion wrapper)
  if (doc.classificationTrees?.treeVersion) {
    const treeVersions = [].concat(doc.classificationTrees.treeVersion || []);
    // Use the latest version (last one) or first one if only one
    const treeVersion = treeVersions.length > 0 ? treeVersions[treeVersions.length - 1] : null;
    
    if (treeVersion?.useCase) {
      const uc = Array.isArray(treeVersion.useCase) 
        ? treeVersion.useCase[0] 
        : treeVersion.useCase;
      
      useCase = {
        id: (uc.$ && uc.$.id) || uc.id || 'default',
        name: (uc.$ && uc.$.name) || uc.name || 'Use Case',
        description: uc.description || (uc.$ && uc.$.description) || ''
      };
      
      const rawVars = [].concat(uc.variable || []);
      
      variables = rawVars.map((v, idx) => {
        const name = v.name || `var_${idx}`;
        const varType = (v.type || 'string').toLowerCase();
        const terminalClasses = [];

        const terminalClassList = [].concat(v.terminalClass || []);
        terminalClassList.forEach((tc, i) => {
          const tcName = tc.name || `tc_${i}`;
          const tcContent = typeof tc === 'string' ? tc : (tc._ || tc.$?.value || '');
          
          const isInvalid = tcName.toLowerCase().includes('invalid') || 
                           (typeof tcContent === 'string' && (
                             tcContent.toLowerCase().includes('inf') ||
                             tcContent.includes('>') ||
                             tcContent.includes('<')
                           ));
          
          const parsed = parseRangeString(tcContent);
          
          if (parsed) {
            terminalClasses.push({
              id: `${name}-${tcName}-${i}`,
              label: tcName,
              min: parsed.min,
              max: parsed.max,
              values: parsed.values,
              valid: !isInvalid
            });
          } else {
            terminalClasses.push({
              id: `${name}-${tcName}-${i}`,
              label: tcName,
              values: [tcContent],
              valid: !isInvalid
            });
          }
        });

        return { name, type: varType, terminalClasses };
      });

      // Extract output
      if (uc.output) {
        const out = Array.isArray(uc.output) ? uc.output[0] : uc.output;
        const outputName = (out.$ && out.$.name) || out.name || 'output';
        const terminalClasses = [];
        
        const outputTCList = [].concat(out.terminalClass || []);
        outputTCList.forEach((tc, i) => {
          const tcName = tc.name || `tc_${i}`;
          const tcContent = typeof tc === 'string' ? tc : (tc._ || tc.$?.value || tc.value || '');
          
          terminalClasses.push({
            id: `${outputName}-${tcName}-${i}`,
            label: tcName,
            value: tcContent,
            valid: true
          });
        });
        
        output = {
          name: outputName,
          terminalClasses
        };
      }
    }
  }
  // Try classificationTree structure (single tree format)
  else if (doc.classificationTree?.useCase) {
    const uc = Array.isArray(doc.classificationTree.useCase) 
      ? doc.classificationTree.useCase[0] 
      : doc.classificationTree.useCase;
    
    useCase = {
      id: (uc.$ && uc.$.id) || uc.id || 'default',
      name: (uc.$ && uc.$.name) || uc.name || 'Use Case',
      description: uc.description || (uc.$ && uc.$.description) || ''
    };
    
    const rawVars = [].concat(uc.variable || []);
    
    variables = rawVars.map((v, idx) => {
      const name = v.name || `var_${idx}`;
      const varType = (v.type || 'string').toLowerCase();
      const terminalClasses = [];

      // Parse terminalClass elements
      const terminalClassList = [].concat(v.terminalClass || []);
      terminalClassList.forEach((tc, i) => {
        const tcName = tc.name || `tc_${i}`;
        // xml2js uses _ for text content
        const tcContent = typeof tc === 'string' ? tc : (tc._ || tc.$?.value || '');
        
        // Determine if this is valid or invalid based on name/content
        const isInvalid = tcName.toLowerCase().includes('invalid') || 
                         (typeof tcContent === 'string' && (
                           tcContent.toLowerCase().includes('inf') ||
                           tcContent.includes('>') ||
                           tcContent.includes('<')
                         ));
        
        const parsed = parseRangeString(tcContent);
        
        if (parsed) {
          terminalClasses.push({
            id: `${name}-${tcName}-${i}`,
            label: tcName,
            min: parsed.min,
            max: parsed.max,
            values: parsed.values,
            valid: !isInvalid
          });
        } else {
          // Fallback: treat as string/enum value
          terminalClasses.push({
            id: `${name}-${tcName}-${i}`,
            label: tcName,
            values: [tcContent],
            valid: !isInvalid
          });
        }
      });

      return { name, type: varType, terminalClasses };
    });

    // Extract output for classificationTree format
    if (uc.output) {
      const out = Array.isArray(uc.output) ? uc.output[0] : uc.output;
      const outputName = (out.$ && out.$.name) || out.name || 'output';
      const terminalClasses = [];
      
      const outputTCList = [].concat(out.terminalClass || []);
      outputTCList.forEach((tc, i) => {
        const tcName = tc.name || `tc_${i}`;
        const tcContent = typeof tc === 'string' ? tc : (tc._ || tc.$?.value || tc.value || '');
        
        terminalClasses.push({
          id: `${outputName}-${tcName}-${i}`,
          label: tcName,
          value: tcContent,
          valid: true
        });
      });
      
      output = {
        name: outputName,
        terminalClasses
      };
    }
  }
  // Fallback to DataDictionary structure (old format)
  else if (doc.DataDictionary?.Variable) {
    const rawVars = [].concat(doc.DataDictionary.Variable || []);
    
    variables = rawVars.map((v, idx) => {
      const type = (v.Type || 'string').toLowerCase();
      const terminalClasses = [];

      if (v.Range) {
        const ranges = [].concat(v.Range);
        ranges.forEach((r, i) => {
          terminalClasses.push({
            id: `${v.Name}-range-${i}`,
            label: r.label || `${r.Min}-${r.Max}`,
            min: r.Min !== undefined ? Number(r.Min) : undefined,
            max: r.Max !== undefined ? Number(r.Max) : undefined,
            valid: r.valid === undefined ? true : (r.valid === 'true' || r.valid === true)
          });
        });
      }

      if (v.Enum) {
        const vals = [].concat(v.Enum.Value || []);
        vals.forEach((val, i) => {
          terminalClasses.push({
            id: `${v.Name}-enum-${i}`,
            label: `${v.Name}=${val}`,
            values: [String(val)],
            valid: true
          });
        });
        // optional invalid-other
        terminalClasses.push({ id: `${v.Name}-enum-invalid`, label: `${v.Name}=other`, values: [], valid: false });
      }

      return { name: v.Name, type, terminalClasses };
    });
  }

  return {
    useCase,
    variables,
    output,
    system: (doc.classificationTrees && doc.classificationTrees.$ && doc.classificationTrees.$.system) ||
            (doc.classificationTree && doc.classificationTree.$ && doc.classificationTree.$.system) ||
            doc.classificationTree?.system || 
            'System'
  };
}

module.exports = parseCctmXml;
