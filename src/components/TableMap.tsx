/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Layers, Plus, Trash2, Edit3, Grid, Users, Square, Check, RefreshCw, Hand, Lock, Eye
} from 'lucide-react';
import { DiningTable, Zone, TableStatus } from '../types';
import { logOperation } from '../utils/logger';
import { db } from '../firebase';
import { doc, setDoc, deleteDoc } from 'firebase/firestore';

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
    if (!isOffline && storeId) {
      try {
        await setDoc(doc(db, 'stores', storeId, 'zones', newId), zone);
      } catch (err) {
        console.error("Lỗi thêm khu vực trên Firestore: ", err);
      }
    } else {
      setSimZones(prev => [...prev, zone]);
    }
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

    if (!isOffline && storeId) {
      try {
        await setDoc(doc(db, 'stores', storeId, 'tables', newId), table);
      } catch (err) {
        console.error("Lỗi thêm bàn ăn trên Firestore: ", err);
      }
    } else {
      setSimTables(prev => [...prev, table]);
    }
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
      if (!isOffline && storeId) {
        try {
          await deleteDoc(doc(db, 'stores', storeId, 'tables', id));
        } catch (err) {
          console.error("Lỗi xóa bàn ăn trên Firestore: ", err);
        }
      } else {
        setSimTables(prev => prev.filter(t => t.id !== id));
      }
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
      if (!isOffline && storeId) {
        try {
          await setDoc(doc(db, 'stores', storeId, 'tables', id), {
            ...table,
            status: nextStatus
          });
        } catch (err) {
          console.error("Lỗi cập nhật trạng thái bàn trên Firestore: ", err);
        }
      } else {
        setSimTables(prev => prev.map(t => {
          if (t.id === id) {
            return { ...t, status: nextStatus };
          }
          return t;
        }));
      }
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

  const handleMouseUp = async () => {
    if (draggingId) {
      const table = simTables.find(t => t.id === draggingId);
      if (table && !isOffline && storeId) {
        try {
          await setDoc(doc(db, 'stores', storeId, 'tables', draggingId), table);
        } catch (err) {
          console.error("Lỗi cập nhật vị trí bàn trên Firestore: ", err);
        }
      }
      setDraggingId(null);
      triggerBeep(true);
    }
  };

  // Filtered tables list
  const filteredTables = simTables.filter(t => {
    const matchesZone = selectedZoneId === 'all' || t.zoneId === selectedZoneId;
    const matchesSearch = t.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesZone && matchesSearch;
  });

  return (
    <div id="table-map-panel" className="bg-white border border-slate-200 rounded-3xl p-5 space-y-5 shadow-sm" onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}>
      
      {/* Visual map header and Admin toggles */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-100 pb-4">
        <div className="space-y-1">
          <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <Grid className="w-4 h-4 text-indigo-600" /> Sơ đồ bàn F&B Trực quan
          </h3>
          <p className="text-xs text-slate-500">Đặt bàn trực tiếp, xem trạng thái phòng bàn thời gian thực</p>
        </div>

        {/* Admin drag action mode toggle */}
        {simUserRole === 'admin' && (
          <button
            onClick={() => { setIsDesignMode(!isDesignMode); triggerBeep(true); }}
            className={`py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              isDesignMode 
                ? 'bg-amber-600 text-white shadow-sm shadow-amber-500/10' 
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
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
          className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            selectedZoneId === 'all' 
              ? 'bg-slate-900 text-white shadow-md' 
              : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
          }`}
        >
          🌐 Tất cả khu vực
        </button>

        {simZones.map(z => (
          <button
            key={z.id}
            onClick={() => { setSelectedZoneId(z.id); triggerBeep(true); }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              selectedZoneId === z.id 
                ? 'bg-slate-900 text-white shadow-md' 
                : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
            }`}
          >
            📍 {z.name}
          </button>
        ))}
      </div>

      {/* Main Floor Plan Drawing Board Canvas */}
      <div 
        className="h-[340px] bg-slate-50 border border-slate-200 rounded-2xl relative overflow-hidden p-4 select-none"
        style={{ backgroundImage: 'radial-gradient(#e2e8f0 1.5px, transparent 1.5px)', bgSize: '24px 24px' }}
      >
        {filteredTables.length === 0 ? (
          <div className="absolute inset-0 flex flex-col justify-center items-center text-center text-slate-400 p-4">
            <Eye className="w-8 h-8 mb-2 text-slate-300" />
            <p className="text-xs font-semibold">Chưa có bàn ăn nào được định nghĩa ở khu vực này.</p>
            <p className="text-[11px] text-slate-400 mt-0.5">Sử dụng bảng quản trị phía dưới để thêm bàn ăn.</p>
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
                    ? 'border-indigo-600 bg-indigo-50/95 ring-4 ring-indigo-100 scale-[1.03] z-20'
                    : isTableServing
                      ? 'border-emerald-600 bg-emerald-50/70 hover:bg-emerald-50'
                      : 'border-slate-300 bg-white hover:bg-slate-50'
                } ${isDesignMode && simUserRole === 'admin' ? 'cursor-move active:scale-95' : ''}`}
              >
                {/* Table Header: Name & capacity */}
                <div className="flex justify-between items-start">
                  <span className={`text-[11px] font-black uppercase tracking-tight ${isSelected ? 'text-indigo-900' : 'text-slate-800'}`}>
                    {t.name}
                  </span>
                  
                  {simUserRole === 'admin' && isDesignMode ? (
                    <button
                      onClick={(e) => handleDeleteTable(t.id, e)}
                      className="p-1 text-slate-400 hover:text-red-600 rounded-md hover:bg-slate-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <span className="text-[9px] text-slate-400 font-bold flex items-center gap-0.5">
                      <Users className="w-2.5 h-2.5" /> {t.capacity}
                    </span>
                  )}
                </div>

                {/* Table Status trigger */}
                <div className="flex justify-between items-end">
                  <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold uppercase ${
                    isTableServing 
                      ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/25' 
                      : 'bg-slate-200 text-slate-500 border border-slate-300'
                  }`}>
                    {isTableServing ? 'Phục vụ' : 'Trống'}
                  </span>

                  {!isDesignMode && (
                    <button
                      onClick={(e) => handleToggleTableStatus(t.id, e)}
                      className="p-1 bg-white hover:bg-slate-100 rounded-lg text-[9px] font-bold border border-slate-200 hover:border-slate-300 shadow-sm"
                      title="Chuyển trạng thái bàn"
                    >
                      {isTableServing ? 'Trả bàn' : 'Gọi khách'}
                    </button>
                  )}
                </div>

                {/* Visual indicator of dragging state */}
                {draggingId === t.id && (
                  <div className="absolute inset-0 bg-indigo-500/10 border-2 border-dashed border-indigo-400 rounded-2xl pointer-events-none animate-pulse"></div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Control console for custom design adding */}
      {simUserRole === 'admin' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-100 pt-4">
          
          {/* Form 1: Add new table */}
          <form onSubmit={handleAddTable} className="space-y-2 bg-slate-50 border border-slate-200 p-3.5 rounded-2xl">
            <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-wide">🔧 THÊM BÀN ĂN MỚI</h5>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                placeholder="Bàn 06"
                className="col-span-2 px-2.5 py-1.5 border border-slate-200 bg-white rounded-xl text-xs"
                required
              />
              <input
                type="number"
                value={newTableCapacity}
                onChange={(e) => setNewTableCapacity(parseInt(e.target.value) || 4)}
                placeholder="Ghế"
                className="px-2.5 py-1.5 border border-slate-200 bg-white rounded-xl text-xs font-semibold text-center"
                min="1"
                max="24"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-1.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm"
            >
              + Tạo bàn ăn
            </button>
          </form>

          {/* Form 2: Add new zone */}
          <form onSubmit={handleAddZone} className="space-y-2 bg-slate-50 border border-slate-200 p-3.5 rounded-2xl flex flex-col justify-between">
            <div>
              <h5 className="text-[11px] font-black text-slate-800 uppercase tracking-wide">📍 THÊM KHU VỰC SƠ ĐỒ MỚI</h5>
              <input
                type="text"
                value={newZoneName}
                onChange={(e) => setNewZoneName(e.target.value)}
                placeholder="Tầng lửng ngoài trời"
                className="w-full px-2.5 py-1.5 border border-slate-200 bg-white rounded-xl text-xs mt-2"
                required
              />
            </div>
            <button
              type="submit"
              className="w-full py-1.5 bg-slate-900 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition-all shadow-sm mt-2"
            >
              + Thêm khu vực
            </button>
          </form>

        </div>
      )}

    </div>
  );
}
