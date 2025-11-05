const generateCCTMTestCases = (tree) => {
    const source = tree?.root ? tree : tree?.classificationTree ? tree.classificationTree : tree;

    const root = source?.root;
    const validCases = [];
    const invalidCases = [];

    if (!root) {
      return { validCases, invalidCases };
    }

    const toArray = (maybeArr) => Array.isArray(maybeArr) ? maybeArr : (maybeArr ? [maybeArr] : []);
    const getName = (node) => node?.$?.name || node?.name || '';
    const getType = (node) => node?.$?.type || node?.type || '';

    const classifications = toArray(root.classification);
    classifications.forEach((classificationNode) => {
      const classificationName = getName(classificationNode);
      const classes = toArray(classificationNode.class);
      classes.forEach((classNode) => {
        const className = getName(classNode);
        const classType = getType(classNode);
        const testCase = { classification: classificationName, node: className };
        if (classType === 'valid') {
          validCases.push(testCase);
        } else if (classType === 'invalid') {
          invalidCases.push(testCase);
        }
      });
    });

    return { validCases, invalidCases };
  };

module.exports = { generateCCTMTestCases };
  