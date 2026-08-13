/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Coffee, Utensils, Package, Tag, Plus, Search, 
  ToggleLeft, ToggleRight, Check, AlertCircle, Trash2, DollarSign
} from 'lucide-react';
import { Product } from '../types';
import { logOperation } from '../utils/logger';

interface MenuManagementProps {
  simProducts: Product[];
  setSimProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  triggerBeep: (success: boolean) => void;
  isOffline?: boolean;
  storeId?: string;
}

export default function MenuManagement({
  simProducts,
  setSimProducts,
  triggerBeep,
  isOffline = true,
  storeId = 'Sandbox'
}: MenuManagementProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<'all' | 'Đồ uống' | 'Món ăn' | 'Khác'>('all');

  // Form states to add new menu item
  const [newItemName, setNewItemName] = useState('');
  const [newItemCategory, setNewItemCategory] = useState<'Đồ uống' | 'Món ăn' | 'Khác'>('Đồ uống');
  const [newItemPrice, setNewItemPrice] = useState<number>(30000);
  const [newItemCost, setNewItemCost] = useState<number>(10000);
  const [newItemSku, setNewItemSku] = useState('');

  // Auto generate SKU if empty
  const handleAddMenuItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemName.trim()) {
      alert('Vui lòng nhập tên món ăn/thức uống!');
      return;
    }

    const sku = newItemSku.trim() || `MN-${Date.now().toString().slice(-6)}`;
    
    const newProduct: Product = {
      id: `P-${Date.now()}`,
      sku,
      name: newItemName.trim(),
      price: newItemPrice,
      cost: newItemCost,
      category: newItemCategory,
      isAvailable: true,
      createdAt: new Date().toISOString()
    };

    logOperation('Quản lý thực đơn', 'Thêm món vào thực đơn', newProduct);
    setSimProducts(prev => [newProduct, ...prev]);

    // Reset fields
    setNewItemName('');
    setNewItemSku('');
    setNewItemPrice(30000);
    setNewItemCost(10000);
    triggerBeep(true);
  };

  // Toggle availability state
  const handleToggleAvailability = async (productId: string) => {
    const product = simProducts.find(p => p.id === productId);
    if (!product) return;

    logOperation('Quản lý thực đơn', 'Thay đổi trạng thái phục vụ', { ...product, isAvailable: !product.isAvailable });
    setSimProducts(prev => prev.map(p => (p.id === productId ? { ...p, isAvailable: !p.isAvailable } : p)));
    triggerBeep(true);
  };

  // Delete item
  const handleDeleteItem = async (productId: string) => {
    const product = simProducts.find(p => p.id === productId);
    if (confirm('Bạn có chắc chắn muốn xóa món này khỏi danh mục thực đơn?')) {
      if (product) {
        logOperation('Quản lý thực đơn', 'Xóa món khỏi thực đơn', product);
      }
      setSimProducts(prev => prev.filter(p => p.id !== productId));
      triggerBeep(true);
    }
  };

  // Filtered Products
  const filteredProducts = simProducts.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.includes(searchQuery);
    const matchesCat = selectedCategory === 'all' || p.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div id="menu-management-panel" className="space-y-6">
      
      {/* Visual Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white border border-slate-200 rounded-3xl p-6 shadow-sm gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
            <Coffee className="w-6 h-6 text-emerald-500" />
            Quản lý Menu & Thực đơn quán
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Thiết lập danh mục đồ ăn, nước uống, hạt đóng gói; bật/tắt trạng thái còn món để đồng bộ tức thì sang quầy thu ngân.
          </p>
        </div>
        <div className="flex items-center space-x-2 bg-slate-50 px-3 py-2 border border-slate-100 rounded-2xl">
          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Tổng số món:</span>
          <span className="text-sm font-extrabold text-slate-800">{simProducts.length}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left column: Add Menu Item form */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm h-fit">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase flex items-center gap-2">
              <Plus className="w-4 h-4 text-emerald-500" />
              Thêm Món Mới
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Thêm món ăn, đồ uống hoặc gói sản phẩm bán kèm</p>
          </div>

          <form onSubmit={handleAddMenuItem} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Tên món / Sản phẩm</label>
              <input
                type="text"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                placeholder="Ví dụ: Bạc Xỉu Sương Sáo"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-1 focus:ring-emerald-500"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Phân loại Menu</label>
              <div className="grid grid-cols-3 gap-1 p-0.5 bg-slate-100 rounded-xl border border-slate-200">
                {(['Đồ uống', 'Món ăn', 'Khác'] as const).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setNewItemCategory(cat)}
                    className={`py-1.5 text-[10px] font-bold rounded-lg transition-all ${
                      newItemCategory === cat 
                        ? 'bg-white text-slate-900 shadow-sm' 
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Giá bán (đ)</label>
                <input
                  type="number"
                  value={newItemPrice}
                  onChange={(e) => setNewItemPrice(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:ring-1 focus:ring-emerald-500"
                  min="0"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Giá vốn (đ)</label>
                <input
                  type="number"
                  value={newItemCost}
                  onChange={(e) => setNewItemCost(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold focus:ring-1 focus:ring-emerald-500"
                  min="0"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Mã SKU / Barcode (Tùy chọn)</label>
              <input
                type="text"
                value={newItemSku}
                onChange={(e) => setNewItemSku(e.target.value)}
                placeholder="Tự động tạo nếu bỏ trống"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold uppercase focus:ring-1 focus:ring-emerald-500"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer mt-2"
            >
              + Tạo & Thêm món vào Menu
            </button>
          </form>
        </div>

        {/* Right column: Menu List with switchable filters */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm">
          
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase">Danh sách Thực đơn Hiện tại</h3>
              <p className="text-xs text-slate-500">Tìm kiếm nhanh và cài đặt trạng thái hoạt động của món ăn</p>
            </div>

            {/* Category tabs */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-[10px]">
              {(['all', 'Đồ uống', 'Món ăn', 'Khác'] as const).map(cat => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1.5 font-bold rounded-lg transition-all ${
                    selectedCategory === cat 
                      ? 'bg-white text-slate-950 shadow-sm font-black' 
                      : 'text-slate-500'
                  }`}
                >
                  {cat === 'all' ? 'Tất cả' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên món hoặc mã SKU..."
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          {/* List layout */}
          {filteredProducts.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
              🔍 Không tìm thấy món ăn nào tương ứng bộ lọc.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {filteredProducts.map(p => {
                return (
                  <div 
                    key={p.id}
                    className={`p-4 rounded-2xl border transition-all flex justify-between items-center gap-4 hover:shadow-sm ${
                      p.isAvailable 
                        ? 'border-slate-200 bg-white' 
                        : 'border-slate-100 bg-slate-50/70 opacity-75'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-slate-400 bg-slate-100 px-1 py-0.2 rounded font-semibold uppercase">
                          {p.sku}
                        </span>
                        <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase ${
                          p.category === 'Đồ uống' 
                            ? 'bg-sky-50 text-sky-600' 
                            : p.category === 'Món ăn' 
                              ? 'bg-amber-50 text-amber-600' 
                              : 'bg-purple-50 text-purple-600'
                        }`}>
                          {p.category}
                        </span>
                      </div>
                      
                      <h4 className="text-xs font-extrabold text-slate-800">{p.name}</h4>
                      
                      <div className="flex items-center gap-2 text-[11px] font-bold text-slate-900">
                        <span className="text-emerald-600">{p.price.toLocaleString('vi-VN')} đ</span>
                        <span className="text-[9px] text-slate-400 font-medium">giá vốn: {p.cost.toLocaleString('vi-VN')} đ</span>
                      </div>
                    </div>

                    <div className="flex flex-col items-end gap-2">
                      {/* Availability status toggle switch */}
                      <button
                        onClick={() => handleToggleAvailability(p.id)}
                        className={`flex items-center space-x-1.5 px-2.5 py-1.5 rounded-xl text-[10px] font-extrabold transition-all border ${
                          p.isAvailable
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                            : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                        }`}
                        title="Bấm để đổi trạng thái"
                      >
                        {p.isAvailable ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                            <span>CÒN MÓN</span>
                          </>
                        ) : (
                          <>
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>HẾT MÓN</span>
                          </>
                        )}
                      </button>

                      {/* Delete button */}
                      <button
                        onClick={() => handleDeleteItem(p.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                        title="Xóa khỏi thực đơn"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>

      </div>

    </div>
  );
}
