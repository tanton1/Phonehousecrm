const fs = require('fs');
let code = fs.readFileSync('src/components/PartnersView.tsx', 'utf-8');

// Look for rendering debtTransactions
const historyPattern = `            <div className="pt-2 border-t border-zinc-100">
              <h4 className="text-[11px] font-bold text-zinc-800 uppercase tracking-wider mb-2 flex items-center">
                <FileText className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
                Lịch Sử Biến Động Công Nợ
              </h4>`;

// Add some better styling for transaction history section if exists
// Let's first grep what's there.
