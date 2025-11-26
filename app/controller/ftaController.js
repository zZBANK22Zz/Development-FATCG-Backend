const fs = require('fs').promises;
const path = require('path');
const { handleFtaXml } = require('../services/ftaService');
const FtaModel = require('../model/ftaModel');

async function generateFTATests(req, res) {
  try {
    let xmlContent;
    if (req.file) {
      xmlContent = await fs.readFile(req.file.path, 'utf-8');
    } else if (req.body && req.body.xml) {
      xmlContent = req.body.xml; // support raw XML in body
    } else {
      return res.status(400).json({ error: 'No XML provided (file or xml body).' });
    }

    // Get userId from request if authenticated (optional for backward compatibility)
    const userId = req.user?.id || null;

    const result = await handleFtaXml(xmlContent, userId);
    return res.json(result);
  } catch (err) {
    console.error('FTA generate error:', err);
    return res.status(500).json({ error: err.message });
  }
}

async function saveInvalidMappingPattern(req, res) {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const { xmlData, ftaData, systemName, testCaseName } = req.body;

    if (!xmlData) {
      return res.status(400).json({ error: 'XML data is required' });
    }

    if (!systemName || !testCaseName) {
      return res.status(400).json({ error: 'System name and test case name are required' });
    }

    const faultPatternType = 'invalid-mapping';
    
    // Save to database
    const savedFta = await FtaModel.saveFta(
      userId,
      ftaData || {}, // Can be empty object if not provided
      faultPatternType,
      systemName,
      testCaseName,
      xmlData
    );

    return res.json({
      success: true,
      message: 'Invalid Mapping Pattern saved successfully',
      data: {
        id: savedFta.id,
        systemName: savedFta.system_name,
        testCaseName: savedFta.test_case_name,
        faultPatternType: savedFta.fault_pattern_type,
        createdAt: savedFta.created_at
      }
    });
  } catch (err) {
    console.error('Save Invalid Mapping Pattern error:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { generateFTATests, saveInvalidMappingPattern };