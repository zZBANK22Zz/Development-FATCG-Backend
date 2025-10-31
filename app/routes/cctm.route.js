const express = require('express');
const multer = require('multer');
const path = require('path');
const { uploadCCTMFile } = require('../controller/cctm.Controller');

const router = express.Router();
const uploadDestination = path.join(__dirname, '../../uploads');
const upload = multer({ dest: uploadDestination });

router.post('/upload', upload.single('file'), uploadCCTMFile);

module.exports = router;