/**
 * Check if two ranges overlap
 */
function rangesOverlap(r1, r2) {
  return !(r1.max < r2.min || r2.max < r1.min);
}

/**
 * Merge two overlapping ranges into one
 */
function mergeTwoRanges(r1, r2) {
  return {
    min: Math.min(r1.min, r2.min),
    max: Math.max(r1.max, r2.max),
    valid: r1.valid || r2.valid // valid if at least one is valid
  };
}

/**
 * Merge numeric terminal classes by combining overlapping ranges
 * This reduces the number of classes by merging overlapping ranges into larger ones
 * Example: [0-12] and [0-17] merge into [0-17] (reduced from 2 to 1 class)
 */
function mergeNumericTerminalClasses(a, b) {
  // Combine all ranges from both trees
  let allRanges = a.concat(b)
    .filter(tc => typeof tc.min === 'number' && typeof tc.max === 'number')
    .map(tc => ({
      min: tc.min,
      max: tc.max,
      valid: tc.valid === true,
      originalId: tc.id,
      originalLabel: tc.label
    }));

  if (allRanges.length === 0) return [];
  
  // Separate valid and invalid ranges (merge separately)
  const validRanges = allRanges.filter(r => r.valid);
  const invalidRanges = allRanges.filter(r => !r.valid);
  
  // Merge overlapping valid ranges
  const mergedValid = mergeOverlappingRanges(validRanges);
  
  // Merge overlapping invalid ranges
  const mergedInvalid = mergeOverlappingRanges(invalidRanges);
  
  // Combine results and generate IDs
  const result = [];
  mergedValid.forEach((range, idx) => {
    result.push({
      id: `merged-${idx}-${range.min}-${range.max}`,
      label: `${range.min}-${range.max}`,
      min: range.min,
      max: range.max,
      valid: true
    });
  });
  
  mergedInvalid.forEach((range, idx) => {
    result.push({
      id: `merged-invalid-${idx}-${range.min}-${range.max}`,
      label: `${range.min}-${range.max}`,
      min: range.min,
      max: range.max,
      valid: false
    });
  });
  
  return result;
}

/**
 * Merge overlapping ranges into larger ranges
 */
function mergeOverlappingRanges(ranges) {
  if (ranges.length === 0) return [];
  
  // Sort ranges by min value
  const sorted = [...ranges].sort((a, b) => a.min - b.min);
  const merged = [];
  
  let current = { ...sorted[0] };
  
  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i];
    
    // If current range overlaps with next range, merge them
    if (rangesOverlap(current, next)) {
      current = mergeTwoRanges(current, next);
    } else {
      // No overlap, add current to merged and start new range
      merged.push(current);
      current = { ...next };
    }
  }
  
  // Add the last range
  merged.push(current);
  
  return merged;
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
        
        // Separate valid and invalid enum classes
        const validClasses = Array.from(labelMap.values()).filter(tc => tc.valid !== false);
        const invalidClasses = Array.from(labelMap.values()).filter(tc => tc.valid === false);
        
        // Regenerate unique IDs for valid classes
        const mergedValid = validClasses.map((tc, idx) => ({
          ...tc,
          id: `${base.name}-enum-${idx}`
        }));
        
        // Keep only one invalid class if any exist
        const mergedInvalid = invalidClasses.length > 0 
          ? [{ 
              ...invalidClasses[0], 
              id: `${base.name}-enum-invalid`,
              label: `${base.name}=other`,
              values: [],
              valid: false
            }]
          : [];
        
        base.terminalClasses = [...mergedValid, ...mergedInvalid];
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
  