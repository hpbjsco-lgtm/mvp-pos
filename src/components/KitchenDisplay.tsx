/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { ChefHat, Trash2 } from 'lucide-react';
import { KitchenItem, KitchenStatus } from '../types';

interface KitchenDisplayProps {
  simKitchenItems: KitchenItem[];
  setSimKitchenItems: React.Dispatch<React.SetStateAction<KitchenItem[]>>;
  triggerBeep: (success: boolean) => void;
  isOffline?: boolean;
  storeId?: string;
}

const STATUS_STYLES: Record<KitchenStatus, { bar: string; badge: string; label: string }> = {
  [KitchenStatus.PENDING]: { bar: 'border-l-error', badge: 'm3-badge-error', label: 'Chờ làm' },
  [KitchenStatus.PREPARING]: { bar: 'border-l-tertiary', badge: 'm3-badge-warning', label: 'Đang nấu' },
  [KitchenStatus.COMPLETED]: { bar: 'border-l-primary', badge: 'bg-primary-container text-on-primary-container', label: 'Xong, chờ bưng' },
  [KitchenStatus.SERVED]: { bar: 'border-l-outline-variant', badge: 'm3-badge-success', label: 'Đã lên bàn' }
};

export default function KitchenDisplay({
  simKitchenItems,
  setSimKitchenItems,
  triggerBeep
}: KitchenDisplayProps) {
  const [filterStatus, setFilterStatus] = useState<string>('active');
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

  const statusFilters: { id: string; label: string }[] = [
    { id: 'active', label: `Đang hoạt động (${simKitchenItems.filter(i => i.status !== KitchenStatus.SERVED).length})` },
    { id: KitchenStatus.PENDING, label: `Chờ làm (${simKitchenItems.filter(i => i.status === KitchenStatus.PENDING).length})` },
    { id: KitchenStatus.PREPARING, label: `Đang làm (${simKitchenItems.filter(i => i.status === KitchenStatus.PREPARING).length})` },
    { id: KitchenStatus.COMPLETED, label: `Chờ phục vụ (${simKitchenItems.filter(i => i.status === KitchenStatus.COMPLETED).length})` },
    { id: 'all', label: `Tất cả (${simKitchenItems.length})` }
  ];

  return (
    <div id="kitchen-display-system" className="space-y-4">

      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ChefHat className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-bold text-on-surface">Màn hình bếp</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-sm text-on-surface-variant font-mono font-bold flex items-center gap-1.5">
             {currentTime.toLocaleTimeString('vi-VN')}
          </span>
          <button onClick={handleClearServed} className="m3-icon-btn" title="Dọn món đã phục vụ xong">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex overflow-x-auto gap-2 pb-1 scrollbar-none">
        {statusFilters.map(f => (
          <button
            key={f.id}
            onClick={() => { setFilterStatus(f.id); triggerBeep(true); }}
            className={`m3-chip !rounded-full whitespace-nowrap ${filterStatus === f.id ? 'm3-chip-selected' : ''}`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filteredItems.length === 0 ? (
        <div className="py-16 text-center text-on-surface-variant flex flex-col items-center justify-center gap-2">
          <ChefHat className="w-8 h-8 text-outline-variant" />
          <p className="text-base font-bold">Không có món nào phù hợp bộ lọc</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredItems.map(item => {
            const mins = getElapsedMinutes(item.createdAt);
            const isLate = mins >= 10 && item.status !== KitchenStatus.SERVED;
            const style = STATUS_STYLES[item.status];

            return (
              <div key={item.id} className={`m3-card p-4 border-l-4 ${style.bar} space-y-3`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-base font-bold text-on-surface">
                    {item.tableNumber || 'Mang đi'}
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    {isLate && (
                      <span className="m3-badge m3-badge-error">
                         Quá giờ
                      </span>
                    )}
                    <span className="text-sm text-on-surface-variant font-mono">{mins} phút trước</span>
                  </div>
                </div>

                <div className="space-y-1">
                  <h4 className={`text-base font-bold ${item.status === KitchenStatus.SERVED ? 'line-through text-on-surface-variant' : 'text-on-surface'}`}>
                    x{item.quantity} {item.productName}
                  </h4>
                  {(item.size || item.sugarLevel || item.iceLevel) && (
                    <div className="flex flex-wrap gap-1.5">
                      {item.size && <span className="text-sm text-on-surface-variant">· Kích cỡ {item.size}</span>}
                      {item.sugarLevel && <span className="text-sm text-on-surface-variant">· Đường {item.sugarLevel}</span>}
                      {item.iceLevel && <span className="text-sm text-on-surface-variant">· Đá {item.iceLevel}</span>}
                    </div>
                  )}
                  {item.note && (
                    <div className="text-sm bg-tertiary-container text-on-tertiary-container px-3 py-2 rounded-xl">
                      Ghi chú: {item.note}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-outline-variant">
                  <span className={`m3-badge ${style.badge}`}>{style.label}</span>
                  {item.status !== KitchenStatus.SERVED && (
                    <button
                      onClick={() => handleUpdateStatus(item.id, item.status)}
                      className="m3-btn-filled !min-h-10 !px-4 text-sm"
                    >
                      {item.status === KitchenStatus.PENDING && 'Làm món'}
                      {item.status === KitchenStatus.PREPARING && 'Xong'}
                      {item.status === KitchenStatus.COMPLETED && 'Đã bưng'}
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
