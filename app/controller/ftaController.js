const fs = require('fs').promises;
const path = require('path');
const { handleFtaXml } = require('../services/ftaService');

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

    const result = await handleFtaXml(xmlContent);
    return res.json(result);
  } catch (err) {
    console.error('FTA generate error:', err);
    return res.status(500).json({ error: err.message });
  }
}

module.exports = { generateFTATests };