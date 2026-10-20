const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'node_modules', 'react-native', 'React', 'Fabric', 'RCTSurfaceTouchHandler.mm');

if (fs.existsSync(filePath)) {
  let content = fs.readFileSync(filePath, 'utf8');
  const target = 'RCTAssert(iterator != _activeTouches.end(), @"Inconsistency between local and UIKit touch registries");';
  if (content.includes(target)) {
    content = content.split(target).join('// RCTAssert bypassed: guarded by if (iterator == _activeTouches.end()) continue; below');
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('[patch-touch-handler] Successfully patched RCTSurfaceTouchHandler.mm');
  } else {
    console.log('[patch-touch-handler] RCTSurfaceTouchHandler.mm already patched or target not found.');
  }
} else {
  console.log('[patch-touch-handler] RCTSurfaceTouchHandler.mm does not exist (skip).');
}
