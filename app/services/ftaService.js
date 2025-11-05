const extractFaultScenarios = (ftaTree) => {
    const faultScenarios = [];

    const source = ftaTree?.topEvent ? ftaTree : ftaTree?.faultTree ? ftaTree.faultTree : ftaTree;
    const top = source?.topEvent;
    if (!top) {
      return faultScenarios;
    }

    const toArray = (maybeArr) => Array.isArray(maybeArr) ? maybeArr : (maybeArr ? [maybeArr] : []);
    const getLabel = (node) => node?.$?.label || node?.label || '';

    const traverse = (node, path = []) => {
      const currentPath = [...path, getLabel(node)];

      // children can be intermediateEvent or basicEvent
      const intermediate = toArray(node.intermediateEvent);
      const basics = toArray(node.basicEvent);

      if (intermediate.length === 0 && basics.length === 0) {
        // leaf
        faultScenarios.push(currentPath.filter(Boolean));
        return;
      }

      intermediate.forEach((child) => traverse(child, currentPath));
      basics.forEach((child) => traverse(child, currentPath));
    };

    traverse(top);
    return faultScenarios;
  };
  
module.exports = { extractFaultScenarios };
  