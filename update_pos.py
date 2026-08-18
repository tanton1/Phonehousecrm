import sys

def main():
    with open('src/components/POSSalesView.tsx', 'r') as f:
        content = f.read()

    # 1. Update Trả góp 0% / CCCD to Trả góp
    content = content.replace("Trả góp 0% / CCCD", "Trả góp")

    # 2. Update installment company options
    target_options = """<option value="HD Saison">HD Saison</option>
                  </select>"""
    
    replacement_options = """<option value="HD Saison">HD Saison</option>
                    <option value="FE Credit">FE Credit</option>
                    <option value="Mcredit">Mcredit</option>
                    <option value="Hỗ trợ Nợ Xấu">Hỗ trợ Nợ Xấu</option>
                  </select>"""
    content = content.replace(target_options, replacement_options)

    # 3. Update the warehouse UI removal
    target_ui = """      {/* Store & Warehouse Selection Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex-1 bg-white border border-zinc-200 rounded-xl p-3 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-orange-600 shrink-0" />
            <select 
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="bg-transparent text-zinc-900 font-bold text-sm focus:outline-none"
            >
              {activeBranches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="flex-1 bg-white border border-zinc-200 rounded-xl p-3 flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-orange-600 shrink-0" />
            <select 
              value={selectedWarehouseId}
              onChange={(e) => setSelectedWarehouseId(e.target.value)}
              className="bg-transparent text-zinc-900 font-bold text-sm focus:outline-none"
            >
              {activeWarehouses.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>"""
      
    replacement_ui = """      {/* Store Selection Bar */}
      <div className="bg-white border border-zinc-200 rounded-xl p-3 flex items-center justify-between shadow-xs max-w-sm">
        <div className="flex items-center gap-2">
          <Building2 className="w-4 h-4 text-orange-600 shrink-0" />
          <select 
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="bg-transparent text-zinc-900 font-bold text-sm focus:outline-none cursor-pointer w-full"
          >
            {activeBranches.map(b => (
              <option key={b.id} value={b.id}>{b.name} - {activeWarehouses.find(w => w.id === b.warehouseId)?.name || 'Kho nội bộ'}</option>
            ))}
          </select>
        </div>
      </div>"""
    
    content = content.replace(target_ui, replacement_ui)

    # 4. Update the currentWarehouse logic
    target_warehouse_logic = """  const currentWarehouse = useMemo(() => {
    return activeWarehouses.find(w => w.id === selectedWarehouseId) || activeWarehouses[0];
  }, [activeWarehouses, selectedWarehouseId]);"""

    replacement_warehouse_logic = """  const currentWarehouse = useMemo(() => {
    return activeWarehouses.find(w => w.id === currentBranch.warehouseId) || activeWarehouses[0];
  }, [activeWarehouses, currentBranch]);"""

    content = content.replace(target_warehouse_logic, replacement_warehouse_logic)

    with open('src/components/POSSalesView.tsx', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    main()
