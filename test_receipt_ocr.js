const fs = require('fs');
const path = require('path');

const PHOTOS_DIR = path.join(__dirname, 'receipt_photos');
const JSON_DIR = path.join(__dirname, 'json_result');

function validateJsonStructure(data, filename) {
  const errors = [];
  
  if (!data.storeName || typeof data.storeName !== 'string') {
    errors.push('Missing or invalid storeName');
  }
  
  if (!data.date || !/^\d{4}-\d{2}-\d{2}(T.*)?$/.test(data.date)) {
    errors.push('Missing or invalid date (expected YYYY-MM-DD)');
  }
  
  if (!Array.isArray(data.items)) {
    errors.push('Missing or invalid items array');
  } else {
    data.items.forEach((item, index) => {
      if (!item.name) errors.push(`Item ${index} missing name`);
      if (typeof item.quantity !== 'number') errors.push(`Item ${index} missing or invalid quantity`);
      if (typeof item.price !== 'number') errors.push(`Item ${index} missing or invalid price`);
    });
  }
  
  if (typeof data.total !== 'number') {
    errors.push('Missing or invalid total');
  }
  
  return errors;
}

async function runTests() {
  console.log('Starting Automated Receipt OCR Tests...\n');
  
  if (!fs.existsSync(PHOTOS_DIR)) {
    console.error(`Photos directory not found: ${PHOTOS_DIR}`);
    return;
  }
  
  if (!fs.existsSync(JSON_DIR)) {
    console.error(`JSON directory not found: ${JSON_DIR}`);
    return;
  }

  const files = fs.readdirSync(PHOTOS_DIR).filter(file => {
    return file.match(/\.(jpg|jpeg|png|heic)$/i);
  });
  
  let passed = 0;
  let failed = 0;

  for (const file of files) {
    const ext = path.extname(file);
    const basename = path.basename(file, ext);
    const jsonFilename = `${basename}.json`;
    const jsonPath = path.join(JSON_DIR, jsonFilename);
    
    console.log(`Testing: ${file}`);
    
    if (!fs.existsSync(jsonPath)) {
      console.log(`❌ FAILED: Missing JSON file for ${file} -> Expected ${jsonFilename}`);
      failed++;
      console.log('---');
      continue;
    }
    
    try {
      const jsonContent = fs.readFileSync(jsonPath, 'utf8');
      const parsedData = JSON.parse(jsonContent);
      
      const validationErrors = validateJsonStructure(parsedData, jsonFilename);
      
      if (validationErrors.length > 0) {
        console.log(`❌ FAILED: JSON structure invalid for ${jsonFilename}`);
        validationErrors.forEach(err => console.log(`   - ${err}`));
        failed++;
      } else {
        console.log(`✅ PASSED: ${jsonFilename} is valid and matches expected structure.`);
        console.log(`   Store: ${parsedData.storeName}`);
        console.log(`   Total: ${parsedData.total}`);
        passed++;
      }
    } catch (e) {
      console.log(`❌ FAILED: Could not parse JSON for ${jsonFilename}. Error: ${e.message}`);
      failed++;
    }
    
    console.log('---');
  }
  
  console.log(`\nTest Summary:`);
  console.log(`Total Images Tested: ${files.length}`);
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  
  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
