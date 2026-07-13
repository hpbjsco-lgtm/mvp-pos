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
import { db } from '../firebase';
import { doc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';

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

    if (!isOffline && storeId) {
      try {
        const firestoreBatch = writeBatch(db);
        firestoreBatch.set(doc(db, 'stores', storeId, 'batches', newId), batch);
        firestoreBatch.set(doc(db, 'stores', storeId, 'transactions', tx.id), tx);
        await firestoreBatch.commit();
      } catch (err) {
        console.error("Lỗi nhập lô kho mới lên Firestore: ", err);
      }
    } else {
      setSimBatches(prev => [batch, ...prev]);
      setSimTransactions(prev => [tx, ...prev]);
    }

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
        if (!isOffline && storeId) {
          try {
            await deleteDoc(doc(db, 'stores', storeId, 'batches', id));
          } catch (err) {
            console.error("Lỗi hủy bỏ lô kho trên Firestore: ", err);
          }
        } else {
          setSimBatches(prev => prev.filter(b => b.id !== id));
        }
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
        <div className="bg-white border border-slate-200 rounded-3xl p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {isFnB ? 'Tổng giá trị tồn nguyên vật liệu' : 'Tổng giá trị vốn kho'}
            </span>
            <h4 className="text-xl font-black text-slate-900">{totalStockValuation.toLocaleString('vi-VN')} đ</h4>
            <span className="text-[10px] text-slate-500 font-medium">Từ các lô đang hiện hữu</span>
          </div>
          <div className="p-3 bg-blue-50 text-blue-600 rounded-2xl border border-blue-100">
            <DollarSign className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-3xl p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              {isFnB ? 'Tổng lượng NVL lưu kho' : 'Số lượng tổng kho'}
            </span>
            <h4 className="text-xl font-black text-slate-900">
              {totalQuantity.toLocaleString('vi-VN')} {isFnB ? 'Đơn vị (kg/lon/hộp...)' : 'SP'}
            </h4>
            <span className="text-[10px] text-slate-500 font-medium">
              {simBatches.length} Lô {isFnB ? 'nguyên liệu' : 'hàng'} khác nhau
            </span>
          </div>
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl border border-indigo-100">
            <Package className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-rose-50 border border-rose-200 rounded-3xl p-5 flex items-center justify-between shadow-sm">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-rose-600 uppercase tracking-wider block">
              {isFnB ? 'Lô nguyên liệu cận/hết hạn' : 'Lô cận hạn / hết hạn'}
            </span>
            <h4 className="text-xl font-black text-rose-700">
              {simBatches.filter(b => getExpiryStatus(b.expiryDate) !== 'healthy').length} Lô
            </h4>
            <span className="text-[10px] text-rose-600 font-semibold font-sans">Cần chú ý xuất FIFO gấp!</span>
          </div>
          <div className="p-3 bg-rose-100 text-rose-600 rounded-2xl border border-rose-200">
            <AlertTriangle className="w-5 h-5" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Column: Register New Inventory Batch Form */}
        <div className="lg:col-span-4 bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm h-fit">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-extrabold text-slate-900 uppercase">
              Khai báo Lô {isFnB ? 'Nguyên Liệu' : 'Hàng'} Mới
            </h3>
            <p className="text-xs text-slate-500">
              {isFnB ? 'Nhập thông tin NSX, HSD để quản lý hạn dùng nguyên liệu' : 'Thiết lập ngày sản xuất, giá nhập để tính khấu hao FIFO'}
            </p>
          </div>

          <form onSubmit={handleAddBatch} className="space-y-3.5">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">
                {isFnB ? 'Nguyên vật liệu liên kết' : 'Sản phẩm liên kết'}
              </label>
              <select
                value={selectedProductId}
                onChange={(e) => setSelectedProductId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs font-semibold text-slate-700 focus:ring-1 focus:ring-blue-500"
              >
                {simProducts.map(p => (
                  <option key={p.id} value={p.id}>
                    📦 {p.name} ({p.sku})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-500 uppercase">Mã Lô nhập</label>
              <input
                type="text"
                value={newBatchCode}
                onChange={(e) => setNewBatchCode(e.target.value)}
                placeholder="LOT-2026-07A"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Ngày Sản xuất</label>
                <input
                  type="date"
                  value={newManufactureDate}
                  onChange={(e) => setNewManufactureDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Hạn Sử Dụng</label>
                <input
                  type="date"
                  value={newExpiryDate}
                  onChange={(e) => setNewExpiryDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-rose-600"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Giá Nhập (vốn)</label>
                <input
                  type="number"
                  value={newImportPrice}
                  onChange={(e) => setNewImportPrice(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold"
                  min="0"
                  required
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Số lượng nhập</label>
                <input
                  type="number"
                  value={newQuantity}
                  onChange={(e) => setNewQuantity(parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold"
                  min="1"
                  required
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-98 cursor-pointer mt-2"
            >
              + Nhập kho lô {isFnB ? 'nguyên liệu' : 'hàng'} mới (FIFO/FEFO)
            </button>
          </form>
        </div>

        {/* Right Column: Active Batch Grid & Timeline Alerts */}
        <div className="lg:col-span-8 bg-white border border-slate-200 rounded-3xl p-5 space-y-4 shadow-sm">
          
          {/* Timeline & Filters Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
            <div className="space-y-1">
              <h3 className="text-sm font-extrabold text-slate-900 uppercase">
                Danh sách các Lô {isFnB ? 'nguyên vật liệu' : 'hàng'} đang lưu kho
              </h3>
              <p className="text-xs text-slate-500">Giám sát vòng đời, hạn bảo quản và định vị lô nhanh chóng</p>
            </div>

            {/* Status filtering badges */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-[10px]">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-2 py-1 font-bold rounded-lg transition-all ${statusFilter === 'all' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}
              >
                Tất cả
              </button>
              <button
                onClick={() => setStatusFilter('expired')}
                className={`px-2 py-1 font-bold rounded-lg transition-all ${statusFilter === 'expired' ? 'bg-rose-600 text-white shadow-sm' : 'text-slate-500'}`}
              >
                Hết hạn
              </button>
              <button
                onClick={() => setStatusFilter('near_expiry')}
                className={`px-2 py-1 font-bold rounded-lg transition-all ${statusFilter === 'near_expiry' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-500'}`}
              >
                Cận hạn
              </button>
            </div>
          </div>

          {/* Search bar inside list */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={isFnB ? "Tìm theo tên nguyên liệu hoặc ký hiệu mã lô..." : "Tìm theo tên sản phẩm hoặc ký hiệu mã lô..."}
              className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Active lots list */}
          {filteredBatches.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs border border-dashed border-slate-200 rounded-2xl">
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
                        ? 'border-rose-200 bg-rose-50/50'
                        : status === 'near_expiry'
                          ? 'border-amber-200 bg-amber-50/40'
                          : 'border-slate-200 bg-white'
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
                            ? 'bg-rose-200 text-rose-700 border border-rose-300'
                            : status === 'near_expiry'
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                        }`}>
                          {status === 'expired' && '❌ Đã hết hạn'}
                          {status === 'near_expiry' && '⚠️ Cận hạn'}
                          {status === 'healthy' && '🟢 An toàn'}
                        </span>
                      </div>

                      <h4 className="text-xs font-black text-slate-800">{prod?.name || 'Sản phẩm lỗi'}</h4>
                      
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500">
                        <span className="flex items-center gap-1 font-mono"><Clock className="w-3 h-3 text-slate-400" /> Hạn dùng: {b.expiryDate}</span>
                        {b.manufactureDate && <span className="flex items-center gap-1"><Info className="w-3 h-3 text-slate-400" /> NSX: {b.manufactureDate}</span>}
                        <span className="font-semibold text-slate-700">Giá nhập: {(b.importPrice || 10000).toLocaleString('vi-VN')} đ</span>
                      </div>

                      {/* Visual remaining stock meter */}
                      <div className="space-y-1 max-w-xs pt-1">
                        <div className="flex justify-between text-[9px] text-slate-400">
                          <span>Sức chứa: {b.quantity}/{b.originalQuantity} {isFnB ? 'Đơn vị' : 'SP'}</span>
                          <span>{Math.round(ratio)}% còn lại</span>
                        </div>
                        <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                          <div 
                            className={`h-full rounded-full ${
                              status === 'expired' 
                                ? 'bg-rose-500' 
                                : status === 'near_expiry' 
                                  ? 'bg-amber-500' 
                                  : 'bg-indigo-600'
                            }`}
                            style={{ width: `${ratio}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>

                    {/* Leftside operational controllers */}
                    <div className="flex items-center gap-2.5">
                      <div className="text-right sm:block hidden">
                        <p className="text-xs font-black text-slate-900">{b.quantity} {isFnB ? 'đơn vị' : 'SP'}</p>
                        <p className="text-[9px] text-slate-400 font-mono">Tồn kho lô</p>
                      </div>

                      <button
                        onClick={() => handleDeleteBatch(b.id)}
                        className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer"
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
