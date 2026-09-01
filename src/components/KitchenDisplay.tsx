/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ChefHat, Clock, CheckCircle, RefreshCw, AlertTriangle, Coffee, Filter } from 'lucide-react';
import { KitchenItem, KitchenStatus } from '../types';

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

    setSimKitchenItems(prev => prev.map(item => (item.id === itemId ? { ...item, status: nextStatus } : item)));
    triggerBeep(true);
  };

  const handleClearServed = () => {
    if (confirm('Bạn có muốn xóa toàn bộ các sản phẩm đã hoàn tất phục vụ ra khỏi hàng đợi bếp?')) {
      setSimKitchenItems(prev => prev.filter(item => item.status !== KitchenStatus.SERVED));
      triggerBeep(true);
    }
  };

  const filteredItems = simKitchenItems.filter(item => {
    if (filterStatus === 'all') return true;
    if (filterStatus === 'active') return item.status !== KitchenStatus.SERVED;
    return item.status === filterStatus;
  });

  return (
    <div id="kitchen-display-system" className="bg-surface-container-lowest text-on-surface rounded-3xl p-6 border border-outline-variant shadow-sm space-y-5">

      {/* KDS Header Controls */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-outline-variant pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-2xl border border-orange-200/50">
            <ChefHat className="w-7 h-7 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xl font-extrabold text-on-surface uppercase tracking-tight">Màn hình điều phối chế biến (KDS)</h3>
            <p className="text-sm text-on-surface-variant font-medium">Báo nhận món, đang làm, và bưng ra bàn cho thực khách theo thời gian thực</p>
          </div>
        </div>

        <button
          onClick={handleClearServed}
          className="min-h-12 py-2.5 px-5 bg-surface-container hover:bg-surface-container-high text-on-surface hover:text-on-surface rounded-xl text-base font-bold border border-outline-variant transition-colors cursor-pointer flex items-center gap-2 active:scale-98"
        >
          🧹 Dọn món đã phục vụ xong
        </button>
      </div>

      {/* Filter Segment Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-container p-2.5 rounded-2xl border border-outline-variant/60">
        <div className="flex flex-wrap gap-2 items-center">
          <span className="text-sm text-on-surface-variant font-black uppercase tracking-wider mr-1 flex items-center gap-1.5">
            <Filter className="w-4 h-4" /> Lọc món:
          </span>

          <button
            onClick={() => { setFilterStatus('all'); triggerBeep(true); }}
            className={`min-h-11 py-2 px-4 rounded-xl text-base font-bold transition-all cursor-pointer ${
              filterStatus === 'all' ? 'bg-slate-900 text-white shadow-xs' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            Tất cả ({simKitchenItems.length})
          </button>

          <button
            onClick={() => { setFilterStatus('active'); triggerBeep(true); }}
            className={`min-h-11 py-2 px-4 rounded-xl text-base font-bold transition-all cursor-pointer ${
              filterStatus === 'active' ? 'bg-tertiary text-white shadow-xs' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            Đang hoạt động ({simKitchenItems.filter(item => item.status !== KitchenStatus.SERVED).length})
          </button>

          <button
            onClick={() => { setFilterStatus(KitchenStatus.PENDING); triggerBeep(true); }}
            className={`min-h-11 py-2 px-4 rounded-xl text-base font-bold transition-all cursor-pointer ${
              filterStatus === KitchenStatus.PENDING ? 'bg-error-container text-on-error-container border border-error-container' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            Chờ chế biến ({simKitchenItems.filter(item => item.status === KitchenStatus.PENDING).length})
          </button>

          <button
            onClick={() => { setFilterStatus(KitchenStatus.PREPARING); triggerBeep(true); }}
            className={`min-h-11 py-2 px-4 rounded-xl text-base font-bold transition-all cursor-pointer ${
              filterStatus === KitchenStatus.PREPARING ? 'bg-tertiary-container text-on-tertiary-container border border-tertiary-container' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            Đang làm ({simKitchenItems.filter(item => item.status === KitchenStatus.PREPARING).length})
          </button>

          <button
            onClick={() => { setFilterStatus(KitchenStatus.COMPLETED); triggerBeep(true); }}
            className={`min-h-11 py-2 px-4 rounded-xl text-base font-bold transition-all cursor-pointer ${
              filterStatus === KitchenStatus.COMPLETED ? 'bg-primary-container text-on-primary-container border border-primary-container' : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
            }`}
          >
            Chờ phục vụ ({simKitchenItems.filter(item => item.status === KitchenStatus.COMPLETED).length})
          </button>
        </div>

        <div className="text-sm text-on-surface-variant font-mono font-bold flex items-center gap-2 bg-surface-container-lowest px-3 py-2 rounded-xl border border-outline-variant shadow-xs">
          <Clock className="w-4.5 h-4.5 text-primary animate-pulse" /> {currentTime.toLocaleTimeString('vi-VN')}
        </div>
      </div>

      {/* Main Grid display of order items */}
      {filteredItems.length === 0 ? (
        <div className="py-12 text-center text-on-surface-variant text-base border border-dashed border-outline-variant bg-surface-container rounded-2xl">
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
                className={`p-5 rounded-2xl border flex flex-col justify-between gap-4 transition-all ${
                  item.status === KitchenStatus.PENDING
                    ? 'bg-error-container/70 border-error-container text-on-surface shadow-xs'
                    : item.status === KitchenStatus.PREPARING
                      ? 'bg-tertiary-container/70 border-tertiary-container text-on-surface shadow-xs'
                      : item.status === KitchenStatus.COMPLETED
                        ? 'bg-primary-container/70 border-primary-container text-on-surface shadow-xs'
                        : 'bg-surface-container border-outline-variant text-on-surface-variant'
                }`}
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-base font-black text-on-tertiary-container font-mono bg-tertiary-container px-3 py-1 rounded-lg border border-tertiary-container">
                      📍 {item.tableNumber || 'Mang đi'}
                    </span>
                    <div className="flex items-center gap-1.5 text-sm text-on-surface-variant font-mono">
                      <span>Ref: {item.orderId}</span>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <h4 className={`text-lg font-extrabold truncate ${item.status === KitchenStatus.SERVED ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                      {item.productName}
                    </h4>
                    <p className="text-base text-on-surface-variant font-bold">
                      Số lượng: <span className="text-base font-black text-on-surface px-2.5 py-0.5 bg-surface-container-lowest border border-outline-variant rounded">{item.quantity}</span>
                    </p>
                    {(item.size || item.sugarLevel || item.iceLevel) && (
                      <div className="flex flex-wrap gap-1.5">
                        {item.size && <span className="text-sm font-bold px-2 py-0.5 rounded bg-primary-container text-primary border border-primary-container">Size {item.size}</span>}
                        {item.sugarLevel && <span className="text-sm font-bold px-2 py-0.5 rounded bg-tertiary-container text-on-tertiary-container border border-tertiary-container">Đường {item.sugarLevel}</span>}
                        {item.iceLevel && <span className="text-sm font-bold px-2 py-0.5 rounded bg-sky-50 text-sky-700 border border-sky-100">Đá {item.iceLevel}</span>}
                      </div>
                    )}
                  </div>

                  {item.note && (
                    <div className="text-sm bg-error-container text-on-error-container border border-error-container/60 px-3 py-2 rounded-xl font-sans font-medium italic flex items-start gap-1.5">
                      <span>⚠️ Ghi chú: {item.note}</span>
                    </div>
                  )}

                  {/* Warning label if order is in kitchen for too long */}
                  {isLate && (
                    <div className="text-sm font-bold text-on-error-container flex items-center gap-1.5 animate-pulse bg-error-container px-2.5 py-1.5 rounded border border-error-container">
                      <AlertTriangle className="w-4.5 h-4.5 text-error" /> Chế biến quá hạn ({mins} phút trôi qua)
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-outline-variant">
                  {/* Status Badge */}
                  <span className={`text-sm font-bold px-2.5 py-1 rounded-lg font-mono ${
                    item.status === KitchenStatus.PENDING
                      ? 'bg-error-container text-on-error-container border border-error-container'
                      : item.status === KitchenStatus.PREPARING
                        ? 'bg-tertiary-container text-on-tertiary-container border border-tertiary-container'
                        : item.status === KitchenStatus.COMPLETED
                          ? 'bg-primary-container text-on-primary-container border border-primary-container'
                          : 'bg-surface-container-high text-on-surface-variant border border-outline-variant'
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
                      className="min-h-12 py-2.5 px-5 bg-primary hover:brightness-110 text-white rounded-xl text-base font-bold flex items-center gap-1.5 cursor-pointer transition-all active:scale-[0.98] shadow-xs"
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
