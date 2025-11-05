const { generateCCTMTestCases } = require("./cctmService.js");
const { extractFaultScenarios } = require("./ftaService.js");

const generateFATCG = (cctmData, ftaData) => {
  const cctmCases = generateCCTMTestCases(cctmData);
  const faultScenarios = extractFaultScenarios(ftaData);

  const combined = [
    ...cctmCases.validCases,
    ...cctmCases.invalidCases,
    ...faultScenarios.map(f => ({ type: "fault", scenario: f })),
  ];
  return combined;
};

module.exports = { generateFATCG };
