// services/cctmService.js
const { parseXMLFile } = require('../utils/xmlParser');
const { convertTreeToDataDictionary } = require('../utils/ecp/convertTreeToDataDictionary');
const { generateValidCrossProductCasesFromJson, generateInvalidEcpCasesFromJson } = require('../utils/ecp/ecpCctmAdapter');
const { stringify } = require('csv-stringify/sync');

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

  return {
    total: combinedCases.length,
    validCount: validCases.length,
    invalidCount: invalidCases.length,
    combinedCases,
    csvReport,
  };
}

module.exports = { generateCCTMTestCases };
