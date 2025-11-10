const { generateFATCG } = require('../services/fatcgService');
const { parseXMLFile } = require('../utils/xmlParser');
const CctmModel = require('../model/cctmModel');
const FtaModel = require('../model/ftaModel');

const generateTestCases = async (req, res) => {
  try {
    let cctmData = req.body?.cctmData;
    let ftaData = req.body?.ftaData;

    // If files are provided (multipart/form-data), parse them as XML
    const cctmFile = req.files?.cctm?.[0];
    const ftaFile = req.files?.fta?.[0];

    if (cctmFile && ftaFile) {
      cctmData = await parseXMLFile(cctmFile.buffer);
      ftaData = await parseXMLFile(ftaFile.buffer);
    }

    if (!cctmData || !ftaData) {
      return res.status(400).json({ error: "Missing CCTM or FTA data" });
    }

    const testCases = generateFATCG(cctmData, ftaData);
    res.json({ total: testCases.length, testCases });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getTestCasesBySystemName = async (req, res) => {
  try {
    const { systemName } = req.query;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({ error: "User not authenticated" });
    }

    if (!systemName) {
      return res.status(400).json({ error: "System name is required" });
    }

    // Get CCTM test cases for the system
    const cctmSystem = await CctmModel.getCctmSystemByName(userId, systemName);
    
    // Get FTA test cases for the system
    const ftaSystems = await FtaModel.getFtaBySystemName(userId, systemName);

    // Combine test cases
    const combinedTestCases = [];
    
    // Add CCTM test cases
    if (cctmSystem && cctmSystem.test_cases && cctmSystem.test_cases.testCases) {
      const cctmCases = cctmSystem.test_cases.testCases.map(tc => ({
        id: tc.id,
        type: tc.type,
        source: 'CCTM',
        inputs: tc.inputs,
        systemName: systemName
      }));
      combinedTestCases.push(...cctmCases);
    }

    // Add FTA test cases
    if (ftaSystems && ftaSystems.length > 0) {
      ftaSystems.forEach(ftaSystem => {
        if (ftaSystem.test_case_data && ftaSystem.test_case_data.testCases) {
          const ftaCases = ftaSystem.test_case_data.testCases.map(tc => ({
            id: tc.id,
            type: tc.type || 'fault',
            source: 'FTA',
            inputs: tc.inputs || {},
            description: tc.description || '',
            triggers: tc.triggers || [],
            systemName: systemName,
            faultPatternType: ftaSystem.fault_pattern_type
          }));
          combinedTestCases.push(...ftaCases);
        }
      });
    }

    if (combinedTestCases.length === 0) {
      return res.status(404).json({ 
        error: `No test cases found for system "${systemName}"`,
        systemName,
        cctmFound: !!cctmSystem,
        ftaFound: ftaSystems.length > 0
      });
    }

    res.json({
      systemName,
      total: combinedTestCases.length,
      cctmCount: cctmSystem ? (cctmSystem.test_cases?.testCases?.length || 0) : 0,
      ftaCount: ftaSystems.reduce((sum, fta) => {
        return sum + (fta.test_case_data?.testCases?.length || 0);
      }, 0),
      testCases: combinedTestCases
    });
  } catch (error) {
    console.error('Error fetching test cases by system name:', error);
    res.status(500).json({ error: error.message });
  }
};

module.exports = { generateTestCases, getTestCasesBySystemName };
