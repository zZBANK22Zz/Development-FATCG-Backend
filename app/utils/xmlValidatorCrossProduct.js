// utils/xmlValidatorCrossProduct.js
// Lightweight XML validator for cross-product endpoints (dataDictionary only)
const { parseXMLFile } = require('./xmlParser');

module.exports = async function validateCrossProductXml(req, res, next) {
  const ddFile = req.files?.dataDictionary?.[0];

  // Data Dictionary is required for cross-product
  if (!ddFile) {
    console.warn('[CrossProduct Validator] Missing Data Dictionary XML upload');
    return res
      .status(400)
      .json({
        success: false,
        error: 'Data Dictionary XML file is required.'
      });
  }

  // Validate the Data Dictionary XML (from in-memory buffer)
  try {
    await parseXMLFile(ddFile.buffer);
    console.log(`[CrossProduct Validator] ✅ Parsed DataDictionary XML: ${ddFile.originalname}`);
  } catch (err) {
    console.error(
      `[CrossProduct Validator] ❌ DataDictionary parse error (${ddFile.originalname}): ${err.message}`
    );
    return res
      .status(400)
      .json({
        success: false,
        error: `Invalid Data Dictionary XML (${ddFile.originalname}): ${err.message}`
      });
  }

  // XML is well-formed; proceed
  next();
};

