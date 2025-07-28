/**
 * this scripts helps us automate some fixes to allows us to deploy our site with github pages
 * leading slashes break path leading to assets not being accessed correctly.
 * redirects need to access assets in the root directory
 * static files are generated a level above css files nested in folders.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.join(__dirname, '../dist');

/**
 * Fix HTML files by:
 * - Removing leading slash and underscore (e.g., /_astro/...) in href/src
 * - Rewriting href/src to correct relative path depending on nesting
 */
function fixHtmlFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  // Remove leading slash + underscore from known assets (1st pass cleanup)
  content = content
    .replace(/href="\/_(astro\/[^"]+\.css)"/g, 'href="$1"')
    .replace(/src="\/_(astro\/[^"]+\.(webp|js))"/g, 'src="$1"')
    .replace(/(href|src)="\/(favicon\.ico|sitemap-index\.xml)"/g, '$1="$2"');

  // Determine relative depth from /dist
  const fileDir = path.dirname(filePath);
  const relativePath = path.relative(distDir, fileDir);
  const depth = relativePath === '' ? 0 : relativePath.split(path.sep).length;
  const prefix = '../'.repeat(depth);

  if (path.basename(filePath) === 'index.html' && depth > 0) {
    content = content
      // href="css/..." → href="../../css/..."
      .replace(/href="(css\/[^"]+)"/g, (_, p1) => `href="${prefix}${p1}"`)
      // href="astro/..." → href="../../astro/..."
      .replace(/href="(astro\/[^"]+)"/g, (_, p1) => `href="${prefix}${p1}"`)
      // src="astro/..." (webp or js) → src="../../astro/..."
      .replace(/src="(astro\/[^"]+\.(webp|js))"/g, (_, p1) => `src="${prefix}${p1}"`)
      // fix favicon/sitemap paths
      .replace(
        /(href|src)="(favicon\.ico|sitemap-index\.xml)"/g,
        (_, attr, file) => `${attr}="${prefix}${file}"`
      )
      // PDF (resume) path fix
      .replace(
        /href="(Alex%20Mbugua%20Ngugi%20-%20Resume\.pdf)"/g,
        (_, p1) => `href="${prefix}${p1}"`
      )
      // Fix <script type="module" src="astro/...">
      .replace(
        /<script([^>]+?)src="(astro\/[^"]+\.js)"/g,
        (_, attrs, src) => `<script${attrs}src="${prefix}${src}"`
      );
  }

  if (content !== original) {
    console.log(`✅ Fixed paths in HTML: ${filePath}`);
    fs.writeFileSync(filePath, content);
  }
}

/**
 * Fix CSS files:
 * - Rewrites url(/...) → url(../...)
 */
function fixCssFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const original = content;

  content = content.replace(/url\(\s*['"]?\/([^)'"]+)['"]?\s*\)/g, 'url(../$1)');

  if (content !== original) {
    console.log(`✅ Fixed url() path in CSS: ${filePath}`);
    fs.writeFileSync(filePath, content);
  }
}

/**
 * Walk the dist/ directory and apply fixes
 */
function walkAndFix(dir) {
  for (const file of fs.readdirSync(dir)) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkAndFix(fullPath);
    } else if (file.endsWith('.html')) {
      fixHtmlFile(fullPath);
    } else if (file.endsWith('.css')) {
      fixCssFile(fullPath);
    }
  }
}

// Main
console.log('🔧 Running pre-deploy fixes...');
walkAndFix(distDir);
console.log('🎉 All done!');
