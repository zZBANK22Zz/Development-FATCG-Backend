const mergeHandler = require('../utils/cctm/cctmMergeHandler');

async function mergeTrees(existingTree, newTree) {
  // returns merged tree and warnings if any
  const { merged, warnings } = mergeHandler.mergeClassificationTrees(existingTree, newTree);
  return { merged, warnings };
}

module.exports = { mergeTrees };
