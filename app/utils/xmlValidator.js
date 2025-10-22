// backend/utils/xmlValidator.js
const { parseXMLFile } = require('./xmlParser');

module.exports = async function validateUploadedXml(req, res, next) {
  // grab Multer’s uploaded file objects
  const ddFile = req.files.dataDictionary?.[0];
  const dtFile = req.files.decisionTree  ?. [0];
  const smFile = req.files.stateMachine  ?. [0]; // optional

  // both Data Dictionary and Decision Tree are required
  if (!ddFile || !dtFile) {
    console.warn('[Validator] Missing one or both XML uploads');
    return res
      .status(400)
      .json({
        success: false,
        error: 'Both Data Dictionary and Decision Tree XML files are required.'
      });
  }

  // 1) Validate the Data Dictionary XML (from in-memory buffer)
  try {
    await parseXMLFile(ddFile.buffer);
    console.log(`[Validator] ✅ Parsed DataDictionary XML: ${ddFile.originalname}`);
  } catch (err) {
    console.error(
      `[Validator] ❌ DataDictionary parse error (${ddFile.originalname}): ${err.message}`
    );
    return res
      .status(400)
      .json({
        success: false,
        error: `Invalid Data Dictionary XML (${ddFile.originalname}): ${err.message}`
      });
  }

  // 2) Validate the Decision Tree XML (from in-memory buffer)
  try {
    await parseXMLFile(dtFile.buffer);
    console.log(`[Validator] ✅ Parsed DecisionTree XML: ${dtFile.originalname}`);
  } catch (err) {
    console.error(
      `[Validator] ❌ DecisionTree parse error (${dtFile.originalname}): ${err.message}`
    );
    return res
      .status(400)
      .json({
        success: false,
        error: `Invalid Decision Tree XML (${dtFile.originalname}): ${err.message}`
      });
  }

  // 3) Optional: Validate State Machine XML if provided
  if (smFile && smFile.buffer) {
    try {
      await parseXMLFile(smFile.buffer);
    } catch (err) {
      return res.status(400).json({
        success: false,
        error: `Invalid State Machine XML (${smFile.originalname}): ${err.message}`
      });
    }
  }

  // all uploads are well-formed XML; proceed
  next();
};