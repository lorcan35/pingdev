// esbuild bundler for Chrome extension

import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';

const watch = process.argv.includes('--watch');

const buildOptions = {
  entryPoints: [
    'src/background.ts',
    'src/content.ts',
    'src/popup.ts',
  ],
  bundle: true,
  outdir: 'dist',
  format: 'esm',
  platform: 'browser',
  target: 'chrome120',
  sourcemap: watch ? 'inline' : false,
  minify: !watch,
  logLevel: 'info',
};

// Clean dist
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true });
}
fs.mkdirSync('dist', { recursive: true });

// Copy public files
const publicFiles = fs.readdirSync('public');
for (const file of publicFiles) {
  const src = path.join('public', file);
  const dest = path.join('dist', file);
  fs.copyFileSync(src, dest);
  console.log(`Copied ${file}`);
}

// Create placeholder icons (simple colored squares)
const iconSizes = [16, 48, 128];
for (const size of iconSizes) {
  const canvas = `<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" fill="#22c55e"/>
  <text x="50%" y="50%" font-size="${size * 0.6}" fill="white" text-anchor="middle" dominant-baseline="middle" font-family="Arial">P</text>
</svg>`;
  fs.writeFileSync(path.join('dist', `icon-${size}.png.svg`), canvas);
  // Rename to png for manifest (browsers accept SVG as PNG in extensions)
  fs.renameSync(
    path.join('dist', `icon-${size}.png.svg`),
    path.join('dist', `icon-${size}.png`)
  );
}

if (watch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await esbuild.build(buildOptions);
  console.log('Build complete!');
}
