import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const file = path.join(__dirname, 'node_modules', '@artcom', 'react-three-arjs', 'lib', 'ar', 'ar.js');

try {
  let code = fs.readFileSync(file, 'utf8');

  // Fix the React 18 unmount crash by checking if arController exists before disposing
  code = code.replace(
    'arContext.arToolkitContext.arController.dispose();',
    'if (arContext.arToolkitContext.arController) { arContext.arToolkitContext.arController.dispose(); }'
  );

  code = code.replace(
    'if (arContext.arToolkitContext.arController.cameraParam)',
    'if (arContext.arToolkitContext.arController && arContext.arToolkitContext.arController.cameraParam)'
  );

  // Fix the "Cannot read properties of null (reading 'getTracks')" crash
  code = code.replace(
    'video.srcObject.getTracks().map(function (track)',
    '(video.srcObject ? video.srcObject.getTracks() : []).map(function (track)'
  );

  // Fix React 18 Strict Mode / R3F re-render teardown bugs
  // By removing the unstable dependencies, the effect only runs on mount and unmount!
  code = code.replace(
    '}, [arContext, camera, onCameraStreamReady, onCameraStreamError, onResize, onUnmount]);',
    '}, []);'
  );

  fs.writeFileSync(file, code);
  console.log('Successfully patched @artcom/react-three-arjs unmount bug!');
} catch (e) {
  console.log('Patching skipped or failed:', e.message);
}
