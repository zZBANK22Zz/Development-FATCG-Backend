function mergeNumericTerminalClasses(a, b) {
    const endpoints = new Set();
    a.concat(b).forEach(tc => {
      if (typeof tc.min === 'number') endpoints.add(tc.min);
      if (typeof tc.max === 'number') endpoints.add(tc.max);
    });
    const sorted = [...endpoints].sort((x,y)=>x-y);
    if (sorted.length < 2) return a.concat(b);
  
    const segments = [];
    for (let i = 0; i < sorted.length - 1; i++) {
      const smin = sorted[i];
      const smax = sorted[i + 1];
      const inA = a.some(tc => tc.min <= smin && tc.max >= smax);
      const inB = b.some(tc => tc.min <= smin && tc.max >= smax);
      segments.push({
        id: `seg-${smin}-${smax}`,
        label: `${smin}-${smax}`,
        min: smin,
        max: smax,
        valid: inA || inB
      });
    }
    return segments;
  }
  
  function mergeClassificationTrees(existing = [], incoming = []) {
    const map = new Map();
    const warnings = [];
  
    existing.forEach(v => map.set(v.name, JSON.parse(JSON.stringify(v))));
  
    incoming.forEach(v => {
      if (!map.has(v.name)) {
        map.set(v.name, JSON.parse(JSON.stringify(v)));
        return;
      }
  
      const base = map.get(v.name);
      if (base.type === 'number' && v.type === 'number') {
        base.terminalClasses = mergeNumericTerminalClasses(base.terminalClasses, v.terminalClasses);
      } else {
        // union labels for enums/strings
        const labelMap = new Map();
        base.terminalClasses.concat(v.terminalClasses).forEach(tc => labelMap.set(tc.label, tc));
        base.terminalClasses = Array.from(labelMap.values());
      }
  
      // simple conflict detection: different validity for same label
      v.terminalClasses.forEach(tc => {
        const found = base.terminalClasses.find(btc => btc.label === tc.label);
        if (found && found.valid !== tc.valid) {
          warnings.push({ variable: v.name, label: tc.label, existingValid: found.valid, incomingValid: tc.valid });
        }
      });
    });
  
    return { merged: Array.from(map.values()), warnings };
  }
  
  module.exports = { mergeClassificationTrees };
  