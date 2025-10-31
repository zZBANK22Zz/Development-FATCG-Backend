// app/routes/cctm.teststore.route.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const upload = multer({ dest: path.join(__dirname, '../../uploads') });

/**
 * POST /api/cctm/store-existing
 * Form field: file (XML)
 * Stores the uploaded XML as the "existing" tree on server for merge testing.
 */
router.post('/store-existing', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success:false, error: 'No file' });
    const dst = path.join(__dirname, '../../uploads', 'existing_tree.xml');
    fs.renameSync(req.file.path, dst); // move temp file to fixed name
    return res.json({ success: true, message: 'stored', path: dst });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success:false, error: String(err) });
  }
});

module.exports = router;