import fs from 'fs';

let lines = fs.readFileSync('src/components/InventoryView.tsx', 'utf8').split('\n');

lines.splice(967, 0, "        )}");

fs.writeFileSync('src/components/InventoryView.tsx', lines.join('\n'));
