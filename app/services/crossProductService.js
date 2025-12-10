// services/crossProductService.js
// Purpose: Encapsulate cross-product ECP generation concerns
// - Build valid-only Cartesian product from Data Dictionary
// - Append DD-based invalid tests for CSV comparison/export
// - Decide embedding thresholds to avoid Mongo 16MB document limit

const { stringify } = require('csv-stringify/sync');
const { generateValidCrossProductCases } = require('../utils/ecp/ecpCrossProductGenerator');
const generateInvalidEcpCases = require('../utils/ecp/ecpInvalidGenerator');

const CROSS_EMBED_LIMIT = 10000;           // max rows to embed in document
const MAX_EMBED_BYTES = 8 * 1024 * 1024;   // ~8MB safety cap for CSV string

async function generateCrossProductArtifacts(dataDictionaryPath) {
  // 1) Valid cross-product (DD-only)
  const validCases = await generateValidCrossProductCases(dataDictionaryPath);

  // 2) Invalids (DD-only) — used for CSV and optionally for embedding
  const invalidCases = await generateInvalidEcpCases(dataDictionaryPath);

  // 3) CSV (valid + invalid) with coverage
  const inputKeys = validCases.length ? Object.keys(validCases[0].inputs) : [];
  const header = ['Test Case ID', 'Type', ...inputKeys, 'Coverage (%)'];
  const totalAll = Math.max(validCases.length + invalidCases.length, 1);

  const validRows = validCases.map((tc, idx) => [
    tc.testCaseID,
    'Valid',
    ...inputKeys.map(k => tc.inputs[k]),
    `${(((idx + 1) / totalAll) * 100).toFixed(2)}%`
  ]);

  const startIdxInvalid = validCases.length + 1;
  const invalidRows = invalidCases.map((tc, i) => [
    `TC${String(startIdxInvalid + i).padStart(3, '0')}`,
    'Invalid',
    ...inputKeys.map(k => tc.inputs[k]),
    `${(((startIdxInvalid + i) / totalAll) * 100).toFixed(2)}%`
  ]);

  const csv = stringify([header, ...validRows, ...invalidRows]);

  // 4) Embedding decision
  const embed = validCases.length <= CROSS_EMBED_LIMIT && Buffer.byteLength(csv || '', 'utf8') <= MAX_EMBED_BYTES;
  const crossCasesForDoc = embed ? validCases : [];
  const ecpCrossCsvForDoc = embed ? csv : '';

  return {
    validCases,
    invalidCases,
    crossCsv: csv,
    crossCasesForDoc,
    ecpCrossCsvForDoc,
  };
}

module.exports = {
  generateCrossProductArtifacts,
  CROSS_EMBED_LIMIT,
  MAX_EMBED_BYTES,
};
