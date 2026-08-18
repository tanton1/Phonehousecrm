import React, { useState, useMemo } from 'react';
import { 
  X, FolderTree, Edit2, Trash2, Plus, AlertCircle, 
  Check, Smartphone, Wrench, Headphones, Tag, CornerDownRight,
  ShieldAlert, RefreshCw, Save
} from 'lucide-react';
import { CatalogCategory, CatalogSubCategory, MasterCatalogItem } from '../types';

interface ManageSubCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  subCategories: CatalogSubCategory[];
  items: MasterCatalogItem[];
  onUpdateSubCategory: (updatedSub: CatalogSubCategory) => void;
  onDeleteSubCategory: (subId: string) => void;
  onCreateSubCategory: (newSub: CatalogSubCategory) => void;
  onToast: (msg: string) => void;
}

export const ManageSubCategoriesModal: React.FC<ManageSubCategoriesModalProps> = ({
  isOpen,
  onClose,
  subCategories,
  items,
  onUpdateSubCategory,
  onDeleteSubCategory,
  onCreateSubCategory,
  onToast
}) => {
  const [activeTab, setActiveTab] = useState<CatalogCategory | 'ALL'>('ALL');
  const [editingSub, setEditingSub] = useState<CatalogSubCategory | null>(null);
  const [deletingSub, setDeletingSub] = useState<CatalogSubCategory | null>(null);
  const [searchSubTerm, setSearchSubTerm] = useState('');

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editCode, setEditCode] = useState('');
  const [editParent, setEditParent] = useState<CatalogCategory>('DEVICE');
  const [editDescription, setEditDescription] = useState('');

  // Add form state
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newParent, setNewParent] = useState<CatalogCategory>('DEVICE');
  const [newDescription, setNewDescription] = useState('');

  // Count items per subcategory
  const subCategoryUsageCount = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach(item => {
      if (item.subCategoryId) {
        counts[item.subCategoryId] = (counts[item.subCategoryId] || 0) + 1;
      }
      if (item.subCategory) {
        counts[item.subCategory] = (counts[item.subCategory] || 0) + 1;
      }
    });
    return counts;
  }, [items]);

  // Filtered subcategories
  const filteredSubCategories = useMemo(() => {
    let list = activeTab === 'ALL' ? subCategories : subCategories.filter(s => s.parentCategory === activeTab);
    if (searchSubTerm.trim()) {
      const term = searchSubTerm.toLowerCase().trim();
      list = list.filter(s => 
        s.name.toLowerCase().includes(term) || 
        (s.code && s.code.toLowerCase().includes(term)) ||
        (s.description && s.description.toLowerCase().includes(term))
      );
    }
    return list;
  }, [subCategories, activeTab, searchSubTerm]);

  const handleStartEdit = (sub: CatalogSubCategory) => {
    setEditingSub(sub);
    setEditName(sub.name);
    setEditCode(sub.code);
    setEditParent(sub.parentCategory);
    setEditDescription(sub.description || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSub || !editName.trim()) return;

    const updated: CatalogSubCategory = {
      ...editingSub,
      name: editName.trim(),
      code: editCode.trim().toUpperCase() || editName.slice(0, 4).toUpperCase(),
      parentCategory: editParent,
      description: editDescription.trim()
    };

    onUpdateSubCategory(updated);
    onToast(`Đã cập nhật danh mục con: ${updated.name}`);
    setEditingSub(null);
  };

  const handleCreateNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;

    const newSub: CatalogSubCategory = {
      id: `SUB_${Date.now()}`,
      name: newName.trim(),
      code: newCode.trim().toUpperCase() || newName.slice(0, 4).toUpperCase(),
      parentCategory: newParent,
      description: newDescription.trim()
    };

    onCreateSubCategory(newSub);
    onToast(`Đã thêm mới danh mục con: ${newSub.name}`);
    setNewName('');
    setNewCode('');
    setNewDescription('');
    setIsAddingNew(false);
  };

  const handleConfirmDelete = () => {
    if (!deletingSub) return;
    onDeleteSubCategory(deletingSub.id);
    onToast(`Đã xóa danh mục con: ${deletingSub.name}`);
    setDeletingSub(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-2 md:p-4 bg-black/80 backdrop-blur-xs animate-fadeIn">
      <div className="bg-white w-full h-full sm:h-[96vh] sm:max-w-6xl sm:rounded-3xl shadow-2xl border border-orange-200 flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="bg-gradient-to-r from-orange-500 via-orange-500 to-orange-600 px-4 sm:px-6 py-4 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-white text-orange-600 rounded-2xl shadow-sm">
              <FolderTree className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-base sm:text-lg font-black uppercase tracking-tight">
                  Quản Lý Danh Mục Con (Cấp 2)
                </h3>
                <span className="px-2 py-0.5 bg-white/20 text-white text-[10px] font-black rounded-md">
                  Full-Screen View
                </span>
              </div>
              <p className="text-xs text-orange-100 mt-0.5 hidden sm:block">
                Chỉnh sửa tên, mã tiền tố SKU và quản lý các nhóm danh mục con trong hệ thống Phone House
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/15 hover:bg-white/30 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="Đóng (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Toolbar */}
        <div className="p-3.5 sm:p-4 bg-zinc-50 border-b border-zinc-200/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
          {/* Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'ALL', label: 'Tất Cả', count: subCategories.length },
              { id: 'DEVICE', label: '📱 Thiết Bị', count: subCategories.filter(s => s.parentCategory === 'DEVICE').length },
              { id: 'PART', label: '🔧 Linh Kiện', count: subCategories.filter(s => s.parentCategory === 'PART').length },
              { id: 'ACCESSORY', label: '🎧 Phụ Kiện', count: subCategories.filter(s => s.parentCategory === 'ACCESSORY').length }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-orange-600 text-white shadow-xs'
                    : 'bg-white border border-zinc-200 text-zinc-600 hover:bg-zinc-100'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-zinc-100 text-zinc-700'
                }`}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            {/* Subcategory Search */}
            <input
              type="text"
              placeholder="Tìm nhanh nhóm con, mã code..."
              value={searchSubTerm}
              onChange={(e) => setSearchSubTerm(e.target.value)}
              className="px-3 py-1.5 bg-white border border-zinc-200 rounded-xl text-xs focus:outline-none focus:border-orange-500 flex-1 md:w-56"
            />

            <button
              onClick={() => setIsAddingNew(!isAddingNew)}
              className="px-3.5 py-1.5 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5 text-orange-400" />
              <span>{isAddingNew ? 'Đóng Form' : '+ Thêm Nhóm Con'}</span>
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-zinc-50/50">
          {/* Inline Add New Form */}
          {isAddingNew && (
            <form onSubmit={handleCreateNew} className="bg-orange-50/80 p-4 sm:p-5 rounded-2xl border border-orange-200 space-y-3 animate-fadeIn shadow-xs max-w-4xl mx-auto">
              <div className="flex items-center justify-between border-b border-orange-200/80 pb-2">
                <span className="text-xs font-black uppercase text-orange-900 flex items-center gap-1.5">
                  <Plus className="w-4 h-4 text-orange-600" /> Thêm Danh Mục Con Mới
                </span>
                <button 
                  type="button" 
                  onClick={() => setIsAddingNew(false)}
                  className="text-xs text-orange-700 hover:text-orange-950 font-bold"
                >
                  Hủy
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Danh mục Cha: <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={newParent}
                    onChange={(e) => setNewParent(e.target.value as CatalogCategory)}
                    className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-xs font-bold"
                  >
                    <option value="DEVICE">📱 Thiết Bị (Máy)</option>
                    <option value="PART">🔧 Linh Kiện Thay Thế</option>
                    <option value="ACCESSORY">🎧 Phụ Kiện Apple</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Tên Danh mục Con: <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: iPhone 16 Series, Màn Hình OLED GX..."
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-xs font-bold focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-zinc-700 mb-1">
                    Mã Tiền Tố (Prefix Code):
                  </label>
                  <input
                    type="text"
                    placeholder="Ví dụ: IP16, MAN, SAC..."
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value.toUpperCase())}
                    className="w-full px-3 py-2 bg-white border border-orange-200 rounded-xl text-xs font-mono font-bold uppercase"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-zinc-700 mb-1">Mô tả tóm tắt (tùy chọn):</label>
                <input
                  type="text"
                  placeholder="Ghi chú về các model hoặc loại hàng thuộc nhóm này..."
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  className="w-full px-3 py-1.5 bg-white border border-orange-200 rounded-xl text-xs"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                >
                  Xác Nhận Thêm Mới
                </button>
              </div>
            </form>
          )}

          {/* Subcategories List - Multi-column Responsive Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredSubCategories.map(sub => {
              const usageCount = subCategoryUsageCount[sub.id] || subCategoryUsageCount[sub.name] || 0;
              const isEditing = editingSub?.id === sub.id;

              if (isEditing) {
                return (
                  <form 
                    key={sub.id} 
                    onSubmit={handleSaveEdit}
                    className="col-span-1 md:col-span-2 bg-orange-50/80 p-4 rounded-2xl border border-orange-300 space-y-3 animate-fadeIn"
                  >
                    <div className="flex items-center justify-between border-b border-orange-200 pb-2">
                      <span className="text-xs font-black uppercase text-orange-900 flex items-center gap-1.5">
                        <Edit2 className="w-4 h-4 text-orange-600" /> Chỉnh Sửa Danh Mục: {sub.name}
                      </span>
                      <button 
                        type="button" 
                        onClick={() => setEditingSub(null)}
                        className="text-xs text-orange-700 hover:text-orange-950 font-bold"
                      >
                        Hủy
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-zinc-700 mb-1">Thuộc Danh mục Cha:</label>
                        <select
                          value={editParent}
                          onChange={(e) => setEditParent(e.target.value as CatalogCategory)}
                          className="w-full px-3 py-2 bg-white border border-orange-300 rounded-xl text-xs font-bold"
                        >
                          <option value="DEVICE">📱 Thiết Bị (Máy)</option>
                          <option value="PART">🔧 Linh Kiện</option>
                          <option value="ACCESSORY">🎧 Phụ Kiện</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-zinc-700 mb-1">Tên Danh mục Con:</label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-orange-300 rounded-xl text-xs font-bold"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-zinc-700 mb-1">Mã Tiền Tố (Code):</label>
                        <input
                          type="text"
                          value={editCode}
                          onChange={(e) => setEditCode(e.target.value.toUpperCase())}
                          className="w-full px-3 py-2 bg-white border border-orange-300 rounded-xl text-xs font-mono font-bold uppercase"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-zinc-700 mb-1">Mô tả:</label>
                      <input
                        type="text"
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        className="w-full px-3 py-1.5 bg-white border border-orange-300 rounded-xl text-xs"
                      />
                    </div>

                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setEditingSub(null)}
                        className="px-3.5 py-1.5 bg-zinc-100 text-zinc-700 font-bold text-xs rounded-xl"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-1 cursor-pointer"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Lưu Thay Đổi</span>
                      </button>
                    </div>
                  </form>
                );
              }

              return (
                <div 
                  key={sub.id}
                  className="bg-white p-3.5 rounded-2xl border border-zinc-200/90 hover:border-orange-200 shadow-2xs flex items-center justify-between gap-3 transition-all"
                >
                  <div className="flex items-center space-x-3 min-w-0">
                    <div className={`p-2.5 rounded-xl shrink-0 ${
                      sub.parentCategory === 'DEVICE' ? 'bg-orange-50 text-orange-600' :
                      sub.parentCategory === 'PART' ? 'bg-orange-50 text-orange-600' :
                      'bg-orange-50 text-orange-600'
                    }`}>
                      {sub.parentCategory === 'DEVICE' ? <Smartphone className="w-4 h-4" /> :
                       sub.parentCategory === 'PART' ? <Wrench className="w-4 h-4" /> :
                       <Headphones className="w-4 h-4" />}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-2 flex-wrap">
                        <span className="font-bold text-xs text-zinc-900 truncate">{sub.name}</span>
                        <span className="px-2 py-0.5 bg-zinc-100 text-zinc-700 text-[10px] font-mono font-bold rounded-md">
                          {sub.code}
                        </span>
                        <span className="text-[10px] text-zinc-400">
                          ({sub.parentCategory === 'DEVICE' ? 'Máy' : sub.parentCategory === 'PART' ? 'Linh Kiện' : 'Phụ Kiện'})
                        </span>
                      </div>
                      {sub.description && (
                        <p className="text-[11px] text-zinc-500 mt-0.5 truncate">{sub.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0">
                    <span className="px-2 py-1 bg-orange-50 text-orange-800 text-xs font-bold rounded-lg border border-orange-100">
                      {usageCount} SKU
                    </span>

                    <button
                      type="button"
                      onClick={() => handleStartEdit(sub)}
                      className="p-1.5 text-zinc-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-colors cursor-pointer"
                      title="Sửa danh mục con"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingSub(sub)}
                      className="p-1.5 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                      title="Xóa danh mục con"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredSubCategories.length === 0 && (
              <div className="col-span-1 md:col-span-2 p-8 text-center bg-white rounded-2xl border border-dashed border-zinc-200">
                <FolderTree className="w-8 h-8 text-zinc-300 mx-auto mb-1" />
                <p className="text-xs text-zinc-500">Chưa có danh mục con nào trong nhóm này</p>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 bg-zinc-50 border-t border-zinc-200 px-6 flex items-center justify-between shrink-0">
          <span className="text-xs text-zinc-500">
            Hiển thị: <strong>{filteredSubCategories.length}</strong> / {subCategories.length} nhóm con
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 bg-zinc-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>

      {/* Delete Confirmation Alert Modal */}
      {deletingSub && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fadeIn">
          <div className="bg-white rounded-3xl max-w-sm w-full p-5 shadow-2xl border border-rose-200 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertCircle className="w-6 h-6" />
            </div>
            <h3 className="text-base font-black text-zinc-900">
              Xóa Danh Mục: {deletingSub.name}?
            </h3>
            <p className="text-xs text-zinc-500">
              {subCategoryUsageCount[deletingSub.id] || subCategoryUsageCount[deletingSub.name] ? (
                <span className="text-rose-600 font-bold block">
                  Cảnh báo: Đang có {subCategoryUsageCount[deletingSub.id] || subCategoryUsageCount[deletingSub.name]} mã SKU thuộc danh mục này!
                </span>
              ) : null}
              Danh mục này sẽ bị xóa khỏi cây phân cấp Phone House.
            </p>
            <div className="flex items-center justify-center space-x-2 pt-2">
              <button
                onClick={() => setDeletingSub(null)}
                className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 text-zinc-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                onClick={handleConfirmDelete}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
              >
                Xác nhận xóa
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
