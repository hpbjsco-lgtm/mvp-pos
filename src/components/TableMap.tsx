/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Layers, Plus, Trash2, Edit3, Grid, Users, Square, Check, RefreshCw, Hand, Lock, Eye, Calendar, X
} from 'lucide-react';
import { DiningTable, Zone, TableStatus } from '../types';
import { logOperation } from '../utils/logger';

interface TableMapProps {
  simTables: DiningTable[];
  setSimTables: React.Dispatch<React.SetStateAction<DiningTable[]>>;
  simZones: Zone[];
  setSimZones: React.Dispatch<React.SetStateAction<Zone[]>>;
  simSelectedTableId: string;
  setSimSelectedTableId: (id: string) => void;
  simUserRole: 'admin' | 'staff';
  triggerBeep: (success: boolean) => void;
  isOffline?: boolean;
  storeId?: string;
}

export default function TableMap({
  simTables,
  setSimTables,
  simZones,
  setSimZones,
  simSelectedTableId,
  setSimSelectedTableId,
  simUserRole,
  triggerBeep,
  isOffline = true,
  storeId = 'Sandbox'
}: TableMapProps) {
  const [selectedZoneId, setSelectedZoneId] = useState<string>('all');
  
  // Local form states
  const [newZoneName, setNewZoneName] = useState<string>('');
  const [newTableName, setNewTableName] = useState<string>('');
  const [newTableCapacity, setNewTableCapacity] = useState<number>(4);
  const [isDesignMode, setIsDesignMode] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Drag and drop states
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [tableStartCoords, setTableStartCoords] = useState({ x: 0, y: 0 });

  // Đặt bàn trước - modal state
  const [reservationTableId, setReservationTableId] = useState<string | null>(null);
  const [resName, setResName] = useState('');
  const [resPhone, setResPhone] = useState('');
  const [resTime, setResTime] = useState('');
  const [resNote, setResNote] = useState('');

  const currentZoneId = selectedZoneId === 'all' && simZones.length > 0 ? simZones[0].id : selectedZoneId;

  // Add a zone
  const handleAddZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newZoneName.trim()) return;
    const newId = `z-${Date.now()}`;
    const zone: Zone = {
      id: newId,
      name: newZoneName.trim(),
      createdAt: new Date().toISOString()
    };
    logOperation('Sơ đồ phòng bàn', 'Thêm khu vực', zone);
    setSimZones(prev => [...prev, zone]);
    setSelectedZoneId(newId);
    setNewZoneName('');
    triggerBeep(true);
  };

  // Add a table to current zone
  const handleAddTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTableName.trim() || !currentZoneId) return;
    const newId = `T-${Date.now()}`;
    // Position randomly on map or in offset grid
    const count = simTables.filter(t => t.zoneId === currentZoneId).length;
    const x = (count * 20) % 80 + 10;
    const y = (Math.floor(count / 4) * 20) % 60 + 15;
    
    const table: DiningTable = {
      id: newId,
      name: newTableName.trim(),
      status: TableStatus.EMPTY,
      capacity: newTableCapacity,
      zoneId: currentZoneId,
      x,
      y,
      width: 95,
      height: 95,
      createdAt: new Date().toISOString()
    };

    logOperation('Sơ đồ phòng bàn', 'Thêm bàn ăn', table);
    setSimTables(prev => [...prev, table]);
    setSimSelectedTableId(newId);
    setNewTableName('');
    triggerBeep(true);
  };

  // Delete a table
  const handleDeleteTable = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const table = simTables.find(t => t.id === id);
    if (confirm('Bạn có thực sự muốn xóa bàn ăn này khỏi sơ đồ?')) {
      if (table) {
        logOperation('Sơ đồ phòng bàn', 'Xóa bàn ăn', table);
      }
      setSimTables(prev => prev.filter(t => t.id !== id));
      if (simSelectedTableId === id) {
        setSimSelectedTableId('retail'); // Fallback or clear
      }
      triggerBeep(true);
    }
  };

  // Toggle table status EMPTY <-> SERVING
  const handleToggleTableStatus = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const table = simTables.find(t => t.id === id);
    if (table) {
      const nextStatus = table.status === TableStatus.EMPTY ? TableStatus.SERVING : TableStatus.EMPTY;
      logOperation('Sơ đồ phòng bàn', 'Cập nhật trạng thái bàn', { ...table, status: nextStatus });
      setSimTables(prev => prev.map(t => {
        if (t.id === id) {
          return { ...t, status: nextStatus };
        }
        return t;
      }));
    }
    triggerBeep(true);
  };

  // Drag handles (Simulating responsive absolute positioning coordinate updates)
  const handleMouseDown = (id: string, e: React.MouseEvent) => {
    if (simUserRole !== 'admin' || !isDesignMode) return;
    setDraggingId(id);
    const table = simTables.find(t => t.id === id);
    if (table) {
      setDragStartPos({ x: e.clientX, y: e.clientY });
      setTableStartCoords({ x: table.x || 0, y: table.y || 0 });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!draggingId) return;
    const dx = e.clientX - dragStartPos.x;
    const dy = e.clientY - dragStartPos.y;
    // Map container is fixed-width representation, let's approximate grid shifting (1px = approx 0.2%)
    const pctX = Math.round(tableStartCoords.x + dx / 6);
    const pctY = Math.round(tableStartCoords.y + dy / 4);

    setSimTables(prev => prev.map(t => {
      if (t.id === draggingId) {
        return {
          ...t,
          x: Math.max(0, Math.min(90, pctX)),
          y: Math.max(0, Math.min(85, pctY))
        };
      }
      return t;
    }));
  };

  const handleMouseUp = () => {
    if (draggingId) {
      setDraggingId(null);
      triggerBeep(true);
    }
  };

  // Mở form đặt bàn trước (nạp lại thông tin nếu bàn đã có đặt trước để sửa)
  const openReservationModal = (t: DiningTable, e: React.MouseEvent) => {
    e.stopPropagation();
    setReservationTableId(t.id);
    setResName(t.reservationName || '');
    setResPhone(t.reservationPhone || '');
    setResTime(t.reservationTime || '');
    setResNote(t.reservationNote || '');
  };

  const handleSaveReservation = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reservationTableId || !resName.trim()) return;
    const updated = {
      reservationName: resName.trim(),
      reservationPhone: resPhone.trim(),
      reservationTime: resTime,
      reservationNote: resNote.trim()
    };
    const table = simTables.find(t => t.id === reservationTableId);
    if (table) logOperation('Sơ đồ phòng bàn', 'Đặt bàn trước', { ...table, ...updated });
    setSimTables(prev => prev.map(t => (t.id === reservationTableId ? { ...t, ...updated } : t)));
    setReservationTableId(null);
    triggerBeep(true);
  };

  const handleClearReservation = () => {
    if (!reservationTableId) return;
    const table = simTables.find(t => t.id === reservationTableId);
    if (table) logOperation('Sơ đồ phòng bàn', 'Hủy đặt bàn trước', table);
    setSimTables(prev => prev.map(t => (t.id === reservationTableId
      ? { ...t, reservationName: '', reservationPhone: '', reservationTime: '', reservationNote: '' }
      : t)));
    setReservationTableId(null);
    triggerBeep(true);
  };

  // Filtered tables list
  const filteredTables = simTables.filter(t => {
    const matchesZone = selectedZoneId === 'all' || t.zoneId === selectedZoneId;
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesZone && matchesSearch;
  });

  return (
    <div id="table-map-panel" className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 space-y-5 shadow-sm" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      
      {/* Visual map header and Admin toggles */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-outline-variant pb-4">
        <div className="space-y-1">
          <h3 className="text-sm font-extrabold text-on-surface uppercase tracking-tight flex items-center gap-2">
            <Grid className="w-4 h-4 text-primary" /> Sơ đồ bàn F&B Trực quan
          </h3>
          <p className="text-xs text-on-surface-variant">Đặt bàn trực tiếp, xem trạng thái phòng bàn thời gian thực</p>
        </div>

        {/* Admin drag action mode toggle */}
        {simUserRole === 'admin' && (
          <button
            onClick={() => { setIsDesignMode(!isDesignMode); triggerBeep(true); }}
            className={`py-1.5 px-3 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              isDesignMode
                ? 'bg-tertiary text-on-tertiary shadow-sm'
                : 'bg-surface-container-high hover:bg-surface-container text-on-surface border border-outline-variant'
            }`}
          >
            {isDesignMode ? (
              <>
                <Hand className="w-3.5 h-3.5 animate-bounce" /> Chế độ Thiết kế (Bật kéo thả)
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5" /> Chế độ Khóa sơ đồ (An toàn)
              </>
            )}
          </button>
        )}
      </div>

      {/* Zone Navigator Slider Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => { setSelectedZoneId('all'); triggerBeep(true); }}
          className={`py-2 px-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
            selectedZoneId === 'all'
              ? 'bg-primary text-on-primary shadow-md'
              : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant'
          }`}
        >
          Tất cả khu vực
        </button>

        {simZones.map(z => (
          <button
            key={z.id}
            onClick={() => { setSelectedZoneId(z.id); triggerBeep(true); }}
            className={`py-2 px-3 rounded-xl text-sm font-bold transition-all cursor-pointer ${
              selectedZoneId === z.id
                ? 'bg-primary text-on-primary shadow-md'
                : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant'
            }`}
          >
            {z.name}
          </button>
        ))}
      </div>

      {/* Main Floor Plan Drawing Board Canvas */}
      <div 
        className="h-[340px] bg-surface-container border border-outline-variant rounded-2xl relative overflow-hidden p-4 select-none"
        style={{ backgroundImage: 'radial-gradient(#e2e8f0 1.5px, transparent 1.5px)', bgSize: '24px 24px' }}
      >
        {filteredTables.length === 0 ? (
          <div className="absolute inset-0 flex flex-col justify-center items-center text-center text-on-surface-variant p-4">
            <Eye className="w-8 h-8 mb-2 text-outline" />
            <p className="text-xs font-semibold">Chưa có bàn ăn nào được định nghĩa ở khu vực này.</p>
            <p className="text-[11px] text-on-surface-variant mt-0.5">Sử dụng bảng quản trị phía dưới để thêm bàn ăn.</p>
          </div>
        ) : (
          filteredTables.map(t => {
            const isSelected = simSelectedTableId === t.id;
            const isTableServing = t.status === TableStatus.SERVING;
            
            return (
              <div
                key={t.id}
                onMouseDown={(e) => handleMouseDown(t.id, e)}
                onClick={() => { setSimSelectedTableId(t.id); triggerBeep(true); }}
                style={{
                  position: 'absolute',
                  left: `${t.x || 10}%`,
                  top: `${t.y || 15}%`,
                  width: `${t.width || 90}px`,
                  height: `${t.height || 90}px`,
                  touchAction: 'none'
                }}
                className={`rounded-2xl border-2 flex flex-col justify-between p-3 cursor-pointer shadow-sm transition-all select-none ${
                  isSelected
                    ? 'border-primary bg-primary-container/95 ring-4 ring-primary-container scale-[1.03] z-20'
                    : isTableServing
                      ? 'border-secondary bg-secondary-container/70 hover:bg-secondary-container'
                      : 'border-outline-variant bg-surface-container-lowest hover:bg-surface-container'
                } ${isDesignMode && simUserRole === 'admin' ? 'cursor-move active:scale-95' : ''}`}
              >
                {/* Table Header: Name & capacity */}
                <div className="flex justify-between items-start">
                  <span className={`text-xs font-black uppercase tracking-tight ${isSelected ? 'text-on-primary-container' : 'text-on-surface'}`}>
                    {t.name}
                  </span>

                  {simUserRole === 'admin' && isDesignMode ? (
                    <button
                      onClick={(e) => handleDeleteTable(t.id, e)}
                      className="p-1 text-on-surface-variant hover:text-error rounded-md hover:bg-surface-container-high"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="text-[10px] text-on-surface-variant font-bold flex items-center gap-0.5">
                      <Users className="w-2.5 h-2.5" /> {t.capacity}
                    </span>
                  )}
                </div>

                {/* Reservation badge */}
                {t.reservationName && (
                  <button
                    onClick={(e) => openReservationModal(t, e)}
                    className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-tertiary-container text-on-tertiary-container border border-tertiary-container flex items-center gap-1 self-start"
                    title="Xem / sửa thông tin đặt bàn trước"
                  >
                    <Calendar className="w-2.5 h-2.5" /> Đã đặt: {t.reservationName}
                  </button>
                )}

                {/* Table Status trigger */}
                <div className="flex justify-between items-end gap-1">
                  <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold uppercase ${
                    isTableServing
                      ? 'bg-secondary/15 text-on-secondary-container border border-secondary/25'
                      : 'bg-surface-container-high text-on-surface-variant border border-outline-variant'
                  }`}>
                    {isTableServing ? 'Phục vụ' : 'Trống'}
                  </span>

                  {!isDesignMode && (
                    <div className="flex items-center gap-1">
                      {!t.reservationName && (
                        <button
                          onClick={(e) => openReservationModal(t, e)}
                          className="p-1 bg-surface-container-lowest hover:bg-tertiary-container hover:text-tertiary rounded-lg text-[9px] font-bold border border-outline-variant hover:border-tertiary-container shadow-sm"
                          title="Đặt bàn trước"
                        >
                          <Calendar className="w-3 h-3" />
                        </button>
                      )}
                      <button
                        onClick={(e) => handleToggleTableStatus(t.id, e)}
                        className="p-1 bg-surface-container-lowest hover:bg-surface-container-high rounded-lg text-[10px] font-bold border border-outline-variant hover:border-outline shadow-sm"
                        title="Chuyển trạng thái bàn"
                      >
                        {isTableServing ? 'Trả bàn' : 'Gọi khách'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Visual indicator of dragging state */}
                {draggingId === t.id && (
                  <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary rounded-2xl pointer-events-none animate-pulse"></div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Control console for custom design adding */}
      {simUserRole === 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-outline-variant pt-4">
          
          {/* Form 1: Add new table */}
          <form onSubmit={handleAddTable} className="space-y-2 bg-surface-container border border-outline-variant p-3.5 rounded-2xl">
            <h5 className="text-xs font-black text-on-surface uppercase tracking-wide">Thêm bàn ăn mới</h5>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Bàn 06"
                className="col-span-2 m3-input !py-1.5 !text-sm"
                required
              />
              <input
                type="number"
                value={newTableCapacity}
                onChange={(e) => setNewTableCapacity(parseInt(e.target.value) || 4)}
                placeholder="Ghế"
                className="m3-input !py-1.5 !text-sm font-semibold text-center"
                min="1"
                max="24"
                required
              />
            </div>
            <button
              type="submit"
              className="m3-btn-filled w-full !py-1.5 !text-sm"
            >
              + Tạo bàn ăn
            </button>
          </form>

          {/* Form 2: Add new zone */}
          <form onSubmit={handleAddZone} className="space-y-2 bg-surface-container border border-outline-variant p-3.5 rounded-2xl flex flex-col justify-between">
            <div>
              <h5 className="text-xs font-black text-on-surface uppercase tracking-wide">Thêm khu vực sơ đồ mới</h5>
              <input
                type="text"
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                placeholder="Tầng lửng ngoài trời"
                className="w-full m3-input !py-1.5 !text-sm mt-2"
                required
              />
            </div>
            <button
              type="submit"
              className="m3-btn-filled w-full !py-1.5 !text-sm mt-2"
            >
              + Thêm khu vực
            </button>
          </form>

        </div>
      )}

      {/* Reservation modal */}
      {reservationTableId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant max-w-sm w-full p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-sm font-black text-on-surface uppercase flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-tertiary" /> Đặt bàn trước
              </h3>
              <button
                onClick={() => setReservationTableId(null)}
                className="p-1 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-on-surface-variant transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveReservation} className="space-y-3.5">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Tên khách đặt bàn</label>
                <input
                  type="text"
                  value={resName}
                  onChange={(e) => setResName(e.target.value)}
                  placeholder="Ví dụ: Anh Hải"
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-semibold focus:ring-1 focus:ring-tertiary/50"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Số điện thoại</label>
                <input
                  type="text"
                  value={resPhone}
                  onChange={(e) => setResPhone(e.target.value)}
                  placeholder="0912345678"
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-mono font-bold focus:ring-1 focus:ring-tertiary/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Giờ hẹn</label>
                <input
                  type="time"
                  value={resTime}
                  onChange={(e) => setResTime(e.target.value)}
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-mono font-bold focus:ring-1 focus:ring-tertiary/50"
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Ghi chú (số lượng khách, yêu cầu...)</label>
                <textarea
                  value={resNote}
                  onChange={(e) => setResNote(e.target.value)}
                  rows={2}
                  placeholder="Ví dụ: 6 người, có trẻ em"
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs focus:ring-1 focus:ring-tertiary/50"
                />
              </div>

              <div className="pt-2 flex justify-between gap-2 text-xs">
                {simTables.find(t => t.id === reservationTableId)?.reservationName ? (
                  <button
                    type="button"
                    onClick={handleClearReservation}
                    className="px-4 py-2 bg-error-container hover:brightness-95 text-error rounded-xl font-bold transition-colors cursor-pointer"
                  >
                    Hủy đặt bàn
                  </button>
                ) : <span />}
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-tertiary hover:brightness-110 text-on-tertiary rounded-xl font-bold shadow transition-all cursor-pointer"
                >
                  Lưu đặt bàn
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
