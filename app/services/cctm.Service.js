// app/services/cctm.Service.js
const fs = require('fs');
const path = require('path');

const parseCctmXml = require('../utils/cctm/cctmXmlParser');
const buildClassificationTree = require('../utils/cctm/cctmTreeBuilder');
const { mergeClassificationTrees } = require('../utils/cctm/cctmMergeHandler');
const { compareClassificationTrees } = require('../utils/cctm/cctmDiffService');
const cctmSampleGenerator = require('../utils/cctm/cctmSampleGenerator');
const generateTestCases = require('../utils/cctm/cctmTestCaseGenerator');
const cctmReducer = require('../utils/cctm/cctmReducer');
const TestRun = require('../model/TestRun.Model');

// Use CCTM-specific partition builder
const { createEcpPartitions } = require('../utils/cctm/cctmPartitionBuilder');

/**
 * parseXmlString(xmlString) -> Promise<TreeStructure>
 * Helper to parse XML string directly (not from file)
 */
async function parseXmlString(xmlString) {
  // Check if it's a draw.io format
  if (xmlString.includes('<mxfile') || xmlString.includes('<mxGraphModel')) {
    const { parseDrawioXml } = require('../utils/cctm/drawioXmlParser');
    return await parseDrawioXml(xmlString);
  }
  
  const { parseStringPromise } = require('xml2js');
  const doc = await parseStringPromise(xmlString, { explicitArray: false, mergeAttrs: true });

  const parseRangeString = (rangeStr) => {
    if (!rangeStr || typeof rangeStr !== 'string') return null;
    const trimmed = rangeStr.trim();
    
    if (trimmed.includes('-inf') || trimmed.includes('inf') || trimmed.includes('>') || trimmed.includes('<')) {
      const parts = trimmed.split(',').map(s => s.trim());
      const firstPart = parts[0];
      
      if (firstPart.startsWith('-inf')) {
        const match = firstPart.match(/-inf-(\d+\.?\d*)/);
        if (match) return { min: -Infinity, max: Number(match[1]), valid: false };
      } else if (firstPart.startsWith('>')) {
        const match = firstPart.match(/>(\d+\.?\d*)/);
        if (match) return { min: Number(match[1]) + 0.1, max: Infinity, valid: false };
      } else if (firstPart.startsWith('<')) {
        const match = firstPart.match(/<(\d+\.?\d*)/);
        if (match) return { min: -Infinity, max: Number(match[1]) - 0.1, valid: false };
      } else if (firstPart.includes('-')) {
        const [minStr, maxStr] = firstPart.split('-').map(s => s.trim());
        return { 
          min: minStr === '-inf' ? -Infinity : Number(minStr), 
          max: maxStr === 'inf' || maxStr === '∞' ? Infinity : Number(maxStr),
          valid: false
        };
      }
      
      return { min: -Infinity, max: Infinity, valid: false };
    }
    
    if (!trimmed.includes('-')) {
      const num = Number(trimmed);
      if (!isNaN(num)) return { min: num, max: num, valid: true };
      if (trimmed === 'true') return { min: undefined, max: undefined, values: [true], valid: true };
      if (trimmed === 'false') return { min: undefined, max: undefined, values: [false], valid: true };
      return { min: undefined, max: undefined, values: [trimmed], valid: true };
    }
    
    const parts = trimmed.split('-').map(s => s.trim());
    if (parts.length === 2) {
      const min = Number(parts[0]);
      const max = Number(parts[1]);
      if (!isNaN(min) && !isNaN(max)) return { min, max, valid: true };
    }
    
    return null;
  };

  let variables = [];
  let useCase = null;
  let output = null;

  // Try classificationTrees structure (with treeVersion wrapper) first
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

/**
 * Generate CCTM test cases with new flow:
 * 1. Parse XML file
 * 2. Compare with previous version (if exists)
 * 3. Create merged tree with status
 * 4. Generate test cases based on impact analysis
 * 
 * @param {string} xmlContent - XML file content
 * @param {Object} options - Options including userId, threshold, etc.
 */
async function generateCCTMTestCases(xmlContent, options = {}) {
  const { userId, threshold = 10000, baseTreeXml = null } = options;

  // 1. Parse XML to JS objects
  const newTree = await parseXmlString(xmlContent);
  
  // 2. Get previous tree structure from database (if userId provided)
  let oldTree = null;
  if (userId) {
    const previousTree = await TestRun.getLatestCctmTreeStructure(userId);
    if (previousTree && previousTree.treeStructure) {
      oldTree = previousTree.treeStructure;
    }
  }
  
  // Fallback: use baseTreeXml if provided and no previous tree found
  if (!oldTree && baseTreeXml) {
    oldTree = await parseXmlString(baseTreeXml);
  }

  let diffResult = null;
  let mergedTree = null;
  let variables = newTree.variables || [];
  let mergeWarnings = [];

  // 3. Compare trees if old tree exists
  if (oldTree) {
    try {
      diffResult = compareClassificationTrees(oldTree, newTree);
      mergedTree = diffResult.mergedTree;
      
      // Extract variables from merged tree (only non-removed ones for test generation)
      variables = mergedTree.variables
        .filter(v => v.status !== 'removed')
        .map(v => ({
          name: v.name,
          type: v.type,
          terminalClasses: v.terminalClasses
            .filter(tc => tc.status !== 'removed')
            .map(tc => ({
              id: tc.id || `${v.name}-${tc.label}`,
              label: tc.label,
              min: tc.min,
              max: tc.max,
              values: tc.values,
              valid: tc.valid !== false
            }))
        }));
    } catch (err) {
      mergeWarnings.push({ error: 'Failed to compare trees', detail: String(err) });
      variables = newTree.variables || [];
    }
  } else {
    // First time - no comparison
    variables = newTree.variables || [];
    mergedTree = {
      useCase: newTree.useCase,
      variables: variables.map(v => ({
        ...v,
        status: 'added',
        sourceVersion: 'new'
      })),
      output: newTree.output,
      nodeStatusMap: {}
    };
  }

  // 4. Create ECP partitions
  const partitions = createEcpPartitions(variables);

  // 5. Generate test cases with impact-based rules
  let testCases = await generateTestCases(partitions, { threshold });

  // Apply reducer if needed
  if (Array.isArray(testCases) && testCases.length > threshold) {
    testCases = cctmReducer.applyReduction(testCases, { cap: threshold });
  }

  // 6. Format test cases
  const formattedTestCases = (Array.isArray(testCases) ? testCases : []).map((tc, idx) => {
    if (tc.testCaseID) {
      return tc;
    }
    
    let testCaseType = 'Valid';
    if (tc.meta && Array.isArray(tc.meta)) {
      const hasInvalid = tc.meta.some(id => 
        typeof id === 'string' && (
          id.toLowerCase().includes('invalid') || 
          id.includes('invalid') ||
          id.includes('overflow') ||
          id.includes('underflow')
        )
      );
      if (hasInvalid) {
        testCaseType = 'Invalid';
      }
    } else if (tc.type) {
      testCaseType = tc.type;
    }
    
    return {
      testCaseID: tc.id || `TC${String(idx + 1).padStart(3, '0')}`,
      type: testCaseType,
      inputs: tc.data || tc.inputs || {},
      expected: tc.expected || {}
    };
  });

  // 7. Extract use case info
  const useCaseInfo = {
    name: newTree.useCase?.name || 'Use Case',
    system: newTree.system || 'System'
  };

  // 8. Return result with diff and impact information
  return {
    success: true,
    variables: variables,
    partitions,
    testCases: formattedTestCases,
    warnings: mergeWarnings,
    stats: { total: formattedTestCases.length },
    useCaseInfo,
    // New: diff and impact information
    diff: diffResult ? {
      summary: diffResult.summary,
      variableDiff: diffResult.variableDiff,
      outputDiff: diffResult.outputDiff
    } : null,
    impact: diffResult ? diffResult.impact : null,
    mergedTree: mergedTree,
    mergedTreeStructure: newTree.mergedTreeStructure || null, // Add merged tree structure from parser
    isFirstVersion: !oldTree
  };
}

module.exports = { 
  generateCCTMTestCases,
  parseXmlString // Export for use in controller
};
