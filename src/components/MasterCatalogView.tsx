import React, { useState, useMemo } from 'react';
import { 
  Search, Plus, Package, Smartphone, Wrench, Headphones,
  Edit2, Trash2, Tag, ChevronDown, Check, X, Building2, AlignLeft
} from 'lucide-react';
import { MasterCatalogItem, CatalogCategory } from '../types';

interface MasterCatalogViewProps {
  items: MasterCatalogItem[];
  onAddItem: (item: MasterCatalogItem) => void;
  onUpdateItem: (item: MasterCatalogItem) => void;
  onDeleteItem: (id: string) => void;
}

export const MasterCatalogView: React.FC<MasterCatalogViewProps> = ({
  items, onAddItem, onUpdateItem, onDeleteItem
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<CatalogCategory | 'ALL'>('ALL');

  const filteredItems = useMemo(() => {
    return items.filter(i => {
      const matchSearch = i.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          i.sku.toLowerCase().includes(searchTerm.toLowerCase());
      const matchCategory = activeCategory === 'ALL' || i.category === activeCategory;
      return matchSearch && matchCategory;
    });
  }, [items, searchTerm, activeCategory]);

  const getCategoryIcon = (cat: CatalogCategory) => {
    switch (cat) {
      case 'DEVICE': return <Smartphone className="w-4 h-4 text-blue-500" />;
      case 'PART': return <Wrench className="w-4 h-4 text-orange-500" />;
      case 'ACCESSORY': return <Headphones className="w-4 h-4 text-purple-500" />;
    }
  };

  const getCategoryBadge = (cat: CatalogCategory) => {
    switch (cat) {
      case 'DEVICE': return <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-bold rounded-full">Thiết Bị / Máy</span>;
      case 'PART': return <span className="px-2 py-0.5 bg-orange-100 text-orange-700 text-[10px] font-bold rounded-full">Linh Kiện</span>;
      case 'ACCESSORY': return <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-[10px] font-bold rounded-full">Phụ Kiện</span>;
    }
  };

  return (
    <div className="space-y-4 pb-20 animate-fadeIn">
      {/* HEADER */}
      <div className="bg-white rounded-3xl p-5 shadow-sm border border-zinc-200/80 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4 w-full sm:w-auto">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/30">
            <AlignLeft className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-zinc-900 tracking-tight">Master Catalog</h1>
            <p className="text-sm text-zinc-500 font-medium">Danh mục mã hàng hóa, linh kiện & phụ kiện chuẩn</p>
          </div>
        </div>
        
        <div className="flex items-center w-full sm:w-auto gap-3">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input 
              type="text"
              placeholder="Tìm theo mã SKU, Tên..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-zinc-50 border border-zinc-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all font-medium text-sm"
            />
          </div>
          <button className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 hover:bg-indigo-700 transition-all shrink-0">
            <Plus className="w-5 h-5" />
            <span className="hidden sm:inline">Thêm Mã Hàng</span>
          </button>
        </div>
      </div>

      {/* FILTER TABS */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {(['ALL', 'DEVICE', 'PART', 'ACCESSORY'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all flex items-center gap-2 ${
              activeCategory === cat 
                ? 'bg-zinc-900 text-white shadow-md' 
                : 'bg-white text-zinc-600 border border-zinc-200 hover:bg-zinc-50'
            }`}
          >
            {cat === 'ALL' ? <Package className="w-4 h-4" /> : getCategoryIcon(cat as CatalogCategory)}
            {cat === 'ALL' ? 'Tất Cả' : 
             cat === 'DEVICE' ? 'Thiết Bị / Máy' : 
             cat === 'PART' ? 'Linh Kiện' : 'Phụ Kiện'}
          </button>
        ))}
      </div>

      {/* TABLE */}
      <div className="bg-white rounded-3xl shadow-sm border border-zinc-200/80 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-zinc-50/50 border-b border-zinc-200 text-xs text-zinc-500">
                <th className="p-4 font-bold uppercase tracking-wider">Mã SKU</th>
                <th className="p-4 font-bold uppercase tracking-wider">Tên Sản Phẩm</th>
                <th className="p-4 font-bold uppercase tracking-wider">Phân Loại</th>
                <th className="p-4 font-bold uppercase tracking-wider">Giá Vốn (Ước tính)</th>
                <th className="p-4 font-bold uppercase tracking-wider">Giá Bán Lẻ</th>
                <th className="p-4 font-bold uppercase tracking-wider text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredItems.map(item => (
                <tr key={item.id} className="hover:bg-zinc-50/50 transition-colors">
                  <td className="p-4">
                    <span className="px-2 py-1 bg-zinc-100 text-zinc-700 font-mono text-xs rounded-lg font-bold">
                      {item.sku}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="font-bold text-zinc-900 text-sm">{item.name}</div>
                    <div className="text-[10px] text-zinc-500 mt-0.5">
                      {item.model} {item.storage ? `| ${item.storage}` : ''} {item.color ? `| ${item.color}` : ''}
                    </div>
                  </td>
                  <td className="p-4">
                    {getCategoryBadge(item.category)}
                  </td>
                  <td className="p-4 font-medium text-sm text-zinc-600">
                    {item.defaultImportPrice.toLocaleString()} đ
                  </td>
                  <td className="p-4 font-bold text-sm text-indigo-600">
                    {item.defaultRetailPrice.toLocaleString()} đ
                  </td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button className="p-2 text-zinc-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-zinc-500">
                    Không tìm thấy mã hàng nào phù hợp
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
