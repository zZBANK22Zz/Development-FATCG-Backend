const parseCctmXml = require('../utils/cctm/cctmXmlParser');
const buildClassificationTree = require('../utils/cctm/cctmTreeBuilder');
const mergeClassificationTrees = require('../utils/cctm/cctmMergeHandler');
const cctmSampleGenerator = require('../utils/cctm/cctmSampleGenerator');
const generateTestCases = require('../utils/cctm/cctmTestCaseGenerator');
const cctmReducer = require('../utils/cctm/cctmReducer');

const { createEcpPartitions } = require('../utils/ecp/ecpPartitionBuilder') || {};

async function generateCCTMTestCases(xmlFile, options = {}){
    //1. parse
    const variable = await parseCctmXml(xmlFile);
    //2. build classification tree
    const initialTree = await buildClassificationTree(variable);
    //3. merge classification trees
    const mergedTree = await mergeClassificationTrees(initialTree);
    //4. creat ECP partitions using exiting ECP unils
    let partitions = [];
    if(typeof createEcpPartitions === 'function'){
        partitions = await createEcpPartitions(mergedTree);
    } else {
        // fallback: create simple partitions from terminalClasses (each terminal class => one partition)
        partitions = mergedTree.map(v => ({
          variable: v,
          reps: v.terminalClasses.map(tc => ({ tc, sample: cctmSampleGenerator.sampleValueOf(tc, v.type), variable: v }))
        }));
      }
    //5. generate test cases (with threshold and optional reducer)
    const threshold = options.threshold || 10000;
    let testCases = await generateTestCases(partitions, threshold);
      
    //6. if too large, try reducer
    if(testCases.length > threshold){
        testCases = cctmReducer.applyReduction(testCases, {cap: threshold});
    }
    
    //7. dedupe already handled in genereator; return result
    return { variable: mergedTree, partitions, testCases, stats: {total: testCases.length} };
    
}

module.exports = { generateCCTMTestCases };