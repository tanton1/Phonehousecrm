import fs from 'fs';

let content = fs.readFileSync('src/components/InventoryView.tsx', 'utf8');

// 1. Line 865: NCC: {device.supplier}
content = content.replace(/NCC: \{device\.supplier\}\n                              <\/span>\n                       /g, 'NCC: {device.supplier}\n                              </span>\n                            )}\n');

// 2. Line 879: {device.images && device.images.length > 0 && (
content = content.replace(/<span>📸 \{device\.images\.length\} Ảnh<\/span>\n                              <\/button>\n                       /g, '<span>📸 {device.images.length} Ảnh</span>\n                              </button>\n                            )}\n');

// 3. Line 890: {showCostPrice && (
content = content.replace(/<div className="text-\[10px\] text-zinc-400 font-mono">Vốn: \{device\.buyPrice\.toLocaleString\('vi-VN'\)\}đ<\/div>\n                       /g, '<div className="text-[10px] text-zinc-400 font-mono">Vốn: {device.buyPrice.toLocaleString(\'vi-VN\')}đ</div>\n                            )}\n');

// 4. Line 926: {device.status === 'in_stock' && (
content = content.replace(/<span className="hidden sm:inline">Bán<\/span>\n                              <\/button>\n                       /g, '<span className="hidden sm:inline">Bán</span>\n                              </button>\n                            )}\n');

// 5. Line 951: {activeMenuDeviceId === device.id && (
content = content.replace(/<span>Xóa máy<\/span>\n                                  <\/button>\n                                <\/div>\n                         /g, '<span>Xóa máy</span>\n                                  </button>\n                                </div>\n                              )}\n');

fs.writeFileSync('src/components/InventoryView.tsx', content);
