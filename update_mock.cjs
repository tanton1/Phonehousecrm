const fs = require('fs');
let content = fs.readFileSync('src/data/initialData.ts', 'utf8');

content = content.replace(
  "id: 'WAR-701',",
  "id: 'WAR-701',\n    taskType: 'WARRANTY',\n    assigneeId: 'tech.phuctran@gmail.com',\n    commissionAmount: 250000,\n    techChecklist: [\n      { id: '1', step: 'Kiểm tra ngoại hình', isPassed: true },\n      { id: '2', step: 'Test FaceID', isPassed: true },\n      { id: '3', step: 'Test Truetone', isPassed: false, notes: 'Mất Truetone' }\n    ],"
);

fs.writeFileSync('src/data/initialData.ts', content);
