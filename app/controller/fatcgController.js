const { generateFATCG } = require('../services/fatcgService');
const { parseXMLFile } = require('../utils/xmlParser');

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

module.exports = { generateTestCases };
