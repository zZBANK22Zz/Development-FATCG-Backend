const express = require("express");
const router = express.Router();
const upload = require("../middleware/upload.middleware");
const authMiddleware = require("../middleware/auth.middleware"); // ← เพิ่มบรรทัดนี้
const {
  createTestRun,
  listTestRuns,
  getTestRun,
  downloadEcpCsv,
  downloadSyntaxCsv,
  downloadStateCsv,
  downloadCombined,
} = require("../controller/testRun.Controller");
const validateUploadedXml = require("../utils/xmlValidator");

// ← เพิ่ม authMiddleware ทุก route
router.get("/:id/ecp-csv", authMiddleware, downloadEcpCsv);
router.get("/:id/syntax-csv", authMiddleware, downloadSyntaxCsv);
router.get("/:id/state-csv", authMiddleware, downloadStateCsv);
router.get("/:id/csv", authMiddleware, downloadCombined);

router.post(
  "/",
  authMiddleware, // ← เพิ่มบรรทัดนี้
  upload.fields([
    { name: "dataDictionary", maxCount: 1 },
    { name: "decisionTree", maxCount: 1 },
  ]),
  validateUploadedXml,
  createTestRun
);

router.get("/", authMiddleware, listTestRuns);
router.get("/:id", authMiddleware, getTestRun);

module.exports = router;