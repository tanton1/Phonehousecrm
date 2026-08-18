const fs = require('fs');
let code = fs.readFileSync('src/components/PartnersView.tsx', 'utf-8');

const anchor = `              <div className="bg-blue-50/70 border border-blue-100 p-3 rounded-2xl">
                <div className="text-[10px] font-bold uppercase tracking-wider text-blue-700">Hạn Mức Tín Dụng</div>
                <div className="text-lg font-black text-blue-600 mt-1">
                  {(selectedPartner.creditLimit || 0).toLocaleString('vi-VN')} đ
                </div>
              </div>
            </div>`;
            
const replacement = anchor + `
            
            {/* Lịch Sử Giao Dịch / Công Nợ */}
            <div className="pt-2 border-t border-zinc-100 mt-4">
              <h4 className="text-[11px] font-bold text-zinc-800 uppercase tracking-wider mb-2 flex items-center">
                <FileText className="w-3.5 h-3.5 mr-1.5 text-zinc-500" />
                Lịch Sử Biến Động Công Nợ
              </h4>
              {(!selectedPartner.debtTransactions || selectedPartner.debtTransactions.length === 0) ? (
                <div className="text-xs text-zinc-500 italic py-2 text-center bg-zinc-50 rounded-lg">Chưa có giao dịch công nợ nào.</div>
              ) : (
                <div className="space-y-2">
                  {selectedPartner.debtTransactions.map((tx: any, idx: number) => (
                    <div key={idx} className="flex justify-between items-center p-2.5 bg-zinc-50 rounded-xl border border-zinc-100">
                      <div>
                        <div className="text-xs font-bold text-zinc-800">{tx.type === 'DEBT_INCREASE' ? 'Tăng công nợ (Mua/Bán nợ)' : 'Thanh toán đối soát'}</div>
                        <div className="text-[10px] text-zinc-500">{new Date(tx.date).toLocaleDateString('vi-VN')} - {tx.note}</div>
                      </div>
                      <div className={\`font-mono text-sm font-black \${tx.type === 'DEBT_INCREASE' ? 'text-rose-600' : 'text-emerald-600'}\`}>
                        {tx.type === 'DEBT_INCREASE' ? '+' : '-'}{tx.amount.toLocaleString('vi-VN')} đ
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>`;
            
code = code.replace(anchor, replacement);
fs.writeFileSync('src/components/PartnersView.tsx', code, 'utf-8');
