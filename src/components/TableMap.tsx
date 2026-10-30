/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Calendar, Edit2, Eye, Hand, Lock, Trash2, X } from 'lucide-react';
import { DiningTable, Zone, TableStatus } from '../types';
import { logOperation } from '../utils/logger';
import FilterPills from './ui/FilterPills';

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
  /** Thu nhỏ kích thước ô bàn khi nhúng vào cột hẹp (VD: tab Phòng bàn trong màn hình bán hàng) để tránh chồng lấn. */
  compact?: boolean;
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
  storeId = 'Sandbox',
  compact = false
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

  // Sửa tên / số chỗ của bàn (chế độ thiết kế)
  const [editTableId, setEditTableId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCapacity, setEditCapacity] = useState<number>(4);

  const openEditTable = (t: DiningTable, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditTableId(t.id);
    setEditName(t.name);
    setEditCapacity(t.capacity);
  };

  const handleSaveTable = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTableId || !editName.trim()) return;
    const patch = { name: editName.trim(), capacity: Math.max(1, Math.min(99, editCapacity || 1)) };
    const table = simTables.find(t => t.id === editTableId);
    if (table) logOperation('Sơ đồ phòng bàn', 'Sửa bàn ăn', { ...table, ...patch });
    setSimTables(prev => prev.map(t => (t.id === editTableId ? { ...t, ...patch } : t)));
    setEditTableId(null);
    triggerBeep(true);
  };

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
      
      {/* Screen heading (hidden when embedded in the narrow sales column) */}
      {!compact && (
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-on-surface">Quản lý sơ đồ phòng bàn F&B</h2>
          <p className="text-sm text-on-surface-variant">Chỉnh sửa khu vực, thêm bàn ăn, kéo thả di chuyển vị trí bàn trực quan trong chế độ thiết kế.</p>
        </div>
      )}

      <div className={compact ? 'space-y-4' : 'border border-outline-variant rounded-2xl p-4 space-y-4'}>
        {!compact && (
          <div className="flex flex-col sm:flex-row justify-between items-start gap-3">
            <div className="space-y-1">
              <h3 className="text-lg font-bold text-on-surface">Sơ đồ bàn F&B Trực quan</h3>
              <p className="text-sm text-on-surface-variant">Đặt bàn trực tiếp, xem trạng thái phòng bàn thời gian thực</p>
            </div>

            {/* Admin drag action mode toggle */}
            {simUserRole === 'admin' && (
              <button
                type="button"
                onClick={() => { setIsDesignMode(!isDesignMode); triggerBeep(true); }}
                className={`min-h-10 px-5 rounded-full text-sm font-bold transition-colors flex items-center gap-2 cursor-pointer ${
                  isDesignMode ? 'bg-tertiary text-on-tertiary' : 'bg-primary text-on-primary hover:brightness-110'
                }`}
              >
                {isDesignMode ? (
                  <>
                    <Hand className="w-4 h-4" /> Chế độ thiết kế (bật kéo thả)
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4" /> Chế độ khóa sơ đồ (an toàn)
                  </>
                )}
              </button>
            )}
          </div>
        )}

        {/* Zone filter */}
        <FilterPills
          options={[
            { value: 'all', label: 'Tất cả khu vực' },
            ...simZones.map(z => ({ value: z.id, label: z.name })),
          ]}
          value={selectedZoneId}
          onChange={zoneId => { setSelectedZoneId(zoneId); triggerBeep(true); }}
        />

        {/* Floor plan canvas */}
        <div className={`h-[420px] bg-surface-container-low rounded-2xl relative overflow-hidden select-none`}>
          {filteredTables.length === 0 ? (
            <div className="absolute inset-0 flex flex-col justify-center items-center text-center text-on-surface-variant p-4">
              <Eye className="w-8 h-8 mb-2 text-outline" />
              <p className="text-sm font-semibold">Chưa có bàn ăn nào được định nghĩa ở khu vực này.</p>
              <p className="text-sm mt-0.5">Sử dụng bảng quản trị phía dưới để thêm bàn ăn.</p>
            </div>
          ) : (
            filteredTables.map(t => {
              const isSelected = simSelectedTableId === t.id;
              const isTableServing = t.status === TableStatus.SERVING;
              const isDesigning = isDesignMode && simUserRole === 'admin';
              const tableWidth = compact ? Math.min(t.width || 90, 74) : Math.max(t.width || 90, 110);
              const tableHeight = compact ? Math.min(t.height || 90, 74) : Math.max(t.height || 90, 105);
              const cardTone = isSelected
                ? 'border-primary bg-primary-container'
                : isTableServing
                  ? 'border-secondary bg-secondary-container'
                  : t.reservationName
                    ? 'border-tertiary bg-tertiary-container'
                    : 'border-outline-variant bg-surface-container-lowest';
              const chairTone = isSelected ? 'bg-primary' : isTableServing ? 'bg-secondary' : t.reservationName ? 'bg-tertiary' : 'bg-outline-variant';

              return (
                <div
                  key={t.id}
                  onMouseDown={(e) => handleMouseDown(t.id, e)}
                  onClick={() => { setSimSelectedTableId(t.id); triggerBeep(true); }}
                  style={{
                    position: 'absolute',
                    left: `${t.x || 10}%`,
                    top: `${t.y || 15}%`,
                    width: `${tableWidth}px`,
                    height: `${tableHeight}px`,
                    touchAction: 'none'
                  }}
                  className={`cursor-pointer select-none transition-transform ${isSelected ? 'z-20 scale-[1.03]' : ''} ${isDesigning ? 'cursor-move active:scale-95' : ''}`}
                >
                  {/* Chairs: two on top and bottom, one on each side */}
                  <span aria-hidden className={`absolute top-0 left-[18%] w-[22%] h-1.5 rounded-full ${chairTone}`} />
                  <span aria-hidden className={`absolute top-0 right-[18%] w-[22%] h-1.5 rounded-full ${chairTone}`} />
                  <span aria-hidden className={`absolute left-0 top-[30%] h-[28%] w-1.5 rounded-full ${chairTone}`} />
                  <span aria-hidden className={`absolute right-0 top-[30%] h-[28%] w-1.5 rounded-full ${chairTone}`} />

                  <div className={`absolute inset-x-2 top-2 ${compact ? 'bottom-5' : 'bottom-6'} rounded-xl border-2 flex flex-col items-center justify-center gap-0.5 ${cardTone}`}>
                    <span className="text-sm text-on-surface-variant">{t.capacity} chỗ</span>
                    {isTableServing && <span className="text-sm font-bold text-on-secondary-container">Phục vụ</span>}

                    {isDesigning ? (
                      <span className="flex items-center gap-0.5" onMouseDown={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={(e) => openEditTable(t, e)}
                          className="p-1 text-on-surface-variant hover:text-primary rounded-md hover:bg-surface-container-high"
                          title="Sửa tên / số chỗ"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteTable(t.id, e)}
                          className="p-1 text-on-surface-variant hover:text-error rounded-md hover:bg-surface-container-high"
                          title="Xóa bàn"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </span>
                    ) : (
                      !compact && (
                        <button
                          type="button"
                          onClick={(e) => handleToggleTableStatus(t.id, e)}
                          className="px-2 py-0.5 bg-surface-container-lowest hover:bg-surface-container-high rounded-md text-sm font-bold border border-outline-variant"
                          title="Chuyển trạng thái bàn"
                        >
                          {isTableServing ? 'Trả bàn' : 'Gọi khách'}
                        </button>
                      )
                    )}
                  </div>

                  {/* Reservation icon in the top-right corner of the card */}
                  {!compact && !isDesigning && (
                    <button
                      type="button"
                      onClick={(e) => openReservationModal(t, e)}
                      className={`absolute top-2.5 right-3 p-0.5 rounded ${t.reservationName ? 'text-tertiary' : 'text-outline hover:text-tertiary'}`}
                      title={t.reservationName ? `Đã đặt: ${t.reservationName} (bấm để xem / sửa)` : 'Đặt bàn trước'}
                    >
                      <Calendar className="w-4 h-4" />
                    </button>
                  )}

                  <span className="absolute bottom-0 inset-x-0 text-center text-sm font-semibold text-on-surface truncate">{t.name}</span>

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
        {!compact && simUserRole === 'admin' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Form 1: Add new table */}
            <form onSubmit={handleAddTable} className="space-y-3 bg-surface-container-low p-4 rounded-2xl">
              <h4 className="text-sm font-bold text-on-surface">Thêm bàn ăn mới</h4>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newTableName}
                  onChange={(e) => setNewTableName(e.target.value)}
                  placeholder="Bàn 06"
                  className="col-span-2 m3-input"
                  required
                />
                <input
                  type="number"
                  value={newTableCapacity}
                  onChange={(e) => setNewTableCapacity(parseInt(e.target.value) || 4)}
                  placeholder="Ghế"
                  className="m3-input text-center"
                  min="1"
                  max="24"
                  required
                />
              </div>
              <button type="submit" className="m3-btn-filled w-full !rounded-xl !min-h-11">
                Tạo bàn ăn
              </button>
            </form>

            {/* Form 2: Add new zone */}
            <form onSubmit={handleAddZone} className="space-y-3 bg-surface-container-low p-4 rounded-2xl flex flex-col justify-between">
              <div className="space-y-3">
                <h4 className="text-sm font-bold text-on-surface">Thêm khu vực sơ đồ mới</h4>
                <input
                  type="text"
                  value={newZoneName}
                  onChange={(e) => setNewZoneName(e.target.value)}
                  placeholder="Tầng lửng ngoài trời"
                  className="m3-input"
                  required
                />
              </div>
              <button type="submit" className="m3-btn-filled w-full !rounded-xl !min-h-11">
                Thêm khu vực
              </button>
            </form>

          </div>
        )}
      </div>

      {/* Modal sửa tên / số chỗ bàn */}
      {editTableId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setEditTableId(null)}>
          <form onSubmit={handleSaveTable} onClick={(e) => e.stopPropagation()} className="bg-surface-container-lowest rounded-3xl border border-outline-variant max-w-sm w-full p-6 shadow-xl space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-bold text-on-surface">Sửa bàn ăn</h3>
              <button type="button" onClick={() => setEditTableId(null)} className="m3-icon-btn"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-on-surface-variant">Tên bàn</label>
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="m3-input" required autoFocus />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-semibold text-on-surface-variant">Số chỗ ngồi</label>
              <input type="number" min={1} max={99} value={editCapacity} onChange={(e) => setEditCapacity(parseInt(e.target.value) || 0)} className="m3-input font-mono" required />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" onClick={() => setEditTableId(null)} className="m3-btn-tonal !min-h-11">Hủy</button>
              <button type="submit" className="m3-btn-filled !min-h-11">Lưu</button>
            </div>
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
