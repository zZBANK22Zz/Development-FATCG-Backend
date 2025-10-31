// app/services/cctm.Service.js
const fs = require('fs');
const path = require('path');

const parseCctmXml = require('../utils/cctm/cctmXmlParser');
const buildClassificationTree = require('../utils/cctm/cctmTreeBuilder');
const { mergeClassificationTrees } = require('../utils/cctm/cctmMergeHandler');
const cctmSampleGenerator = require('../utils/cctm/cctmSampleGenerator');
const generateTestCases = require('../utils/cctm/cctmTestCaseGenerator');
const cctmReducer = require('../utils/cctm/cctmReducer');

// require may return undefined if module doesn't export createEcpPartitions
let createEcpPartitions;
try {
  // safe require — if module missing or doesn't export, we'll fallback later
  const ecpModule = require('../utils/ecp/ecpPartitionBuilder');
  createEcpPartitions = ecpModule && ecpModule.createEcpPartitions;
} catch (e) {
  createEcpPartitions = undefined;
}

/**
 * generateCCTMTestCases(xmlFile, options)
 * - xmlFile: path to uploaded XML file (string)
 * - options: { threshold: number, removeStoredExisting: boolean }
 */
async function generateCCTMTestCases(xmlFile, options = {}) {
  const threshold = options.threshold || 10000;
  const removeStoredExisting = options.removeStoredExisting === true;

  // 1. parse incoming XML -> Variable[]
  const variables = await parseCctmXml(xmlFile);

  // 2. build classification tree (simple transform for now)
  const initialTree = await buildClassificationTree(variables);

  // 3. check for an "existing" stored tree file (for test merging)
  const uploadsDir = path.join(__dirname, '../../uploads');
  const existingPath = path.join(uploadsDir, 'existing_tree.xml');
  let mergedTree = initialTree;
  let mergeWarnings = [];

  if (fs.existsSync(existingPath)) {
    try {
      const existingVars = await parseCctmXml(existingPath);
      const { merged, warnings } = mergeClassificationTrees(existingVars, initialTree);
      mergedTree = merged;
      mergeWarnings = warnings || [];

      // optionally remove the stored file after merge (useful for tests)
      if (removeStoredExisting) {
        try { fs.unlinkSync(existingPath); } catch (e) { /* ignore removal errors */ }
      }
    } catch (err) {
      // If merge fails, keep initialTree and include a warning
      mergeWarnings.push({ error: 'Failed to parse or merge existing stored tree', detail: String(err) });
      mergedTree = initialTree;
    }
  }

  // 4. create ECP partitions using existing ECP utils if available
  let partitions = [];
  if (typeof createEcpPartitions === 'function') {
    partitions = await createEcpPartitions(mergedTree);
  } else {
    // fallback: one representative partition per terminal class
    partitions = mergedTree.map(v => ({
      variable: v,
      reps: v.terminalClasses.map(tc => ({
        tc,
        sample: cctmSampleGenerator.sampleValueOf(tc, v.type),
        variable: v
      }))
    }));
  }

  // 5. generate test cases (generator expects partitions and options)
  // ensure we pass options object so generator can use threshold or other controls
  let testCases = await generateTestCases(partitions, { threshold });

  // 6. if too large, apply reducer
  if (Array.isArray(testCases) && testCases.length > threshold) {
    testCases = cctmReducer.applyReduction(testCases, { cap: threshold });
  }

  // 7. Return consolidated result (variables = mergedTree)
  return {
    success: true,
    variables: mergedTree,
    partitions,
    testCases,
    warnings: mergeWarnings,
    stats: { total: Array.isArray(testCases) ? testCases.length : 0 }
  };
}

module.exports = { generateCCTMTestCases };