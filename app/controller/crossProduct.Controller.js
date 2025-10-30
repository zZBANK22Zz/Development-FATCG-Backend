// controller/crossProduct.Controller.js
// Purpose: Handle cross-product ECP generation endpoints

const { generateCrossProductArtifacts } = require('../services/crossProductService');

/**
 * POST /api/crossproduct
 * Generate cross-product ECP test cases from uploaded Data Dictionary XML
 * 
 * Expected files:
 * - dataDictionary: XML file
 */
exports.generateCrossProduct = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    // Get the Data Dictionary buffer from multer
    const dataDictionaryBuffer = req.files?.dataDictionary?.[0]?.buffer;
    
    if (!dataDictionaryBuffer) {
      return res.status(400).json({
        success: false,
        error: 'Data Dictionary XML file is required'
      });
    }

    // Generate cross-product artifacts
    const artifacts = await generateCrossProductArtifacts(dataDictionaryBuffer);

    return res.status(200).json({
      success: true,
      data: {
        validCases: artifacts.validCases,
        invalidCases: artifacts.invalidCases,
        totalValidCases: artifacts.validCases.length,
        totalInvalidCases: artifacts.invalidCases.length,
        totalCases: artifacts.validCases.length + artifacts.invalidCases.length,
        crossCsv: artifacts.crossCsv,
        embedded: artifacts.validCases.length > 0 && artifacts.crossCsv ? true : false
      }
    });
  } catch (error) {
    console.error('Error generating cross-product:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate cross-product test cases'
    });
  }
};

/**
 * POST /api/crossproduct/csv
 * Generate cross-product and return only the CSV data
 */
exports.generateCrossProductCsv = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    const dataDictionaryBuffer = req.files?.dataDictionary?.[0]?.buffer;
    
    if (!dataDictionaryBuffer) {
      return res.status(400).json({
        success: false,
        error: 'Data Dictionary XML file is required'
      });
    }

    const artifacts = await generateCrossProductArtifacts(dataDictionaryBuffer);

    // Set CSV headers
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="cross_product_test_cases.csv"');

    return res.status(200).send(artifacts.crossCsv);
  } catch (error) {
    console.error('Error generating cross-product CSV:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate cross-product CSV'
    });
  }
};

