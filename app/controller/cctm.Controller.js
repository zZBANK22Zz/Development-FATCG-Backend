const path = require('path');
const fs = require('fs');
const { generateCCTMTestCases } = require('../services/cctm.Service');
const TestRun = require('../model/TestRun.Model');

async function uploadCCTMFile(req, res){
    try{
        if(!req.file)return res.status(400).json({error: 'No file uploaded'});
        
        // Get userId from authenticated user (optional - for comparison with previous version)
        const userId = req.user?.id || null;
        
        // Get base tree XML from request body (optional fallback)
        const baseTreeXml = req.body.baseTreeXml || null;
        const threshold = Number(req.body.threshold) || 10000;
        
        // Read the uploaded file content
        const xmlFile = req.file.path;
        const xmlContent = fs.readFileSync(xmlFile, 'utf8');
        
        // Generate test cases with comparison to previous version
        const result = await generateCCTMTestCases(xmlContent, { 
            userId,
            threshold,
            baseTreeXml 
        });
        
        // Save the new tree structure to database for future comparisons
        if (userId && result.mergedTree) {
            try {
                // Parse the tree structure to save
                const { parseXmlString } = require('../services/cctm.Service');
                const treeStructure = await parseXmlString(xmlContent);
                await TestRun.saveCctmTreeStructure(userId, treeStructure);
            } catch (saveError) {
                console.warn('Failed to save tree structure:', saveError);
                // Don't fail the request if saving structure fails
            }
        }
        
        // Clean up uploaded file
        try{ fs.unlinkSync(xmlFile); }catch(e){}
        
        res.status(200).json({ success: true, ...result });
    } catch(error){
        console.error('Error generating CCTM test cases:', error);
        return res.status(500).json({error: 'Failed to generate CCTM test cases', detail: error.message});
    }
}

async function saveCCTMTestCases(req, res) {
    try {
        if (!req.user || !req.user.id) {
            return res.status(401).json({ success: false, error: 'Unauthorized: missing user id' });
        }

        const { 
            testCases, 
            variables, 
            partitions,
            dataDictionaryFilename,
            threshold,
            treeStructure, // New: tree structure to save
            diff, // New: diff information
            impact // New: impact analysis
        } = req.body;

        if (!testCases || !Array.isArray(testCases)) {
            return res.status(400).json({ success: false, error: 'testCases array is required' });
        }

        // Format partitions for database (similar to ECP format)
        const formattedPartitions = partitions?.map((p, idx) => ({
            name: p.variable?.name || `Partition ${idx + 1}`,
            items: p.reps?.map((rep, repIdx) => ({
                id: rep.tc?.id || `item-${idx}-${repIdx}`,
                label: rep.tc?.label || '',
                sample: rep.sample || {}
            })) || []
        })) || [];

        // Format test cases for database
        const formattedTestCases = testCases.map((tc, idx) => ({
            testCaseID: tc.testCaseID || `TC${String(idx + 1).padStart(3, '0')}`,
            type: tc.type || 'Valid',
            inputs: tc.inputs || {},
            expected: tc.expected || {}
        }));

        // Generate CSV data for test cases
        const csvHeaders = ['Test Case ID', 'Type', ...Object.keys(formattedTestCases[0]?.inputs || {}), ...Object.keys(formattedTestCases[0]?.expected || {})];
        const csvRows = formattedTestCases.map(tc => {
            const row = [tc.testCaseID, tc.type];
            Object.values(tc.inputs || {}).forEach(val => row.push(val));
            Object.values(tc.expected || {}).forEach(val => row.push(val));
            return row.join(',');
        });
        const csvData = [csvHeaders.join(','), ...csvRows].join('\n');

        // Save to database
        const created = await TestRun.create(req.user.id, {
            dataDictionaryFilename: dataDictionaryFilename || 'cctm-tree.xml',
            decisionTreeFilename: null,
            stateTransitionFilename: null,
            partitions: formattedPartitions,
            testCases: formattedTestCases,
            syntaxResults: [],
            stateTests: [],
            stateSequences: [],
            stateTreeNodes: treeStructure ? JSON.stringify(treeStructure) : null,
            stateTreeLinks: diff ? JSON.stringify({ diff, impact }) : null,
            ecpCsvData: csvData,
            syntaxCsvData: '',
            stateCsvData: '',
            stateSeqCsvData: '',
            combinedCsvData: csvData
        });
        
        // Also save tree structure separately for future comparisons
        if (treeStructure) {
            try {
                await TestRun.saveCctmTreeStructure(req.user.id, treeStructure);
            } catch (saveError) {
                console.warn('Failed to save tree structure separately:', saveError);
            }
        }

        const base = `${req.protocol}://${req.get('host')}/api/runs/${created.id}`;
        return res.json({
            success: true,
            runId: created.id,
            testCases: formattedTestCases,
            partitions: formattedPartitions,
            csvUrl: `${base}/csv`,
            message: 'Test cases saved successfully'
        });
    } catch (error) {
        console.error('Error saving CCTM test cases:', error);
        return res.status(500).json({ success: false, error: error.message });
    }
}

module.exports = { uploadCCTMFile, saveCCTMTestCases };