const path = require('path');
const fs = require('fs');
const { generateCCTMTestCases } = require('../services/cctm.Service');

async function uploadCCTMFile(req, res){
    try{
        if(!req.file)return res.status(400).json({error: 'No file uploaded'});
        const xmlFile = req.file.path;
        const result = await generateCCTMTestCases(xmlFile, { threshold: Number(req.body.threshold) || 10000});
        try{ fs.unlinkSync(xmlFile); }catch(e){}
        res.status(200).json({ success: true, ...result });
    } catch(error){
        console.error('Error generating CCTM test cases:', error);
        return res.status(500).json({error: 'Failed to generate CCTM test cases'});
    }
}

module.exports = { uploadCCTMFile };