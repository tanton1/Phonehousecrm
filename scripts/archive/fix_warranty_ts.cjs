const fs = require('fs');
let code = fs.readFileSync('src/components/WarrantyServiceView.tsx', 'utf8');

// Fix handleTicketClick
const toReplace1 = `  const handleUpdateStatus = (ticket: WarrantyTicket, newStatus: WarrantyTicket['status']) => {`;
const replacement1 = `  const handleTicketClick = (ticket: WarrantyTicket) => {
    setActiveTicketDetails(ticket);
  };

  const handleUpdateStatus = (ticket: WarrantyTicket, newStatus: WarrantyTicket['status']) => {`;
code = code.replace(toReplace1, replacement1);

// Fix HTMLElement casting
code = code.replace(
  "const selectEl = document.getElementById('sparePartSelect');",
  "const selectEl = document.getElementById('sparePartSelect') as HTMLSelectElement;"
);
code = code.replace(
  "const qtyEl = document.getElementById('sparePartQty');",
  "const qtyEl = document.getElementById('sparePartQty') as HTMLInputElement;"
);

fs.writeFileSync('src/components/WarrantyServiceView.tsx', code);
