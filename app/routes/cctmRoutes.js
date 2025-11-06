// routes/cctmRoutes.js
const express = require('express');
const multer = require('multer');
const { generateCCTMTestCases } = require('../services/cctmService');
// const { analyzeImpact } = require('../services/impactAnalyzer');
const path = require('path');
const router = express.Router();
const upload = multer({ dest: 'uploads/' });

/**
 * @route POST /api/cctm/upload
 * @desc Upload a single CCTM XML file
 */
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const xmlPath = req.file.path;
    const treeData = await parseCCTMXML(xmlPath);
    res.json({ message: 'CCTM file parsed successfully', treeData });
  } catch (error) {
    res.status(500).json({ error: 'Failed to parse CCTM XML file', details: error.message });
  }
});

/**
 * @route POST /api/cctm/merge
 * @desc Merge two CCTM XML files into a single classification tree
 */
router.post('/merge', upload.fields([{ name: 'file1' }, { name: 'file2' }]), async (req, res) => {
  try {
    const { file1, file2 } = req.files;
    const mergedTree = await mergeCCTMTree(file1[0].path, file2[0].path);
    res.json({ message: 'CCTM trees merged successfully', mergedTree });
  } catch (error) {
    res.status(500).json({ error: 'Failed to merge CCTM trees', details: error.message });
  }
});

/**
 * @route POST /api/cctm/generate
 * @desc Generate test cases from the merged tree
 */
router.post('/generate', upload.single('xmlFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No XML file uploaded. Please provide a file with field name "xmlFile".' });
    }
    const xmlFilePath = req.file.path; // path ของไฟล์ที่เพิ่ง upload
    const result = await generateCCTMTestCases(xmlFilePath);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * @route POST /api/cctm/analyze-impact
 * @desc Analyze impact of change between two CCTM versions
 */
router.post('/analyze-impact', upload.fields([{ name: 'oldVersion' }, { name: 'newVersion' }]), async (req, res) => {
  try {
    const { oldVersion, newVersion } = req.files;
    const result = await analyzeImpact(oldVersion[0].path, newVersion[0].path);
    res.json({ message: 'Impact analysis completed', result });
  } catch (error) {
    res.status(500).json({ error: 'Failed to analyze impact', details: error.message });
  }
});

module.exports = router;
