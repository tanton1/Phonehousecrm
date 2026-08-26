import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('src');
const allowed = new Set();
const forbidden = /\b(setDoc|updateDoc|deleteDoc|addDoc|writeBatch)\s*\(/;
const violations = [];

function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(absolute);
    else if (/\.(ts|tsx)$/.test(entry.name)) {
      const relative = path.normalize(path.relative(process.cwd(), absolute));
      if (!allowed.has(relative) && forbidden.test(fs.readFileSync(absolute, 'utf8'))) violations.push(relative);
    }
  }
}

walk(root);
if (violations.length) {
  console.error(`Client Firestore write ngoài allowlist:\n${violations.map(file => `- ${file}`).join('\n')}`);
  process.exit(1);
}
console.log('Client Firestore write boundary: OK');
