const express = require('express');
const router = express.Router();
const ecpController = require('../controller/ecp.controller');
const upload = require('../middleware/upload.middleware');

// POST /api/ecp/analyze
router.post('/analyze', upload.single('dataFile'), ecpController.analyzeFile);

module.exports = router;