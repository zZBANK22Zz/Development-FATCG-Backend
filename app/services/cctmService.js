// services/cctmService.js
const { parseXMLFile } = require('../utils/xmlParser');
const { convertTreeToDataDictionary } = require('../utils/ecp/convertTreeToDataDictionary');
const { generateValidCrossProductCasesFromJson, generateInvalidEcpCasesFromJson } = require('../utils/ecp/ecpCctmAdapter');
const { stringify } = require('csv-stringify/sync');

// Helper: ensure array
const toArray = (maybeArr) =>
  Array.isArray(maybeArr) ? maybeArr : (maybeArr ? [maybeArr] : []);

// Extract name/type from XML node
const getName = (node) => node?.$?.name || node?.name || '';
const getType = (node) => node?.$?.type || node?.type || 'valid';

// Transform XML tree structure to variables format for visualization
function transformTreeToVariables(tree) {
  const root = tree?.root || tree?.classificationTree?.root;
  if (!root) return [];

  const classifications = toArray(root.classification);
  const variables = [];

  classifications.forEach((cNode) => {
    const classificationName = getName(cNode);
    const classNodes = toArray(cNode.class);

    const terminalClasses = classNodes.map((cls) => {
      const className = getName(cls);
      const classType = getType(cls);
      return {
        label: className,
        valid: classType === 'valid',
        isInvalid: classType === 'invalid',
      };
    }).filter(tc => tc.label);

    // Determine if this is a Terminal Classification (has only terminal classes, no nested classifications)
    const isTerminalClassification = terminalClasses.length > 0 && !cNode.classification;

    variables.push({
      name: classificationName,
      type: 'string', // Default type
      terminalClasses,
      isTerminalClassification, // Mark as Terminal Classification if applicable
    });
  });

  return variables;
}

// Extract use case info from tree
function extractUseCaseInfo(tree) {
  const useCaseName = tree?.classificationTree?.$?.name || 
                     tree?.$?.name || 
                     'Use Case';
  return {
    name: useCaseName,
    system: 'System',
  };
}

async function generateCCTMTestCases(xmlFilePath) {
  // Step 1: Parse XML → Object tree
  const tree = await parseXMLFile(xmlFilePath);

  // Step 2: Convert Tree → Data Dictionary JSON (includes type info)
  const dataDictionaryPath = await convertTreeToDataDictionary(tree);

  // Step 3: Use crossProduct adapter to generate ECP-based test cases
  const validCases = await generateValidCrossProductCasesFromJson(dataDictionaryPath);
  const invalidCases = await generateInvalidEcpCasesFromJson(dataDictionaryPath);

  // Step 4: Format test cases with IDs
  const formattedValidCases = validCases.map((tc, idx) => ({
    id: tc.testCaseID,
    type: tc.type,
    inputs: tc.inputs,
  }));

  // Renumber invalid cases to continue after valid cases
  const startIdx = validCases.length + 1;
  const formattedInvalidCases = invalidCases.map((tc, idx) => ({
    id: `TC${String(startIdx + idx).padStart(3, '0')}`,
    type: tc.type,
    inputs: tc.inputs,
  }));

  const combinedCases = [...formattedValidCases, ...formattedInvalidCases];

  // Step 5: Generate CSV report
  const inputKeys = validCases.length ? Object.keys(validCases[0].inputs) : [];
  const header = ['Test Case ID', 'Type', ...inputKeys, 'Coverage (%)'];
  const totalAll = Math.max(combinedCases.length, 1);

  const rows = combinedCases.map((tc, idx) => [
    tc.id,
    tc.type,
    ...inputKeys.map((k) => tc.inputs[k] || ''),
    `${(((idx + 1) / totalAll) * 100).toFixed(2)}%`,
  ]);

  const csvReport = stringify([header, ...rows]);

  // Step 6: Transform tree structure for visualization
  const variables = transformTreeToVariables(tree);
  const useCaseInfo = extractUseCaseInfo(tree);

  return {
    total: combinedCases.length,
    validCount: validCases.length,
    invalidCount: invalidCases.length,
    combinedCases,
    csvReport,
    // Add tree structure for visualization
    variables,
    useCaseInfo,
  };
}

module.exports = { generateCCTMTestCases };
