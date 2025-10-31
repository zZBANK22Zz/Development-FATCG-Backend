const fs = require('fs');
const { parseStringPromise } = require('xml2js');

/**
 * parseCctmXml(filePath) -> Promise<Variable[]>
 * Variable: { name, type, terminalClasses: [ { id, label, min, max, values, valid } ] }
 */
async function parseCctmXml(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const doc = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true });

  const rawVars = [].concat(doc.DataDictionary?.Variable || []);
  const variables = rawVars.map((v, idx) => {
    const type = (v.Type || 'string').toLowerCase();
    const terminalClasses = [];

    if (v.Range) {
      const ranges = [].concat(v.Range);
      ranges.forEach((r, i) => {
        terminalClasses.push({
          id: `${v.Name}-range-${i}`,
          label: r.label || `${r.Min}-${r.Max}`,
          min: r.Min !== undefined ? Number(r.Min) : undefined,
          max: r.Max !== undefined ? Number(r.Max) : undefined,
          valid: r.valid === undefined ? true : (r.valid === 'true' || r.valid === true)
        });
      });
    }

    if (v.Enum) {
      const vals = [].concat(v.Enum.Value || []);
      vals.forEach((val, i) => {
        terminalClasses.push({
          id: `${v.Name}-enum-${i}`,
          label: `${v.Name}=${val}`,
          values: [String(val)],
          valid: true
        });
      });
      // optional invalid-other
      terminalClasses.push({ id: `${v.Name}-enum-invalid`, label: `${v.Name}=other`, values: [], valid: false });
    }

    return { name: v.Name, type, terminalClasses };
  });

  return variables;
}

module.exports = parseCctmXml;
