const fs = require('fs');
const ocr = fs.readFileSync('./ocrParserNode.js', 'utf8');
const script = ocr.replace('module.exports = { parseReceiptFromOCR };', '') + `
const lines = [
  'DeSa Kitsune',
  'BALI',
  'Jl. Munduk Catu No.9 Canggu',
  'Kuta Utara, Badung, Bali',
  'Cafe Kitsune',
  '16 Rian',
  'CHK 17978 TBL CK3/1 GST 1',
  '12 Jul\\'26 16:29 PM',
  '1 Ice chai latte 55000',
  'Reguler Milk',
  '1 Sea Salt Latte 60000',
  'Reguler Milk',
  '1 Ice Cappuccino 58000',
  'Reguler Milk',
  'Subtotal Rp173,000',
  'SVC & VF 10% Rp17,300',
  'TAX Rp19,030',
  'Payment Due Rp209,330',
  'THANK YOU FOR VISITING US',
  '* Kindly show this receipt to receive',
  'COMPLIMENTARY PARKING *'
];
console.log(JSON.stringify(parseReceiptFromOCR(lines.join('\\n')), null, 2));
`;
fs.writeFileSync('./debug_ocr.js', script);
require('./debug_ocr.js');
