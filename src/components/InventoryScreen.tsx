/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Package, Calendar, AlertTriangle, ArrowDownRight, Search, Plus, 
  Tag, Info, DollarSign, Trash2, LayoutGrid, CheckCircle, Clock
} from 'lucide-react';
import { Product, InventoryBatch, InventoryTransaction, InventoryTransactionType } from '../types';
import { logOperation } from '../utils/logger';

interface InventoryScreenProps {
  simProducts: Product[];
  setSimProducts: React.Dispatch<React.SetStateAction<Product[]>>;
  simBatches: InventoryBatch[];
  setSimBatches: React.Dispatch<React.SetStateAction<InventoryBatch[]>>;
  simTransactions: InventoryTransaction[];
  setSimTransactions: React.Dispatch<React.SetStateAction<InventoryTransaction[]>>;
  triggerBeep: (success: boolean) => void;
  fbUserProfile: any;
  simStoreType?: 'fnb' | 'retail';
  isOffline?: boolean;
  storeId?: string;
}

export default function InventoryScreen({
  simProducts,
  setSimProducts,
  simBatches,
  setSimBatches,
  simTransactions,
  setSimTransactions,
  triggerBeep,
  fbUserProfile,
  simStoreType = 'fnb',
  isOffline = true,
  storeId = 'Sandbox'
}: InventoryScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'expired' | 'near_expiry' | 'healthy'>('all');
  
  const isFnB = simStoreType === 'fnb';

  // Custom batch entry form states
  const [selectedProductId, setSelectedProductId] = useState(simProducts[0]?.id || '');
  const [newBatchCode, setNewBatchCode] = useState('');
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [newManufactureDate, setNewManufactureDate] = useState('');
  const [newImportPrice, setNewImportPrice] = useState(0);
  const [newQuantity, setNewQuantity] = useState(0);

  // Expiry Checker helper
  const getExpiryStatus = (expiryDateStr: string) => {
    const today = new Date();
    const expiry = new Date(expiryDateStr);
    const diffMs = expiry.getTime() - today.getTime();
    const diffDays = diffMs / (1000 * 60 * 60 * 24);

    if (diffDays <= 0) return 'expired';
    if (diffDays <= 90) return 'near_expiry'; // Less than 3 months
    return 'healthy';
  };

  // Capital Valuation Calculation
  const totalStockValuation = simBatches.reduce((sum, b) => {
    const cost = b.importPrice || 10000;
    return sum + cost * b.quantity;
  }, 0);

  const totalQuantity = simBatches.reduce((sum, b) => sum + b.quantity, 0);

  // Add a new batch (import operation)
  const handleAddBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProductId || !newBatchCode.trim() || !newExpiryDate || newQuantity <= 0) {
      alert('Vui lòng điền đầy đủ thông tin mã lô, hạn dùng và số lượng lớn hơn 0!');
      return;
    }

    const prod = simProducts.find(p => p.id === selectedProductId);
    if (!prod) return;

    const newId = `B-${Date.now()}`;
    const batch: InventoryBatch = {
      id: newId,
      productId: selectedProductId,
      batchCode: newBatchCode.trim().toUpperCase(),
      expiryDate: newExpiryDate,
      manufactureDate: newManufactureDate || undefined,
      importPrice: newImportPrice || prod.cost,
      quantity: newQuantity,
      originalQuantity: newQuantity,
      createdAt: new Date().toISOString()
    };

    logOperation('Quản lý kho', 'Nhập lô hàng tồn kho mới', batch);

    // Log the transaction
    const tx: InventoryTransaction = {
      id: `TX-${Date.now()}`,
      transactionNumber: `PNK-${Date.now().toString().slice(-5)}`,
      type: InventoryTransactionType.IMPORT,
      items: [{
        productId: selectedProductId,
        batchCode: batch.batchCode,
        quantity: newQuantity,
        price: batch.importPrice
      }],
      totalAmount: (batch.importPrice || 0) * newQuantity,
      staffId: fbUserProfile?.uid || 'staff-01',
      note: `Nhập tay lô mới ${batch.batchCode}`,
      createdAt: new Date().toISOString()
    };

    setSimBatches(prev => [batch, ...prev]);
    setSimTransactions(prev => [tx, ...prev]);

    // Reset Form
    setNewBatchCode('');
    setNewExpiryDate('');
    setNewManufactureDate('');
    setNewImportPrice(0);
    setNewQuantity(0);
    triggerBeep(true);
  };

  // Delete/Discard a batch
  const handleDeleteBatch = async (id: string) => {
    const batch = simBatches.find(b => b.id === id);
    if (confirm('Bạn có chắc chắn muốn hủy bỏ lô hàng tồn kho này khỏi danh sách?')) {
      if (batch) {
        logOperation('Quản lý kho', 'Hủy bỏ lô hàng tồn kho', batch);
        setSimBatches(prev => prev.filter(b => b.id !== id));
      }
      triggerBeep(true);
    }
  };

  // Filtered list
  const filteredBatches = simBatches.filter(b => {
    const prod = simProducts.find(p => p.id === b.productId);
    const prodName = prod?.name || '';
    const matchesSearch = prodName.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          b.batchCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          prod?.sku.includes(searchQuery);

    const status = getExpiryStatus(b.expiryDate);
    const matchesStatus = statusFilter === 'all' || status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  return (
    <div id="inventory-screen-panel" className="space-y-6">
      
      {/* Visual KPI Stats dashboard cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
              {isFnB ? 'Tổng giá trị tồn nguyên vật liệu' : 'Tổng giá trị vốn kho'}
            </span>
            <h4 className="text-xl font-black text-on-surface">{totalStockValuation.toLocaleString('vi-VN')} đ</h4>
            <span className="text-[10px] text-on-surface-variant font-medium">Từ các lô đang hiện hữu</span>
          </div>
          <div className="p-3 bg-primary-container text-primary rounded-2xl border border-primary-container">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider block">
              {isFnB ? 'Tổng lượng NVL lưu kho' : 'Số lượng tổng kho'}
            </span>
            <h4 className="text-xl font-black text-on-surface">
              {totalQuantity.toLocaleString('vi-VN')} {isFnB ? 'Đơn vị (kg/lon/hộp...)' : 'SP'}
            </h4>
            <span className="text-[10px] text-on-surface-variant font-medium">
              {simBatches.length} Lô {isFnB ? 'nguyên liệu' : 'hàng'} khác nhau
            </span>
          </div>
          <div className="p-3 bg-primary-container text-primary rounded-2xl border border-primary-container">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-error-container border border-error-container rounded-3xl p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-error uppercase tracking-wider block">
              {isFnB ? 'Lô nguyên liệu cận/hết hạn' : 'Lô cận hạn / hết hạn'}
            </span>
            <h4 className="text-xl font-black text-on-error-container">
              {simBatches.filter(b => getExpiryStatus(b.expiryDate) !== 'healthy').length} Lô
            </h4>
            <span className="text-[10px] text-error font-semibold font-sans">Cần chú ý xuất FIFO gấp!</span>
          </div>
          <div className="p-3 bg-error-container text-error rounded-2xl border border-error-container">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Register New Inventory Batch Form */}
        <div className="lg:col-span-4 bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 space-y-4 shadow-sm h-fit">
          <div className="border-b border-outline-variant pb-3">
            <h3 className="text-sm font-extrabold text-on-surface uppercase">
              Khai báo Lô {isFnB ? 'Nguyên Liệu' : 'Hàng'} Mới
            </h3>
            <p className="text-xs text-on-surface-variant">
              {isFnB ? 'Nhập thông tin NSX, HSD để quản lý hạn dùng nguyên liệu' : 'Thiết lập ngày sản xuất, giá nhập để tính khấu hao FIFO'}
            </p>
          </div>

          <form onSubmit={handleAddBatch} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase">
                {isFnB ? 'Nguyên vật liệu liên kết' : 'Sản phẩm liên kết'}
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 border border-outline-variant bg-surface-container-lowest rounded-xl text-xs font-semibold text-on-surface focus:ring-1 focus:ring-primary/50"
              >
                {simProducts.map(p => (
                  <option key={p.id} value={p.id}>
                    📦 {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-on-surface-variant uppercase">Mã Lô nhập</label>
              <input
                type="text"
                value={newBatchCode}
                onChange={(e) => setNewBatchCode(e.target.value)}
                placeholder="LOT-2026-07A"
                className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-mono font-bold"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Ngày Sản xuất</label>
                <input
                  type="date"
                  value={newManufactureDate}
                  onChange={(e) => setNewManufactureDate(e.target.value)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Hạn Sử Dụng</label>
                <input
                  type="date"
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-semibold text-error"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Giá Nhập (vốn)</label>
                <input
                  type="number"
                  value={newImportPrice}
                  onChange={(e) => setNewImportPrice(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-bold"
                  min="0"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Số lượng nhập</label>
                <input
                  type="number"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-bold"
                  min="1"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-slate-900 hover:bg-primary text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer mt-2"
            >
              + Nhập kho lô {isFnB ? 'nguyên liệu' : 'hàng'} mới (FIFO/FEFO)
            </button>
          </form>
        </div>

        {/* Right Column: Active Batch Grid & Timeline Alerts */}
        <div className="lg:col-span-8 bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 space-y-4 shadow-sm">
          
          {/* Timeline & Filters Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-outline-variant pb-4">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-on-surface uppercase">
                Danh sách các Lô {isFnB ? 'nguyên vật liệu' : 'hàng'} đang lưu kho
              </h3>
              <p className="text-xs text-on-surface-variant">Giám sát vòng đời, hạn bảo quản và định vị lô nhanh chóng</p>
            </div>

            {/* Status filtering badges */}
            <div className="flex bg-surface-container-high p-1 rounded-xl border border-outline-variant text-[10px]">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2 py-1 font-bold rounded-lg transition-all ${statusFilter === 'all' ? 'bg-surface-container-lowest text-on-surface shadow-sm' : 'text-on-surface-variant'}`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setStatusFilter('expired')}
                className={`px-2 py-1 font-bold rounded-lg transition-all ${statusFilter === 'expired' ? 'bg-error text-white shadow-sm' : 'text-on-surface-variant'}`}
              >
                Hết hạn
              </button>
              <button
                onClick={() => setStatusFilter('near_expiry')}
                className={`px-2 py-1 font-bold rounded-lg transition-all ${statusFilter === 'near_expiry' ? 'bg-tertiary text-white shadow-sm' : 'text-on-surface-variant'}`}
              >
                Cận hạn
              </button>
            </div>
          </div>

          {/* Search bar inside list */}
          <div className="relative">
            <Search className="w-4 h-4 text-on-surface-variant absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isFnB ? "Tìm theo tên nguyên liệu hoặc ký hiệu mã lô..." : "Tìm theo tên sản phẩm hoặc ký hiệu mã lô..."}
              className="w-full pl-9 pr-4 py-2 border border-outline-variant rounded-xl text-xs focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Active lots list */}
          {filteredBatches.length === 0 ? (
            <div className="py-12 text-center text-on-surface-variant text-xs border border-dashed border-outline-variant rounded-2xl">
              🔍 Không tìm thấy lô {isFnB ? 'nguyên liệu' : 'sản phẩm'} nào tương ứng bộ lọc.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredBatches.map(b => {
                const prod = simProducts.find(p => p.id === b.productId);
                const status = getExpiryStatus(b.expiryDate);
                const ratio = Math.max(0, Math.min(100, (b.quantity / b.originalQuantity) * 100));
                
                return (
                  <div 
                    key={b.id}
                    className={`p-4 rounded-2xl border transition-all flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:shadow-sm ${
                      status === 'expired'
                        ? 'border-error-container bg-error-container/50'
                        : status === 'near_expiry'
                          ? 'border-tertiary-container bg-tertiary-container/40'
                          : 'border-outline-variant bg-white'
                    }`}
                  >
                    {/* Item specs details */}
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] bg-slate-900 text-white font-black px-1.5 py-0.2 rounded">
                          LÔ: {b.batchCode}
                        </span>
                        <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                          status === 'expired'
                            ? 'bg-error-container text-on-error-container border border-error-container'
                            : status === 'near_expiry'
                              ? 'bg-tertiary-container text-on-tertiary-container border border-tertiary-container'
                              : 'bg-secondary-container text-on-secondary-container border border-secondary-container'
                        }`}>
                          {status === 'expired' && '❌ Đã hết hạn'}
                          {status === 'near_expiry' && '⚠️ Cận hạn'}
                          {status === 'healthy' && '🟢 An toàn'}
                        </span>
                      </div>

                      <h4 className="text-xs font-black text-on-surface">{prod?.name || 'Sản phẩm lỗi'}</h4>
                      
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-on-surface-variant">
                        <span className="flex items-center gap-1 font-mono"><Clock className="w-3 h-3 text-on-surface-variant" /> Hạn dùng: {b.expiryDate}</span>
                        {b.manufactureDate && <span className="flex items-center gap-1"><Info className="w-3 h-3 text-on-surface-variant" /> NSX: {b.manufactureDate}</span>}
                        <span className="font-semibold text-on-surface">Giá nhập: {(b.importPrice || 10000).toLocaleString('vi-VN')} đ</span>
                      </div>

                      {/* Visual remaining stock meter */}
                      <div className="space-y-1 max-w-xs pt-1">
                        <div className="flex justify-between text-[9px] text-on-surface-variant">
                          <span>Sức chứa: {b.quantity}/{b.originalQuantity} {isFnB ? 'Đơn vị' : 'SP'}</span>
                          <span>{Math.round(ratio)}% còn lại</span>
                        </div>
                        <div className="h-1.5 w-full bg-surface-container-high rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              status === 'expired' 
                                ? 'bg-error' 
                                : status === 'near_expiry' 
                                  ? 'bg-tertiary' 
                                  : 'bg-primary'
                            }`}
                            style={{ width: `${ratio}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Leftside operational controllers */}
                    <div className="flex items-center gap-2.5">
                      <div className="text-right sm:block hidden">
                        <p className="text-xs font-black text-on-surface">{b.quantity} {isFnB ? 'đơn vị' : 'SP'}</p>
                        <p className="text-[9px] text-on-surface-variant font-mono">Tồn kho lô</p>
                      </div>

                      <button
                        onClick={() => handleDeleteBatch(b.id)}
                        className="p-2 hover:bg-error-container text-on-surface-variant hover:text-error border border-outline-variant hover:border-error-container rounded-xl transition-all cursor-pointer"
                        title="Xóa lô hàng lỗi"
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
