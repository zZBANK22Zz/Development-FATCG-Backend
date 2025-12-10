// backend/utils/syntax/syntaxParser.js
// Purpose: Parse <Syntax> definitions from a Data Dictionary XML into
// plain JavaScript objects usable for test generation.
// Exports: { processSyntaxDefs(inputXml) }
// Input can be a Buffer (uploaded) or a filesystem path string.
const { parseXMLFile } = require('../xmlParser');

function collectSyntaxEntries(target, definitions, { fallbackName = '', fallbackType = '' } = {}) {
  if (!target || !target.Syntax) return;

  const syntaxes = Array.isArray(target.Syntax)
    ? target.Syntax
    : [target.Syntax];

  syntaxes.forEach(syntaxNode => {
    if (!syntaxNode) return;
    const attributes = syntaxNode.$ || {};
    const pattern = attributes.Pattern ?? syntaxNode.Pattern;
    if (!pattern) return;

    definitions.push({
      name: fallbackName,
      description: fallbackName,
      pattern,
      type: attributes.Type ?? fallbackType ?? '',
      length: attributes.Length ?? ''
    });
  });
}

/**
 * Extracts <Syntax> definitions from a Data Dictionary XML
 * (inputXml can be a String path or Buffer).
 *
 * @param {string|Buffer} inputXml
 * @returns {Promise<Array<{name:string,description:string,pattern:string,type:string,length:string}>>}
 */
async function processSyntaxDefs(inputXml) {
  const data = await parseXMLFile(inputXml);
  if (!data.UC || !data.UC.Usecase) return [];

  const usecase = Array.isArray(data.UC.Usecase)
    ? data.UC.Usecase[0]
    : data.UC.Usecase;

  const inputs = Array.isArray(usecase.Input)
    ? usecase.Input
    : [usecase.Input];

  const definitions = [];

  inputs.forEach(input => {
    if (!input) return;
    collectSyntaxEntries(input, definitions, {
      fallbackName: input.Varname,
      fallbackType: input.DataType ?? ''
    });
  });

  if (usecase.Output) {
    collectSyntaxEntries(usecase.Output, definitions, {
      fallbackName: usecase.Output.Varname || 'Output',
      fallbackType: usecase.Output.DataType ?? ''
    });
  }

  return definitions;
}

module.exports = { processSyntaxDefs };