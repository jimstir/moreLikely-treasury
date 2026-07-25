const fs = require('fs');
const path = require('path');

const directories = ['contracts', 'test', 'frontend/src', 'docs'];
const extensions = ['.sol', '.ts', '.tsx', '.md'];

const replacements = [
  { from: /AssestSwapPolicy/g, to: 'AssetSwapPolicy' },
  { from: /GaslessVotingPolicy/g, to: 'TreasuryVoting' },
  { from: /gaslessVoting/g, to: 'treasuryVoting' },
  { from: /GaslessVoting/g, to: 'TreasuryVoting' }
];

function processDirectory(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else {
      if (extensions.includes(path.extname(fullPath))) {
        let content = fs.readFileSync(fullPath, 'utf8');
        let changed = false;
        for (const { from, to } of replacements) {
          if (from.test(content)) {
            content = content.replace(from, to);
            changed = true;
          }
        }
        if (changed) {
          fs.writeFileSync(fullPath, content, 'utf8');
          console.log(`Updated ${fullPath}`);
        }
      }
    }
  }
}

for (const dir of directories) {
  if (fs.existsSync(dir)) {
    processDirectory(dir);
  }
}
