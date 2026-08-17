import fs from 'fs';

let lines = fs.readFileSync('src/components/InventoryView.tsx', 'utf8').split('\n');

const insertAfter = (lineNum, text) => {
  lines.splice(lineNum, 0, text);
};

// Start from the bottom so line numbers don't shift
// 950 -> activeMenuDeviceId
// 926 -> status
// 890 -> cost price
// 879 -> images
// 865 -> supplier

// Let's verify by checking the lines around 949:
// 949:                                   </button>
// 950:                                 </div>

// 925:                               </button>

// 889:                               <div className="text-[10px] text-zinc-400 font-mono">Vốn: {device.buyPrice.toLocaleString('vi-VN')}đ</div>

// 878:                               </button>

// 864:                               </span>

lines.splice(950, 0, "                              )}");
lines.splice(925, 0, "                            )}");
lines.splice(889, 0, "                            )}");
lines.splice(878, 0, "                            )}");
lines.splice(864, 0, "                            )}");

fs.writeFileSync('src/components/InventoryView.tsx', lines.join('\n'));
