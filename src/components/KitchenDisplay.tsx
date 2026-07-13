/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ChefHat, Clock, CheckCircle, RefreshCw, AlertTriangle, Coffee, Filter } from 'lucide-react';
import { KitchenItem, KitchenStatus } from '../types';
import { db } from '../firebase';
import { doc, setDoc, writeBatch } from 'firebase/firestore';

interface KitchenDisplayProps {
  simKitchenItems: KitchenItem[];
  setSimKitchenItems: React.Dispatch<React.SetStateAction<KitchenItem[]>>;
  triggerBeep: (success: boolean) => void;
  isOffline?: boolean;
  storeId?: string;
}

export default function KitchenDisplay({
  simKitchenItems,
  setSimKitchenItems,
  triggerBeep,
  isOffline = true,
  storeId = 'Sandbox'
}: KitchenDisplayProps) {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [currentTime, setCurrentTime] = useState<Date>(new Date());

  // Real-time ticking clock for calculating cooking duration since order creation
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 15000); // update every 15s
    return () => clearInterval(interval);
  }, []);

  // Compute minutes elapsed
  const getElapsedMinutes = (createdAtStr: string) => {
    const elapsedMs = currentTime.getTime() - new Date(createdAtStr).getTime();
    const elapsedMins = Math.max(0, Math.floor(elapsedMs / 1000 / 60));
    return elapsedMins;
  };

  // Status transitions: pending -> preparing -> completed -> served
  const handleUpdateStatus = (itemId: string, currentStatus: KitchenStatus) => {
    let nextStatus: KitchenStatus;
    if (currentStatus === KitchenStatus.PENDING) {
      nextStatus = KitchenStatus.PREPARING;
    } else if (currentStatus === KitchenStatus.PREPARING) {
      nextStatus = KitchenStatus.COMPLETED;
    } else if (currentStatus === KitchenStatus.COMPLETED) {
      nextStatus = KitchenStatus.SERVED;
    } else {
      return;
    }

    if (!isOffline && storeId) {
      const item = simKitchenItems.find(i => i.id === itemId);
      if (item) {
        setDoc(doc(db, 'stores', storeId, 'kitchenItems', itemId), {
          ...item,
          status: nextStatus
        }).catch(err => console.error("Lỗi cập nhật trạng thái món bếp: ", err));
      }
    } else {
      setSimKitchenItems(prev => prev.map(item => {
        if (item.id === itemId) {
          return { ...item, status: nextStatus };
        }
        return item;
      }));
    }
    triggerBeep(true);
  };

  const handleClearServed = () => {
    if (confirm('Bạn có muốn xóa toàn bộ các sản phẩm đã hoàn tất phục vụ ra khỏi hàng đợi bếp?')) {
      if (!isOffline && storeId) {
        try {
          const batch = writeBatch(db);
          const servedItems = simKitchenItems.filter(item => item.status === KitchenStatus.SERVED);
          servedItems.forEach(item => {
            batch.delete(doc(db, 'stores', storeId, 'kitchenItems', item.id));
          });
          batch.commit().catch(err => console.error("Lỗi xóa món đã phục vụ: ", err));
        } catch (err) {
          console.error("Lỗi xóa các món đã phục vụ trên Firestore: ", err);
        }
      } else {
        setSimKitchenItems(prev => prev.filter(item => item.status !== KitchenStatus.SERVED));
      }
      triggerBeep(true);
    }
  };

  const filteredItems = simKitchenItems.filter(item => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'active') return item.status !== KitchenStatus.SERVED;
    return item.status === filterStatus;
  });

  return (
    <div id="kitchen-display-system" className="bg-white text-slate-800 rounded-3xl p-6 border border-slate-200 shadow-sm space-y-5">
      
      {/* KDS Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2.5 bg-orange-50 text-orange-600 rounded-2xl border border-orange-200/50">
            <ChefHat className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight">Màn hình điều phối chế biến (KDS)</h3>
            <p className="text-[11px] text-slate-500 font-medium">Báo nhận món, đang làm, và bưng ra bàn cho thực khách theo thời gian thực</p>
          </div>
        </div>

        <button
          onClick={handleClearServed}
          className="py-1.5 px-3.5 bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-slate-900 rounded-xl text-xs font-bold border border-slate-200 transition-colors cursor-pointer flex items-center gap-1.5 active:scale-98"
        >
          🧹 Dọn món đã phục vụ xong
        </button>
      </div>

      {/* Filter Segment Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-200/60">
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-[10px] text-slate-500 font-black uppercase tracking-wider font-mono mr-2 flex items-center gap-1">
            <Filter className="w-3 h-3" /> Lọc món:
          </span>
          
          <button
            onClick={() => { setFilterStatus('all'); triggerBeep(true); }}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Tất cả ({simKitchenItems.length})
          </button>

          <button
            onClick={() => { setFilterStatus('active'); triggerBeep(true); }}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterStatus === 'active' ? 'bg-amber-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Đang hoạt động ({simKitchenItems.filter(item => item.status !== KitchenStatus.SERVED).length})
          </button>

          <button
            onClick={() => { setFilterStatus(KitchenStatus.PENDING); triggerBeep(true); }}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterStatus === KitchenStatus.PENDING ? 'bg-rose-100 text-rose-700 border border-rose-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Chờ chế biến ({simKitchenItems.filter(item => item.status === KitchenStatus.PENDING).length})
          </button>

          <button
            onClick={() => { setFilterStatus(KitchenStatus.PREPARING); triggerBeep(true); }}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterStatus === KitchenStatus.PREPARING ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Đang làm ({simKitchenItems.filter(item => item.status === KitchenStatus.PREPARING).length})
          </button>

          <button
            onClick={() => { setFilterStatus(KitchenStatus.COMPLETED); triggerBeep(true); }}
            className={`py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              filterStatus === KitchenStatus.COMPLETED ? 'bg-indigo-100 text-indigo-700 border border-indigo-200' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Chờ phục vụ ({simKitchenItems.filter(item => item.status === KitchenStatus.COMPLETED).length})
          </button>
        </div>

        <div className="text-[10px] text-slate-600 font-mono flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200 shadow-xs">
          <Clock className="w-3.5 h-3.5 text-blue-500 animate-pulse" /> {currentTime.toLocaleTimeString('vi-VN')}
        </div>
      </div>

      {/* Main Grid display of order items */}
      {filteredItems.length === 0 ? (
        <div className="py-12 text-center text-slate-500 text-xs border border-dashed border-slate-200 bg-slate-50 rounded-2xl">
          🍳 Không tìm thấy món ăn hay yêu cầu chế biến nào tương thích bộ lọc.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredItems.map(item => {
            const mins = getElapsedMinutes(item.createdAt);
            const isLate = mins >= 10 && item.status !== KitchenStatus.SERVED;
            
            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border flex flex-col justify-between gap-4 transition-all ${
                  item.status === KitchenStatus.PENDING
                    ? 'bg-rose-50/70 border-rose-100 text-slate-800 shadow-xs'
                    : item.status === KitchenStatus.PREPARING
                      ? 'bg-amber-50/70 border-amber-100 text-slate-800 shadow-xs'
                      : item.status === KitchenStatus.COMPLETED
                        ? 'bg-indigo-50/70 border-indigo-100 text-slate-800 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-400'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-amber-700 font-mono bg-amber-100 px-2.5 py-0.5 rounded-lg border border-amber-200">
                      📍 {item.tableNumber || 'Mang đi'}
                    </span>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                      <span>Ref: {item.orderId}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <h4 className={`text-sm font-extrabold truncate ${item.status === KitchenStatus.SERVED ? 'line-through text-slate-400' : 'text-slate-900'}`}>
                      {item.productName}
                    </h4>
                    <p className="text-xs text-slate-500 font-bold">
                      Số lượng: <span className="text-xs font-black text-slate-900 px-2 py-0.5 bg-white border border-slate-200 rounded">{item.quantity}</span>
                    </p>
                  </div>

                  {item.note && (
                    <div className="text-[10px] bg-rose-50 text-rose-700 border border-rose-100/60 px-2.5 py-1.5 rounded-xl font-sans font-medium italic flex items-start gap-1">
                      <span>⚠️ Ghi chú: {item.note}</span>
                    </div>
                  )}

                  {/* Warning label if order is in kitchen for too long */}
                  {isLate && (
                    <div className="text-[9px] font-bold text-rose-700 flex items-center gap-1 animate-pulse bg-rose-50 px-2 py-1 rounded border border-rose-100">
                      <AlertTriangle className="w-3.5 h-3.5 text-rose-500" /> Chế biến quá hạn ({mins} phút trôi qua)
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2.5 border-t border-slate-100">
                  {/* Status Badge */}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-lg font-mono ${
                    item.status === KitchenStatus.PENDING 
                      ? 'bg-rose-100 text-rose-700 border border-rose-200' 
                      : item.status === KitchenStatus.PREPARING
                        ? 'bg-amber-100 text-amber-700 border border-amber-200'
                        : item.status === KitchenStatus.COMPLETED
                          ? 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                  }`}>
                    {item.status === KitchenStatus.PENDING && '🔴 CHỜ LÀM'}
                    {item.status === KitchenStatus.PREPARING && '🟡 ĐANG NẤU'}
                    {item.status === KitchenStatus.COMPLETED && '🔵 XONG CHỜ BƯNG'}
                    {item.status === KitchenStatus.SERVED && '🟢 ĐÃ LÊN BÀN'}
                  </span>

                  {/* Operational Controller */}
                  {item.status !== KitchenStatus.SERVED && (
                    <button
                      onClick={() => handleUpdateStatus(item.id, item.status)}
                      className="py-1 px-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all active:scale-[0.98] shadow-xs"
                    >
                      {item.status === KitchenStatus.PENDING && '👨‍🍳 Làm món'}
                      {item.status === KitchenStatus.PREPARING && '✅ Báo xong'}
                      {item.status === KitchenStatus.COMPLETED && '🚚 Đã bưng'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

    </div>
  );
}
