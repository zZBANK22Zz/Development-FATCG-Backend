const express = require('express');
const multer = require('multer');
const path = require('path');
const { uploadCCTMFile, saveCCTMTestCases } = require('../controller/cctm.Controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();
const uploadDestination = path.join(__dirname, '../../uploads');
const upload = multer({ dest: uploadDestination });

// Optional auth middleware - allows both authenticated and unauthenticated requests
const optionalAuth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    // If token exists, try to authenticate
    return authMiddleware(req, res, next);
  }
  // If no token, continue without authentication
  next();
};

router.post('/upload', upload.single('file'), optionalAuth, uploadCCTMFile);
router.post('/save', authMiddleware, saveCCTMTestCases);

module.exports = router;