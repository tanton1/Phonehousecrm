const fs = require('fs');
let code = fs.readFileSync('src/components/WarrantyServiceView.tsx', 'utf8');

// We need to find the place to insert the UI for spare parts.
const findString = `{/* Activity Log / Timeline */}`;

const insertString = `              {/* Tiêu Hao Linh Kiện (Spare Parts Deduction) */}
              <div className="space-y-3 pt-3 border-t border-zinc-100">
                <div className="flex items-center justify-between">
                  <h4 className="font-black text-zinc-900 uppercase text-[11px] tracking-wider flex items-center">
                    <Wrench className="w-3.5 h-3.5 mr-1 text-orange-600" />
                    Linh Kiện Tiêu Hao
                  </h4>
                </div>
                
                {/* Danh sách linh kiện đã dùng */}
                {activeTicketDetails.partsUsed && activeTicketDetails.partsUsed.length > 0 ? (
                  <div className="space-y-2">
                    {activeTicketDetails.partsUsed.map((part, idx) => (
                      <div key={idx} className="flex justify-between items-center p-2 bg-orange-50/50 border border-orange-100 rounded-lg">
                        <div>
                          <div className="font-semibold text-zinc-800">{part.name}</div>
                          <div className="text-[10px] text-zinc-500">SL: {part.quantity} x {part.unitPrice.toLocaleString('vi-VN')} đ</div>
                        </div>
                        <div className="font-bold text-orange-700">
                          {part.totalPrice.toLocaleString('vi-VN')} đ
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-zinc-400 text-center p-3 bg-zinc-50 rounded-xl border border-dashed border-zinc-200">
                    Chưa có linh kiện nào được sử dụng
                  </div>
                )}

                {/* Form thêm linh kiện */}
                {activeTicketDetails.status !== 'delivered' && activeTicketDetails.status !== 'ready' && spareParts.length > 0 && (
                  <div className="flex space-x-2 mt-2">
                    <select 
                      id="sparePartSelect"
                      className="flex-1 bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500"
                      defaultValue=""
                    >
                      <option value="" disabled>-- Chọn linh kiện kho --</option>
                      {spareParts.filter(p => p.stockQuantity > 0).map(p => (
                        <option key={p.id} value={p.id}>{p.name} (Tồn: {p.stockQuantity}) - {p.retailPrice.toLocaleString('vi-VN')}đ</option>
                      ))}
                    </select>
                    <input 
                      type="number" 
                      id="sparePartQty"
                      min="1" 
                      defaultValue="1"
                      className="w-16 bg-white border border-zinc-200 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-orange-500 text-center"
                    />
                    <button
                      onClick={() => {
                        const selectEl = document.getElementById('sparePartSelect');
                        const qtyEl = document.getElementById('sparePartQty');
                        const partId = selectEl?.value;
                        const qty = parseInt(qtyEl?.value || '1');
                        
                        if (!partId || qty <= 0) return;
                        
                        const part = spareParts.find(p => p.id === partId);
                        if (!part) return;

                        if (qty > part.stockQuantity) {
                          alert('Số lượng tồn kho không đủ!');
                          return;
                        }

                        const usedPart = {
                          id: part.id,
                          name: part.name,
                          quantity: qty,
                          unitPrice: part.retailPrice,
                          totalPrice: part.retailPrice * qty
                        };

                        const currentParts = activeTicketDetails.partsUsed || [];
                        const updatedTicket = {
                          ...activeTicketDetails,
                          partsUsed: [...currentParts, usedPart],
                          finalCost: (activeTicketDetails.finalCost || activeTicketDetails.estimatedCost || 0) + (part.retailPrice * qty)
                        };

                        // 1. Update Ticket
                        onUpdateTicket(updatedTicket);
                        setActiveTicketDetails(updatedTicket);
                        
                        // 2. Deduct from SpareParts inventory
                        if (onUpdateSparePart) {
                          onUpdateSparePart({
                            ...part,
                            stockQuantity: part.stockQuantity - qty
                          });
                        }
                        
                        // Reset
                        selectEl.value = "";
                        qtyEl.value = "1";
                      }}
                      className="bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg font-bold transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Activity Log / Timeline */}`;

code = code.replace(findString, insertString);
fs.writeFileSync('src/components/WarrantyServiceView.tsx', code);
