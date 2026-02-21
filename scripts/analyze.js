const fs = require('fs');
const path = require('path');

const dirs = [
  'packages/std/src',
  'packages/cli/src',
  'packages/mcp-server/src',
  'packages/chrome-extension/src',
];

function findTsFiles(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      if (file !== '__tests__') findTsFiles(fullPath, fileList);
    } else if (fullPath.endsWith('.ts') && !fullPath.endsWith('.d.ts')) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

let allFiles = [];
for (const dir of dirs) {
  allFiles = allFiles.concat(findTsFiles(dir));
}
allFiles.sort();

let md = "## 1. File-by-File Documentation" + String.fromCharCode(10) + String.fromCharCode(10);

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  
  let purpose = '';
  const lines = content.split(String.fromCharCode(10));
  let commentLines = [];
  for (const line of lines) {
    if (line.startsWith('//')) {
      commentLines.push(line.replace(/^\/\/\s*/, ''));
    } else if (line.trim() === '') {
      continue;
    } else if (line.startsWith('/*')) {
      // ignore multiline block for simplicity or just break
      break;
    } else {
      break;
    }
  }
  purpose = commentLines.join(' ');
  if (!purpose) purpose = 'Core logic file.';
  if (purpose.length > 300) purpose = purpose.substring(0, 300) + '...';

  const exportRegex = /export\s+(?:async\s+)?(?:const|let|var|function|class|interface|type)\s+([a-zA-Z0-9_]+)/g;
  let exports = [];
  let m;
  while ((m = exportRegex.exec(content)) !== null) {
    exports.push(m[1]);
  }
  
  const exportListRegex = /export\s+\{([^}]+)\}/g;
  while ((m = exportListRegex.exec(content)) !== null) {
    const items = m[1].split(',').map(s => s.trim().split(/\s+as\s+/)[0]).filter(Boolean);
    exports = exports.concat(items);
  }
  exports = [...new Set(exports.filter(e => !e.includes('eslint') && e !== 'default'))];

  const importRegex = /import\s+(?:type\s+)?(?:[^{"']+\s+from\s+)?['"]([^'"]+)['"]/g;
  let imports = [];
  while ((m = importRegex.exec(content)) !== null) {
    imports.push(m[1]);
  }
  imports = [...new Set(imports.filter(Boolean))];

  md += "### `" + file + "`" + String.fromCharCode(10);
  md += "- **Purpose**: " + purpose + String.fromCharCode(10);
  md += "- **Key Exports**: " + (exports.length > 0 ? exports.join(', ') : '(None)') + String.fromCharCode(10);
  md += "- **Dependencies**: " + (imports.length > 0 ? imports.join(', ') : '(None)') + String.fromCharCode(10);
  md += "- **Architecture Role**: Forms part of the `" + file.split('/')[1] + "` package functionality." + String.fromCharCode(10) + String.fromCharCode(10);
}

fs.writeFileSync('/home/rebelforce/projects/pingdev/file-docs.md', md);
console.log('Done generating file docs.');
