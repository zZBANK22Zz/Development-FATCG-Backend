// backend/utils/ecpXmlParsers.js
// Purpose: Parse ECP-related XML files into plain JavaScript structures.
// Exports:
//  - processDataDictionary(inputXml): parses the Data Dictionary and returns
//    { inputsMeta, outputMeta, rangeConditions, typeConditions, actions }
//  - processDecisionTree(inputXml): parses the Decision Tree and returns
//    an array of Decision nodes/rules used by legacy generators.
// Inputs: Buffer (from uploads) or filesystem path string.
// Used by: ecpPartitionBuilder (for partitions) and generators.

const { parseXMLFile } = require('../xmlParser');

/** Midpoint helper */
function calculateMidpoint(min, max, dataType) {
  const numMin = Number(min);
  const numMax = Number(max);

  if (!Number.isFinite(numMin) || !Number.isFinite(numMax)) {
    return null;
  }

  const avg = (numMin + numMax) / 2;
  const decimalPlaces = (value) => {
    const match = String(value).match(/\.(\d+)/);
    return match ? match[1].length : 0;
  };

  const maxPlaces = Math.max(decimalPlaces(min), decimalPlaces(max));
  const typeLower = typeof dataType === "string" ? dataType.toLowerCase() : "";
  const requiresDecimal = maxPlaces > 0 || typeLower === "decimal" || typeLower === "float";

  if (!requiresDecimal) {
    const rounded = Math.round(avg);
    return Math.min(numMax, Math.max(numMin, rounded));
  }

  const precision = Math.max(maxPlaces, 2);
  return Number(avg.toFixed(precision));
}

/**
 * Reads a Data Dictionary XML (either a filepath string or Buffer)
 * and returns:
 *  - inputsMeta:       [{ varName, type }]
 *  - outputMeta:       { varName, type }
 *  - rangeConditions:  [{ id, varName, min, max, mid }]
 *  - typeConditions:   [{ id, varName, label }]
 *  - actions:          [{ id, value }]
 *
 * @param {string|Buffer} inputXml
 */
async function processDataDictionary(inputXml) {
  const data = await parseXMLFile(inputXml);

  if (!data.UC || !data.UC.Usecase) {
    throw new Error("Invalid structure: UC/Usecase not found");
  }

  const usecase = Array.isArray(data.UC.Usecase)
    ? data.UC.Usecase[0]
    : data.UC.Usecase;

  const inputs = Array.isArray(usecase.Input)
    ? usecase.Input
    : [usecase.Input];

  const inputsMeta      = [];
  const rangeConditions = [];
  const typeConditions  = [];

  inputs.forEach(input => {
    const varName = input.Varname;
    const scale   = input.Scale; // reading <Scale> instead of <Type>
    inputsMeta.push({ varName, type: scale });

    const conds = Array.isArray(input.Condition)
      ? input.Condition
      : (input.Condition ? [input.Condition] : []);

    if (scale === "Range") {
      conds.forEach(c => {
        const { id, min, max } = c.$;
        const minStr = min;
        const maxStr = max;

        rangeConditions.push({
          id,
          varName,
          min: Number(minStr),
          max: Number(maxStr),
          mid: calculateMidpoint(minStr, maxStr, input.DataType),
          dataType: input.DataType || null
        });
      });
    }
    else if (scale === "Nominal" || scale === "Ordinal") {
      conds.forEach(c => {
        const { id, value } = c.$;
        typeConditions.push({
          id,
          varName,
          label: value
        });
      });
    }
  });

  const output = usecase.Output;
  if (!output) {
    throw new Error("Output not found in Usecase.");
  }

  const outputMeta = {
    varName: output.Varname,
    type:    output.Scale
  };

  const rawActs = Array.isArray(output.Action)
    ? output.Action
    : [output.Action];

  const actions = rawActs.map(a => ({
    id:    a.$.id,
    value: a.$.value
  }));

  return {
    inputsMeta,
    outputMeta,
    rangeConditions,
    typeConditions,
    actions
  };
}

/**
 * Reads a DecisionTree XML (filepath or Buffer)
 * and returns an array of Decision nodes.
 *
 * @param {string|Buffer} inputXml
 */
async function processDecisionTree(inputXml) {
  const data = await parseXMLFile(inputXml);

  if (!data.DecisionTree || !data.DecisionTree.DecisionS) {
    throw new Error("Invalid structure in DecisionTree XML.");
  }

  const dec = data.DecisionTree.DecisionS.Decision;
  return Array.isArray(dec) ? dec : [dec];
}

module.exports = {
  calculateMidpoint,
  processDataDictionary,
  processDecisionTree
};




