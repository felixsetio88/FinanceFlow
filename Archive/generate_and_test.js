const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { parseReceiptFromOCR } = require('./ocrParserNode.js');

function reconstructFullTextFromBlocks(blocks) {
    if (!blocks || blocks.length === 0) return '';
    const items = blocks.map(b => ({
        text: b.text.trim(),
        cx: b.bbox.x + (b.bbox.w / 2),
        cy: b.bbox.y + (b.bbox.h / 2),
        h: b.bbox.h
    })).filter(i => i.text.length > 0);
    
    items.sort((a, b) => a.cy - b.cy);
    const rows = [];
    let currentRow = [];
    
    for (const item of items) {
        if (currentRow.length === 0) {
            currentRow.push(item);
        } else {
            const rowCy = currentRow[0].cy;
            const threshold = Math.max(currentRow[0].h, item.h) * 0.5;
            if (Math.abs(item.cy - rowCy) <= threshold) {
                currentRow.push(item);
            } else {
                rows.push(currentRow);
                currentRow = [item];
            }
        }
    }
    if (currentRow.length > 0) rows.push(currentRow);
    
    const lines = rows.map(row => {
        row.sort((a, b) => a.cx - b.cx);
        return row.map(i => i.text).join(' ');
    });
    return lines.join('\n');
}

const PHOTOS_DIR = path.join(__dirname, 'receipt_photos');
const JSON_DIR = path.join(__dirname, 'json_result');

if (!fs.existsSync(JSON_DIR)) {
    fs.mkdirSync(JSON_DIR);
}

const files = fs.readdirSync(PHOTOS_DIR).filter(f => f.match(/\.(jpg|jpeg|png|heic)$/i));
console.log(`Found ${files.length} images to process...`);

for (const file of files) {
    console.log(`Processing ${file}...`);
    const ext = path.extname(file);
    const basename = path.basename(file, ext);
    const imagePath = path.join(PHOTOS_DIR, file);
    const jsonPath = path.join(JSON_DIR, `${basename}.json`);
    
    try {
        const stdout = execSync(`swift run_vision.swift "${imagePath}"`, { encoding: 'utf8' });
        const visionResult = JSON.parse(stdout.trim());
        
        if (!visionResult || !visionResult.blocks) {
            console.log(`  Failed to get vision blocks for ${file}`);
            continue;
        }
        
        const reconstructedText = reconstructFullTextFromBlocks(visionResult.blocks);
        
        if (reconstructedText.length < 10) {
            console.log(`  No text found in ${file}`);
            continue;
        }
        
        const parsedData = parseReceiptFromOCR(reconstructedText);
        
        if (parsedData) {
            fs.writeFileSync(jsonPath, JSON.stringify(parsedData, null, 2), 'utf8');
            console.log(`  ✅ Successfully parsed and saved ${basename}.json`);
        } else {
            console.log(`  ❌ Failed to parse receipt data from ${file}`);
            fs.writeFileSync(jsonPath, JSON.stringify({ error: "Failed to parse OCR text" }, null, 2), 'utf8');
        }
        
    } catch (e) {
        console.error(`  Error processing ${file}: ${e.message}`);
    }
}
console.log('Done!');
