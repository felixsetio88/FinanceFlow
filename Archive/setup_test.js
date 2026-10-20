const fs = require('fs');

const content = fs.readFileSync('services/ocrService.js', 'utf8');

let newContent = content.replace(/import .+/g, (match) => `// ${match}`);
newContent = newContent.replace(/export async function runOCR/g, 'async function runOCR');
newContent = newContent.replace(/export function isOCRAvailable/g, 'function isOCRAvailable');
newContent = newContent.replace(/export function parseReceiptFromOCR/g, 'function parseReceiptFromOCR');
newContent = newContent.replace(/export async function runOCRAndParse/g, 'async function runOCRAndParse');

newContent += `\n\nmodule.exports = { parseReceiptFromOCR };`;

fs.writeFileSync('ocrParserNode.js', newContent, 'utf8');
console.log('Created ocrParserNode.js');
