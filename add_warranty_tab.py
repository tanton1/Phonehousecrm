import sys
import re

def main():
    with open('src/components/StoreSettingsView.tsx', 'r') as f:
        content = f.read()

    # 1. Add warranty to activeTab type
    target_tab = "  const [activeTab, setActiveTab] = useState<'branches' | 'warehouses' | 'company' | 'preview_print'>('branches');"
    replace_tab = "  const [activeTab, setActiveTab] = useState<'branches' | 'warehouses' | 'company' | 'preview_print' | 'warranty'>('branches');"
    content = content.replace(target_tab, replace_tab)

    # 2. Add warranty tab button
    target_btn = """          <button
            onClick={() => setActiveTab('company')}
            className={`px-4 py-3 border-b-2 font-bold text-sm transition-colors whitespace-nowrap ${
              activeTab === 'company' ? 'border-orange-500 text-orange-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Thông Tin Doanh Nghiệp
          </button>"""
          
    replace_btn = """          <button
            onClick={() => setActiveTab('company')}
            className={`px-4 py-3 border-b-2 font-bold text-sm transition-colors whitespace-nowrap ${
              activeTab === 'company' ? 'border-orange-500 text-orange-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Thông Tin Doanh Nghiệp
          </button>
          
          <button
            onClick={() => setActiveTab('warranty')}
            className={`px-4 py-3 border-b-2 font-bold text-sm transition-colors whitespace-nowrap ${
              activeTab === 'warranty' ? 'border-orange-500 text-orange-600' : 'border-transparent text-zinc-500 hover:text-zinc-700'
            }`}
          >
            Gói Bảo Hành & Dịch Vụ
          </button>"""
    content = content.replace(target_btn, replace_btn)
    
    # 3. Add Warranty Tab Content at the end before </div></div>
    target_content_end = """      </div>
    </div>
  );
};"""

    warranty_content = """        {activeTab === 'warranty' && (
          <div className="bg-white rounded-3xl border border-zinc-200 p-5 shadow-xs space-y-5 animate-in fade-in duration-300">
            <div className="flex justify-between items-center border-b border-zinc-100 pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-zinc-900">Quản Lý Gói Bảo Hành</h3>
                  <p className="text-xs text-zinc-500">Các gói bảo hành hiển thị trên màn hình Bán hàng (POS)</p>
                </div>
              </div>
              <button 
                onClick={() => {
                  const newPkg = { name: 'Gói Bảo Hành Mới', price: 0 };
                  const newSettings = { 
                    ...companyForm, 
                    warrantyPackages: [...(companyForm.warrantyPackages || []), newPkg] 
                  };
                  setCompanyForm(newSettings);
                  onSaveSettings(newSettings);
                }}
                className="bg-zinc-900 hover:bg-black text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm transition-colors flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm Gói</span>
              </button>
            </div>

            <div className="space-y-3">
              {(companyForm.warrantyPackages || []).map((pkg, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-zinc-50 border border-zinc-200 rounded-xl">
                  <div className="flex-1">
                    <label className="block text-xs font-bold text-zinc-500 mb-1">Tên Gói / Mô Tả</label>
                    <input 
                      type="text"
                      value={pkg.name}
                      onChange={(e) => {
                        const pkgs = [...(companyForm.warrantyPackages || [])];
                        pkgs[idx].name = e.target.value;
                        setCompanyForm({ ...companyForm, warrantyPackages: pkgs });
                      }}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 font-bold focus:border-orange-500"
                    />
                  </div>
                  <div className="w-48">
                    <label className="block text-xs font-bold text-zinc-500 mb-1">Giá Bán (VNĐ)</label>
                    <input 
                      type="number"
                      value={pkg.price}
                      onChange={(e) => {
                        const pkgs = [...(companyForm.warrantyPackages || [])];
                        pkgs[idx].price = Number(e.target.value);
                        setCompanyForm({ ...companyForm, warrantyPackages: pkgs });
                      }}
                      className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-sm text-zinc-900 font-bold font-mono focus:border-orange-500"
                    />
                  </div>
                  <div className="pt-5">
                    <button 
                      onClick={() => {
                        const pkgs = [...(companyForm.warrantyPackages || [])];
                        pkgs.splice(idx, 1);
                        const newSettings = { ...companyForm, warrantyPackages: pkgs };
                        setCompanyForm(newSettings);
                        onSaveSettings(newSettings);
                      }}
                      className="w-10 h-10 flex items-center justify-center bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {(!companyForm.warrantyPackages || companyForm.warrantyPackages.length === 0) && (
                <div className="text-center py-10 bg-zinc-50 border border-zinc-200 border-dashed rounded-xl text-zinc-500 text-sm">
                  Chưa có gói bảo hành nào. Nhấn "Thêm Gói" để tạo mới.
                </div>
              )}
            </div>
            
            <div className="flex justify-end pt-4 border-t border-zinc-100">
              <button
                onClick={() => onSaveSettings(companyForm)}
                className="bg-orange-500 hover:bg-orange-600 text-white px-6 py-2.5 rounded-xl font-bold text-sm shadow-md transition-colors flex items-center space-x-2"
              >
                <Check className="w-4 h-4" />
                <span>Lưu Thay Đổi Gói Bảo Hành</span>
              </button>
            </div>
          </div>
        )}"""
        
    replace_content_end = warranty_content + "\n" + target_content_end
    content = content.replace(target_content_end, replace_content_end)

    with open('src/components/StoreSettingsView.tsx', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    main()
