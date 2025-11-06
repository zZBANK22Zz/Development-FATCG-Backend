// utils/ecp/dataDictionaryConverter.js
const fs = require('fs').promises;
const path = require('path');

// Helper: ensure array
const toArray = (maybeArr) =>
  Array.isArray(maybeArr) ? maybeArr : (maybeArr ? [maybeArr] : []);

// Extract name/type from XML node
const getName = (node) => node?.$?.name || node?.name || '';

async function convertTreeToDataDictionary(tree) {
  const root = tree?.root || tree?.classificationTree?.root;
  if (!root) throw new Error('Invalid CTM structure: root missing');

  const classifications = [];
  const classificationNodes = toArray(root.classification);

  classificationNodes.forEach((cNode) => {
    const classificationName = getName(cNode);
    const classNodes = toArray(cNode.class);

    const classes = classNodes.map((cls) => {
      const className = getName(cls);
      const classType = cls?.$?.type || cls?.type || 'valid';
      return { name: className, type: classType };
    }).filter(cls => cls.name);

    classifications.push({
      name: classificationName,
      classes,
    });
  });

  // ✅ Ensure temp directory exists before writing
  const tempDir = path.join(__dirname, '../../temp');
  await fs.mkdir(tempDir, { recursive: true });

  // Prepare Data Dictionary object
  const dataDict = { classifications };

  // Write to temporary JSON file (for ECP cross-product generator)
  const outputPath = path.join(tempDir, 'dataDictionary.json');
  await fs.writeFile(outputPath, JSON.stringify(dataDict, null, 2), 'utf-8');

  return outputPath; // return path for crossProductService
}

module.exports = { convertTreeToDataDictionary };
