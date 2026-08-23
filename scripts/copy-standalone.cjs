const fs = require('fs');
const path = require('path');

/**
 * Script de copia multiplataforma para despliegue standalone de Next.js.
 * Compatible con CommonJS para evitar warnings de typeless package.json.
 */
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`[copy-standalone] Origen no encontrado, omitiendo: ${src}`);
    return;
  }
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true });
  console.log(`[copy-standalone] Copiado ${src} -> ${dest}`);
}

const rootDir = process.cwd();
const standaloneDir = path.join(rootDir, '.next', 'standalone');

if (fs.existsSync(standaloneDir)) {
  console.log('[copy-standalone] Preparando carpeta standalone...');
  copyDir(path.join(rootDir, '.next', 'static'), path.join(standaloneDir, '.next', 'static'));
  copyDir(path.join(rootDir, 'public'), path.join(standaloneDir, 'public'));
  console.log('[copy-standalone] ¡Copia completada con éxito!');
} else {
  console.log('[copy-standalone] Carpeta .next/standalone no detectada, omitiendo copia.');
}
