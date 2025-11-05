/**
 * CCTM Diff Service
 * 
 * เปรียบเทียบ classification trees ระหว่างสองเวอร์ชัน
 * และสร้าง diff report พร้อม impact analysis
 */

/**
 * แปลง classification tree เป็น structured map
 * keyed by useCase id, variable name, terminalClass name
 */
function buildTreeMap(parsedTree) {
  const map = {};
  
  // parsedTree คือ array ของ variables ที่ได้จาก parseCctmXml
  // แต่เราต้องเก็บ useCase และ output ด้วย
  
  // เก็บข้อมูล useCase
  if (parsedTree.useCase) {
    map.useCase = {
      id: parsedTree.useCase.id || 'default',
      name: parsedTree.useCase.name || 'Use Case',
      description: parsedTree.useCase.description || ''
    };
  }
  
  // เก็บ variables
  map.variables = {};
  (parsedTree.variables || []).forEach(variable => {
    map.variables[variable.name] = {
      name: variable.name,
      type: variable.type,
      terminalClasses: {}
    };
    
    // เก็บ terminal classes
    (variable.terminalClasses || []).forEach(tc => {
      map.variables[variable.name].terminalClasses[tc.label] = {
        label: tc.label,
        min: tc.min,
        max: tc.max,
        values: tc.values,
        valid: tc.valid !== false,
        // เก็บ range string สำหรับ comparison
        rangeString: tc.min !== undefined && tc.max !== undefined
          ? `${tc.min}-${tc.max}`
          : tc.values ? tc.values.join(',') : tc.label
      };
    });
  });
  
  // เก็บ output (ถ้ามี)
  if (parsedTree.output) {
    map.output = {
      name: parsedTree.output.name || 'output',
      terminalClasses: {}
    };
    
    (parsedTree.output.terminalClasses || []).forEach(tc => {
      map.output.terminalClasses[tc.label] = {
        label: tc.label,
        value: tc.value || tc.label,
        valid: tc.valid !== false
      };
    });
  }
  
  return map;
}

/**
 * เปรียบเทียบ variables ระหว่างสองเวอร์ชัน
 */
function compareVariables(oldVars, newVars) {
  const diff = {
    added: [],
    removed: [],
    modified: [],
    unchanged: []
  };
  
  const oldVarNames = new Set(Object.keys(oldVars || {}));
  const newVarNames = new Set(Object.keys(newVars || {}));
  
  // หา variables ที่เพิ่มขึ้น
  newVarNames.forEach(varName => {
    if (!oldVarNames.has(varName)) {
      diff.added.push({
        name: varName,
        variable: newVars[varName],
        status: 'added'
      });
    }
  });
  
  // หา variables ที่ถูกลบ
  oldVarNames.forEach(varName => {
    if (!newVarNames.has(varName)) {
      diff.removed.push({
        name: varName,
        variable: oldVars[varName],
        status: 'removed'
      });
    }
  });
  
  // เปรียบเทียบ variables ที่มีในทั้งสองเวอร์ชัน
  oldVarNames.forEach(varName => {
    if (newVarNames.has(varName)) {
      const oldVar = oldVars[varName];
      const newVar = newVars[varName];
      
      // เปรียบเทียบ terminal classes
      const tcDiff = compareTerminalClasses(
        oldVar.terminalClasses,
        newVar.terminalClasses,
        varName
      );
      
      if (tcDiff.hasChanges) {
        diff.modified.push({
          name: varName,
          oldVariable: oldVar,
          newVariable: newVar,
          terminalClassChanges: tcDiff,
          status: 'modified'
        });
      } else {
        diff.unchanged.push({
          name: varName,
          variable: newVar,
          status: 'unchanged'
        });
      }
    }
  });
  
  return diff;
}

/**
 * เปรียบเทียบ terminal classes ภายใน variable
 */
function compareTerminalClasses(oldTCs, newTCs, variableName) {
  const diff = {
    added: [],
    removed: [],
    modified: [],
    unchanged: [],
    hasChanges: false
  };
  
  const oldTCNames = new Set(Object.keys(oldTCs || {}));
  const newTCNames = new Set(Object.keys(newTCs || {}));
  
  // Terminal classes ที่เพิ่มขึ้น
  newTCNames.forEach(tcName => {
    if (!oldTCNames.has(tcName)) {
      diff.added.push({
        variableName,
        name: tcName,
        terminalClass: newTCs[tcName],
        status: 'added'
      });
      diff.hasChanges = true;
    }
  });
  
  // Terminal classes ที่ถูกลบ
  oldTCNames.forEach(tcName => {
    if (!newTCNames.has(tcName)) {
      diff.removed.push({
        variableName,
        name: tcName,
        terminalClass: oldTCs[tcName],
        status: 'removed'
      });
      diff.hasChanges = true;
    }
  });
  
  // เปรียบเทียบ terminal classes ที่มีชื่อเดียวกัน
  oldTCNames.forEach(tcName => {
    if (newTCNames.has(tcName)) {
      const oldTC = oldTCs[tcName];
      const newTC = newTCs[tcName];
      
      // เปรียบเทียบค่า (range string)
      const oldRange = oldTC.rangeString || oldTC.label;
      const newRange = newTC.rangeString || newTC.label;
      
      if (oldRange !== newRange || oldTC.valid !== newTC.valid) {
        diff.modified.push({
          variableName,
          name: tcName,
          oldTerminalClass: oldTC,
          newTerminalClass: newTC,
          status: 'modified',
          changeType: oldRange !== newRange ? 'range_changed' : 'validity_changed'
        });
        diff.hasChanges = true;
      } else {
        diff.unchanged.push({
          variableName,
          name: tcName,
          terminalClass: newTC,
          status: 'unchanged'
        });
      }
    }
  });
  
  return diff;
}

/**
 * เปรียบเทียบ output ระหว่างสองเวอร์ชัน
 */
function compareOutputs(oldOutput, newOutput) {
  const diff = {
    added: [],
    removed: [],
    modified: [],
    unchanged: [],
    hasChanges: false
  };
  
  if (!oldOutput && !newOutput) {
    return diff;
  }
  
  if (!oldOutput) {
    if (newOutput) {
      diff.added.push({
        name: newOutput.name,
        output: newOutput,
        status: 'added'
      });
      diff.hasChanges = true;
    }
    return diff;
  }
  
  if (!newOutput) {
    diff.removed.push({
      name: oldOutput.name,
      output: oldOutput,
      status: 'removed'
    });
    diff.hasChanges = true;
    return diff;
  }
  
  // เปรียบเทียบ terminal classes ของ output
  const tcDiff = compareTerminalClasses(
    oldOutput.terminalClasses,
    newOutput.terminalClasses,
    'output'
  );
  
  Object.assign(diff, tcDiff);
  
  return diff;
}

/**
 * เปรียบเทียบ classification trees ระหว่างสองเวอร์ชัน
 * @param {Object} oldTree - Tree structure จากเวอร์ชันก่อนหน้า
 * @param {Object} newTree - Tree structure จากเวอร์ชันใหม่
 * @returns {Object} Diff report พร้อม impact analysis
 */
function compareClassificationTrees(oldTree, newTree) {
  // แปลงเป็น structured maps
  const oldMap = buildTreeMap(oldTree);
  const newMap = buildTreeMap(newTree);
  
  // เปรียบเทียบ variables
  const variableDiff = compareVariables(oldMap.variables, newMap.variables);
  
  // เปรียบเทียบ output
  const outputDiff = compareOutputs(oldMap.output, newMap.output);
  
  // สร้าง merged tree ที่รวมทั้งสองเวอร์ชันพร้อม status
  const mergedTree = createMergedTree(oldMap, newMap, variableDiff, outputDiff);
  
  // สร้าง impact analysis
  const impact = analyzeImpact(variableDiff, outputDiff);
  
  return {
    oldTree: oldMap,
    newTree: newMap,
    variableDiff,
    outputDiff,
    mergedTree,
    impact,
    summary: {
      variablesAdded: variableDiff.added.length,
      variablesRemoved: variableDiff.removed.length,
      variablesModified: variableDiff.modified.length,
      variablesUnchanged: variableDiff.unchanged.length,
      outputChanged: outputDiff.hasChanges,
      totalTerminalClassesAdded: variableDiff.added.reduce((sum, v) => 
        sum + Object.keys(v.variable.terminalClasses || {}).length, 0) +
        variableDiff.modified.reduce((sum, v) => 
          sum + v.terminalClassChanges.added.length, 0),
      totalTerminalClassesRemoved: variableDiff.removed.reduce((sum, v) => 
        sum + Object.keys(v.variable.terminalClasses || {}).length, 0) +
        variableDiff.modified.reduce((sum, v) => 
          sum + v.terminalClassChanges.removed.length, 0),
      totalTerminalClassesModified: variableDiff.modified.reduce((sum, v) => 
        sum + v.terminalClassChanges.modified.length, 0)
    }
  };
}

/**
 * สร้าง merged tree ที่รวมทั้งสองเวอร์ชันพร้อม status
 */
function createMergedTree(oldMap, newMap, variableDiff, outputDiff) {
  const merged = {
    useCase: newMap.useCase || oldMap.useCase,
    variables: [],
    output: null,
    nodeStatusMap: {} // mapping สำหรับ test case generator
  };
  
  // เพิ่ม variables ที่ unchanged
  variableDiff.unchanged.forEach(v => {
    merged.variables.push({
      ...v.variable,
      status: 'unchanged',
      sourceVersion: 'both'
    });
    // เก็บ mapping
    Object.keys(v.variable.terminalClasses || {}).forEach(tcName => {
      merged.nodeStatusMap[`${v.name}.${tcName}`] = 'unchanged';
    });
  });
  
  // เพิ่ม variables ที่ added
  variableDiff.added.forEach(v => {
    merged.variables.push({
      ...v.variable,
      status: 'added',
      sourceVersion: 'new'
    });
    Object.keys(v.variable.terminalClasses || {}).forEach(tcName => {
      merged.nodeStatusMap[`${v.name}.${tcName}`] = 'added';
    });
  });
  
  // เพิ่ม variables ที่ removed (เก็บไว้สำหรับ reference)
  variableDiff.removed.forEach(v => {
    merged.variables.push({
      ...v.variable,
      status: 'removed',
      sourceVersion: 'old'
    });
    Object.keys(v.variable.terminalClasses || {}).forEach(tcName => {
      merged.nodeStatusMap[`${v.name}.${tcName}`] = 'removed';
    });
  });
  
  // เพิ่ม variables ที่ modified
  variableDiff.modified.forEach(v => {
    const mergedVar = {
      name: v.name,
      type: v.newVariable.type,
      terminalClasses: [],
      status: 'modified',
      sourceVersion: 'both'
    };
    
    // เพิ่ม unchanged terminal classes
    v.terminalClassChanges.unchanged.forEach(tc => {
      mergedVar.terminalClasses.push({
        ...tc.terminalClass,
        status: 'unchanged',
        sourceVersion: 'both'
      });
      merged.nodeStatusMap[`${v.name}.${tc.name}`] = 'unchanged';
    });
    
    // เพิ่ม added terminal classes
    v.terminalClassChanges.added.forEach(tc => {
      mergedVar.terminalClasses.push({
        ...tc.terminalClass,
        status: 'added',
        sourceVersion: 'new'
      });
      merged.nodeStatusMap[`${v.name}.${tc.name}`] = 'added';
    });
    
    // เพิ่ม removed terminal classes
    v.terminalClassChanges.removed.forEach(tc => {
      mergedVar.terminalClasses.push({
        ...tc.terminalClass,
        status: 'removed',
        sourceVersion: 'old'
      });
      merged.nodeStatusMap[`${v.name}.${tc.name}`] = 'removed';
    });
    
    // เพิ่ม modified terminal classes (เก็บทั้งสองเวอร์ชัน)
    v.terminalClassChanges.modified.forEach(tc => {
      mergedVar.terminalClasses.push({
        ...tc.newTerminalClass,
        oldTerminalClass: tc.oldTerminalClass,
        status: 'modified',
        sourceVersion: 'both',
        changeType: tc.changeType
      });
      merged.nodeStatusMap[`${v.name}.${tc.name}`] = 'modified';
    });
    
    merged.variables.push(mergedVar);
  });
  
  // จัดการ output
  if (newMap.output || oldMap.output) {
    merged.output = {
      name: (newMap.output || oldMap.output).name,
      terminalClasses: [],
      status: outputDiff.hasChanges ? 'modified' : 'unchanged'
    };
    
    if (outputDiff.unchanged.length > 0 || outputDiff.added.length > 0 || 
        outputDiff.modified.length > 0 || outputDiff.removed.length > 0) {
      // รวม terminal classes จาก output diff
      outputDiff.unchanged.forEach(tc => {
        merged.output.terminalClasses.push({
          ...tc.terminalClass,
          status: 'unchanged'
        });
      });
      outputDiff.added.forEach(tc => {
        merged.output.terminalClasses.push({
          ...tc.terminalClass,
          status: 'added'
        });
      });
      outputDiff.removed.forEach(tc => {
        merged.output.terminalClasses.push({
          ...tc.terminalClass,
          status: 'removed'
        });
      });
      outputDiff.modified.forEach(tc => {
        merged.output.terminalClasses.push({
          ...tc.newTerminalClass,
          oldTerminalClass: tc.oldTerminalClass,
          status: 'modified',
          changeType: tc.changeType
        });
      });
    }
  }
  
  return merged;
}

/**
 * วิเคราะห์ impact ของ changes ต่อ test case generation
 */
function analyzeImpact(variableDiff, outputDiff) {
  const impact = {
    testCasesToGenerate: [],
    testCasesToMarkObsolete: [],
    testCasesToRegenerate: [],
    affectedVariables: [],
    affectedTerminalClasses: [],
    rules: []
  };
  
  // Rule 1: Variable added → สร้าง test cases สำหรับ terminal classes ของตัวแปรใหม่
  variableDiff.added.forEach(v => {
    impact.testCasesToGenerate.push({
      variableName: v.name,
      reason: 'variable_added',
      terminalClasses: Object.keys(v.variable.terminalClasses || {})
    });
    impact.affectedVariables.push({
      name: v.name,
      action: 'generate',
      reason: 'variable_added'
    });
    impact.rules.push({
      type: 'variable_added',
      variable: v.name,
      action: 'generate_test_cases',
      description: `Generate test cases covering all terminal classes of new variable: ${v.name}`
    });
  });
  
  // Rule 2: Variable removed → mark test cases ที่พึ่งพาตัวแปรนั้นว่า obsolete
  variableDiff.removed.forEach(v => {
    impact.testCasesToMarkObsolete.push({
      variableName: v.name,
      reason: 'variable_removed'
    });
    impact.affectedVariables.push({
      name: v.name,
      action: 'mark_obsolete',
      reason: 'variable_removed'
    });
    impact.rules.push({
      type: 'variable_removed',
      variable: v.name,
      action: 'mark_obsolete',
      description: `Mark all test cases depending on variable ${v.name} as obsolete`
    });
  });
  
  // Rule 3: Terminal class modified → regenerate test cases ที่ depend on that terminal class
  variableDiff.modified.forEach(v => {
    v.terminalClassChanges.modified.forEach(tc => {
      impact.testCasesToRegenerate.push({
        variableName: v.name,
        terminalClassName: tc.name,
        reason: 'terminal_class_modified',
        changeType: tc.changeType
      });
      impact.affectedTerminalClasses.push({
        variableName: v.name,
        terminalClassName: tc.name,
        action: 'regenerate',
        reason: 'terminal_class_modified',
        changeType: tc.changeType
      });
      impact.rules.push({
        type: 'terminal_class_modified',
        variable: v.name,
        terminalClass: tc.name,
        action: 'regenerate_test_cases',
        changeType: tc.changeType,
        description: `Regenerate test cases that depend on ${v.name}.${tc.name} (${tc.changeType})`
      });
    });
    
    // Terminal class added → generate new test cases
    v.terminalClassChanges.added.forEach(tc => {
      impact.testCasesToGenerate.push({
        variableName: v.name,
        terminalClassName: tc.name,
        reason: 'terminal_class_added'
      });
      impact.affectedTerminalClasses.push({
        variableName: v.name,
        terminalClassName: tc.name,
        action: 'generate',
        reason: 'terminal_class_added'
      });
    });
    
    // Terminal class removed → mark obsolete
    v.terminalClassChanges.removed.forEach(tc => {
      impact.testCasesToMarkObsolete.push({
        variableName: v.name,
        terminalClassName: tc.name,
        reason: 'terminal_class_removed'
      });
      impact.affectedTerminalClasses.push({
        variableName: v.name,
        terminalClassName: tc.name,
        action: 'mark_obsolete',
        reason: 'terminal_class_removed'
      });
    });
  });
  
  // Rule 4: Output changed → test cases ที่คาดผลลัพธ์เดิมอาจต้องปรับ
  if (outputDiff.hasChanges) {
    impact.rules.push({
      type: 'output_changed',
      action: 'review_expected_outputs',
      description: 'Review and update expected outputs in test cases',
      changes: {
        added: outputDiff.added.length,
        removed: outputDiff.removed.length,
        modified: outputDiff.modified.length
      }
    });
  }
  
  return impact;
}

module.exports = {
  compareClassificationTrees,
  buildTreeMap,
  compareVariables,
  compareTerminalClasses,
  compareOutputs,
  analyzeImpact,
  createMergedTree
};

