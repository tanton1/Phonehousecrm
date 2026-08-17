import fs from 'fs';

let lines = fs.readFileSync('src/components/InventoryView.tsx', 'utf8').split('\n');

lines.splice(963, 0, "                )}");

fs.writeFileSync('src/components/InventoryView.tsx', lines.join('\n'));
