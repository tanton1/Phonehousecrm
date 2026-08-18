import re

with open('src/components/PurchaseOrdersView.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
content = content.replace("  WarehouseId\n}", "  WarehouseId,\n  MasterCatalogItem\n}")
content = content.replace("Database,", "Database, DatabaseIcon,")

# 2. Add to props
props_match = re.search(r'interface PurchaseOrdersViewProps \{([\s\S]*?)\}', content)
if props_match:
    old_props = props_match.group(1)
    if "catalogItems:" not in old_props:
        new_props = old_props + "  catalogItems: MasterCatalogItem[];\n"
        content = content.replace(props_match.group(0), f"interface PurchaseOrdersViewProps {{{new_props}}}")

# 3. Add to functional component arguments
fc_match = re.search(r'export const PurchaseOrdersView: React\.FC<PurchaseOrdersViewProps> = \(\{([\s\S]*?)\}\) => \{', content)
if fc_match:
    old_args = fc_match.group(1)
    if "catalogItems" not in old_args:
        new_args = old_args + ", catalogItems"
        content = content.replace(fc_match.group(0), f"export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({{{new_args}}}) => {{")


# 4. Add states
states = """
  const [showCatalogModal, setShowCatalogModal] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState('');
"""
content = content.replace("const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>", states + "\n  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>")

# 5. Add handleSelectFromCatalog
handlers = """
  const handleSelectFromCatalog = (item: MasterCatalogItem) => {
    setOrderItems([
      ...orderItems,
      {
        id: `ITEM-TEMP-${Date.now()}`,
        type: item.category === 'DEVICE' ? 'device' : 'product',
        modelOrName: item.name,
        color: item.color || '',
        storage: item.storage || '',
        condition: (item.condition as any) || 'New Seal',
        region: item.region || '',
        batteryHealth: 100,
        quantity: 1,
        importPrice: item.defaultImportPrice,
        expectedSellPrice: item.defaultRetailPrice,
        totalAmount: item.defaultImportPrice,
        imeiList: [],
        notes: ''
      }
    ]);
    setShowCatalogModal(false);
    setCatalogSearch('');
  };
"""
content = content.replace("const handleAddItemRow = () => {", handlers + "\n  const handleAddItemRow = () => {")

# 6. Update handleAddItemRow usage to open modal instead
content = content.replace("onClick={handleAddItemRow}", "onClick={() => setShowCatalogModal(true)}")
content = content.replace("<span>Thêm mặt hàng</span>", "<span>Chọn từ Danh Mục</span>")
content = content.replace("<Plus className=\"w-3.5 h-3.5\" />", "<Database className=\"w-3.5 h-3.5\" />")

# 7. Inject modal UI
modal_ui = """
      {/* CATALOG SELECT MODAL */}
      {showCatalogModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-zinc-100 flex items-center justify-between bg-zinc-50/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-black text-zinc-900 tracking-tight">Chọn Hàng Hóa Từ Danh Mục (Catalog)</h2>
                  <p className="text-xs text-zinc-500 font-medium">Tìm và chọn mã hàng chuẩn để tự động điền thông tin</p>
                </div>
              </div>
              <button 
                onClick={() => setShowCatalogModal(false)}
                className="p-2 bg-white rounded-full text-zinc-400 hover:text-rose-500 shadow-sm border border-zinc-200 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-4 border-b border-zinc-100">
              <div className="relative">
                <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input 
                  type="text"
                  placeholder="Tìm kiếm theo Tên, SKU..."
                  value={catalogSearch}
                  onChange={(e) => setCatalogSearch(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:border-indigo-500 font-medium"
                  autoFocus
                />
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-2">
              {catalogItems
                .filter(i => i.name.toLowerCase().includes(catalogSearch.toLowerCase()) || i.sku.toLowerCase().includes(catalogSearch.toLowerCase()))
                .map(item => (
                <div key={item.id} className="p-3 border-b border-zinc-100 hover:bg-indigo-50/50 flex items-center justify-between group transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-zinc-100 rounded-lg text-zinc-500">
                      {item.category === 'DEVICE' ? <Smartphone className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                    </div>
                    <div>
                      <div className="font-bold text-zinc-900">{item.name}</div>
                      <div className="text-xs text-zinc-500 mt-0.5 font-medium space-x-2">
                        <span className="text-indigo-600 font-mono bg-indigo-50 px-1 rounded">{item.sku}</span>
                        <span>{item.model}</span>
                      </div>
                    </div>
                  </div>
                  <button 
                    onClick={() => handleSelectFromCatalog(item)}
                    className="px-4 py-1.5 bg-white border border-zinc-200 text-indigo-600 font-bold rounded-lg shadow-sm hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all opacity-0 group-hover:opacity-100"
                  >
                    Chọn
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
"""
# Insert right before the last closing div
content = content.replace("    </div>\n  );\n};", modal_ui + "\n    </div>\n  );\n};")

# Also need to import Database
if "import { Database" not in content and "Database" not in content:
    content = content.replace("import { ActivityLog }", "import { ActivityLog }\nimport { Database } from 'lucide-react';")
else:
    # We already replaced Database, with Database, DatabaseIcon, earlier... let's just make sure Database is in lucide-react import
    if "Database" not in content[:500]:
        content = content.replace("import {\n  Plus,", "import {\n  Database,\n  Plus,")

with open('src/components/PurchaseOrdersView.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

