/**
 * FTA to UseCase XML Converter
 * Converts FTATestCaseProject format to UC/Usecase format
 */

/**
 * Converts FTATestCaseProject XML structure to UC/Usecase format
 * @param {Object} ftaData - Parsed FTATestCaseProject data
 * @returns {Object} - UC/Usecase format data
 */
function convertFtaToUseCase(ftaData) {
  const usecase = {
    $: {
      id: ftaData.Metadata?.SystemName ? 
        Date.now().toString() : 
        '100',
      name: ftaData.Metadata?.SystemName || 'FTA Project'
    },
    Input: [],
    Output: null
  };

  // Convert DataDictionary Variables to Inputs
  if (ftaData.DataDictionary && ftaData.DataDictionary.Variable) {
    const variables = Array.isArray(ftaData.DataDictionary.Variable) 
      ? ftaData.DataDictionary.Variable 
      : [ftaData.DataDictionary.Variable];

    variables.forEach((variable, index) => {
      const varID = index + 1;
      const input = {
        VarID: varID.toString(),
        Varname: variable.Name || '',
        DataType: determineDataType(variable),
        Scale: variable.Type === 'range' ? 'Range' : 'Nominal',
        Condition: []
      };

      if (variable.Type === 'range') {
        // Range type: convert Conditions
        if (variable.Conditions && variable.Conditions.Condition) {
          const conditions = Array.isArray(variable.Conditions.Condition)
            ? variable.Conditions.Condition
            : [variable.Conditions.Condition];

          conditions.forEach((cond, condIndex) => {
            input.Condition.push({
              $: {
                id: cond.Id || `${varID}${String(condIndex + 1).padStart(2, '0')}`,
                min: cond.Min || '',
                max: cond.Max || ''
              }
            });
          });
        }
      } else {
        // Nominal type: convert Values to Conditions
        if (variable.Values && variable.Values.Value) {
          const values = Array.isArray(variable.Values.Value)
            ? variable.Values.Value
            : [variable.Values.Value];

          values.forEach((val, valIndex) => {
            const valueText = typeof val === 'string' ? val : (val._ || val);
            input.Condition.push({
              $: {
                id: `${varID}${String(valIndex + 1).padStart(2, '0')}`,
                value: valueText
              }
            });
          });

          // Add Syntax pattern if applicable
          if (values.length > 0) {
            const pattern = values
              .map(v => typeof v === 'string' ? v : (v._ || v))
              .map(v => escapeRegex(v))
              .join('|');
            input.Syntax = {
              $: {
                Pattern: pattern
              }
            };
          }
        }
      }

      usecase.Input.push(input);
    });
  }

  // Convert ExpectedResults to Output
  if (ftaData.ExpectedResults && ftaData.ExpectedResults.Result) {
    const results = Array.isArray(ftaData.ExpectedResults.Result)
      ? ftaData.ExpectedResults.Result
      : [ftaData.ExpectedResults.Result];

    const outputVarID = (usecase.Input.length + 1).toString();
    const output = {
      VarID: outputVarID,
      Varname: 'Result',
      DataType: 'String',
      Scale: 'Nominal',
      Action: []
    };

    results.forEach((result, index) => {
      const resultValue = typeof result === 'string' ? result : (result._ || result);
      output.Action.push({
        $: {
          id: `${outputVarID}${String(index + 1).padStart(2, '0')}`,
          value: resultValue
        }
      });
    });

    usecase.Output = output;
  }

  return {
    UC: {
      Usecase: usecase
    }
  };
}

/**
 * Determines DataType based on variable information
 */
function determineDataType(variable) {
  // Try to infer from variable name or type
  const name = (variable.Name || '').toLowerCase();
  
  if (name.includes('age') || name.includes('count') || name.includes('number')) {
    return 'Integer';
  }
  if (name.includes('weight') || name.includes('height') || name.includes('creatinine') || name.includes('gfr') || name.includes('uo')) {
    return variable.Type === 'range' ? 'Decimal' : 'Integer';
  }
  if (variable.Type === 'range') {
    return 'Integer'; // Default for range
  }
  return 'String'; // Default for nominal
}

/**
 * Escapes special regex characters
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Converts parsed XML object to UC format
 * @param {Object} parsedXml - Parsed XML object from xml2js
 * @returns {Object} - UC format object
 */
function convertParsedFtaToUseCase(parsedXml) {
  if (!parsedXml.FTATestCaseProject) {
    // Already in UC format or invalid
    return parsedXml;
  }

  return convertFtaToUseCase(parsedXml.FTATestCaseProject);
}

module.exports = {
  convertFtaToUseCase,
  convertParsedFtaToUseCase
};

