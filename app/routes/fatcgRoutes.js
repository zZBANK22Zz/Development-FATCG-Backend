const express = require("express");
const upload = require("../middleware/upload.middleware");
const { generateTestCases } = require("../controller/fatcgController");

const router = express.Router();

// Accept either JSON body or multipart/form-data with files named "cctm" and "fta"
router.post(
  "/generate",
  upload.fields([
    { name: "cctm", maxCount: 1 },
    { name: "fta", maxCount: 1 },
  ]),
  generateTestCases
);

module.exports = router;
