const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

console.log('Ì¥® Building HIC AI website...\n');

// Ensure dist directories exist
fs.mkdirSync(path.join(distDir, 'styles'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'assets'), { recursive: true });

// Copy HTML files
console.log('Ì≥Ñ Copying HTML...');
const htmlFiles = fs.readdirSync(srcDir).filter(f => f.endsWith('.html'));
for (const file of htmlFiles) {
  fs.copyFileSync(path.join(srcDir, file), path.join(distDir, file));
  console.log(`   ‚Üí ${file}`);
}

// Copy assets if they exist
const assetsDir = path.join(srcDir, 'assets');
if (fs.existsSync(assetsDir)) {
  console.log('Ì∂ºÔ∏è  Copying assets...');
  const assets = fs.readdirSync(assetsDir);
  for (const file of assets) {
    fs.copyFileSync(path.join(assetsDir, file), path.join(distDir, 'assets', file));
    console.log(`   ‚Üí ${file}`);
  }
}

// Build Tailwind CSS
console.log('Ìæ® Building CSS with Tailwind...');
execSync('npx tailwindcss -i src/styles/main.css -o dist/styles/main.css --minify', {
  cwd: rootDir,
  stdio: 'inherit'
});

// Copy CNAME if exists
const cnamePath = path.join(rootDir, 'CNAME');
if (fs.existsSync(cnamePath)) {
  fs.copyFileSync(cnamePath, path.join(distDir, 'CNAME'));
  console.log('Ìºê Copied CNAME');
}

console.log('\n‚úÖ Build complete! Output in dist/');
