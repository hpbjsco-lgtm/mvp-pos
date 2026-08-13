/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Shield, Store, Users, Check, X, Clock, Search, Filter, Sparkles, 
  RefreshCw, AlertCircle, Phone, MapPin, Mail, Calendar, HelpCircle, 
  Trash2, ShieldCheck, CheckCircle2, XCircle
} from 'lucide-react';
import { listStores, listAllUsers } from '../db/auth';
import { run, upsert, nowIso } from '../db/index';

interface SysAdminDashboardProps {
  onLogout: () => Promise<void>;
  triggerBeep: (success: boolean) => void;
  seedStoreData: (storeId: string, storeType: 'fnb' | 'retail') => Promise<boolean>;
}

export default function SysAdminDashboard({
  onLogout,
  triggerBeep,
  seedStoreData
}: SysAdminDashboardProps) {
  const [stores, setStores] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedStoreId, setSelectedStoreId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const [confirmAction, setConfirmAction] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const seedInitialSystemData = async () => {
    setConfirmAction({
      message: "Bạn có chắc chắn muốn khởi tạo dữ liệu mẫu cho hệ thống?",
      onConfirm: async () => {
        setConfirmAction(null);
        setLoading(true);
        try {
          const storeId = `store-${Date.now()}`;
          const ts = nowIso();
          await upsert('stores', {
            id: storeId,
            name: "Cửa Hàng Mẫu 01",
            address: "123 Đường Mẫu, Quận 1, TP.HCM",
            phone: "0900000001",
            store_type: 'fnb',
            status: 'active',
            created_at: ts,
            updated_at: ts,
          });
          alert("Đã khởi tạo cửa hàng mẫu!");
          await fetchData();
        } catch (err) {
          console.error(err);
          alert("Lỗi khởi tạo!");
        } finally {
          setLoading(false);
        }
      }
    });
  };

  // Đọc toàn bộ cửa hàng + tài khoản từ SQLite cục bộ
  const fetchData = async () => {
    setLoading(true);
    try {
      const storesList = await listStores();
      const usersList = await listAllUsers();
      setStores(storesList);
      setUsers(usersList);
    } catch (err) {
      console.error("Lỗi tải dữ liệu hệ thống: ", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Handle Approve Store
  const approveStore = async (storeId: string) => {
    const store = stores.find(s => s.id === storeId);
    if (!store) {
      console.error("Store not found:", storeId);
      return;
    }
    
    setConfirmAction({
      message: `Bạn có chắc chắn muốn PHÊ DUYỆT cửa hàng "${store.name}"?`,
      onConfirm: async () => {
        setConfirmAction(null);
        setActionLoading(store.id);
        try {
          // 1. Update store status to active
          await run('UPDATE stores SET status = ?, updated_at = ? WHERE id = ?', ['active', nowIso(), store.id]);

          // 2. Seed default data for the store (only if not already seeded)
          const seeded = await seedStoreData(store.id, store.storeType || 'fnb');
          if (!seeded) {
              throw new Error("Lỗi khi khởi tạo dữ liệu mẫu cho cửa hàng.");
          }
          console.log("Store data seeded");

          // 3. Send email (Placeholder)
          const ownerUser = users.find(u => u.storeId === store.id && u.role === 'owner');
          console.log(`[EMAIL] Đã gửi email kích hoạt đến: ${ownerUser?.email || 'N/A'}`);
          console.log(`[EMAIL] Nội dung: Chúc mừng cửa hàng ${store.name} đã được kích hoạt thành công. Chủ cửa hàng có thể đăng nhập ngay bây giờ.`);

          triggerBeep(true);
          alert(`Phê duyệt thành công cửa hàng "${store.name}". Hệ thống mẫu đã được khởi tạo và email thông báo đã được "gửi" đến chủ cửa hàng.`);
          await fetchData();
        } catch (err: any) {
          console.error("Lỗi trong approveStore:", err);
          triggerBeep(false);
          alert(`Lỗi phê duyệt: ${err.message}`);
        } finally {
          setActionLoading(null);
        }
      }
    });
  };

  // Handle Reject Store
  const handleRejectStore = async (store: any) => {
    setConfirmAction({
      message: `Bạn có chắc chắn muốn TỪ CHỐI cửa hàng "${store.name}"?`,
      onConfirm: async () => {
        setConfirmAction(null);
        setActionLoading(store.id);
        try {
          await run('UPDATE stores SET status = ?, updated_at = ? WHERE id = ?', ['rejected', nowIso(), store.id]);
          triggerBeep(true);
          alert(`Đã từ chối hoạt động cho cửa hàng "${store.name}".`);
          await fetchData();
        } catch (err: any) {
          console.error("Lỗi trong handleRejectStore:", err);
          triggerBeep(false);
          alert(`Lỗi từ chối: ${err.message}`);
        } finally {
          setActionLoading(null);
        }
      }
    });
  };

  // Filter stores
  const filteredStores = stores.filter(store => {
    const matchesSearch = 
      store.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      store.phone?.includes(searchTerm) ||
      store.id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const storeStatus = store.status || 'active'; // default old stores to active
    const matchesStatus = statusFilter === 'all' || storeStatus === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Count metrics
  const totalStores = stores.length;
  const pendingStores = stores.filter(s => s.status === 'pending').length;
  const activeStores = stores.filter(s => s.status === 'active' || s.status === undefined).length;
  const totalUsers = users.length;

  // Selected store users
  const storeUsers = users.filter(u => u.storeId === selectedStoreId);
  const activeStore = stores.find(s => s.id === selectedStoreId);

  return (
    <div id="sysadmin-dashboard-container" className="space-y-6 max-w-7xl mx-auto pb-12 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-rose-900 via-slate-900 to-indigo-950 rounded-3xl p-6 lg:p-8 text-white relative overflow-hidden shadow-xl border border-rose-800/20">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent opacity-85 pointer-events-none"></div>
        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-[10px] font-black tracking-widest uppercase font-mono">
                SYSTEM ADMISTRATOR
              </span>
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"></span>
            </div>
            <h1 className="text-2xl lg:text-3xl font-black tracking-tight uppercase flex items-center gap-2">
              <Shield className="w-8 h-8 text-rose-400" /> QUẢN TRỊ TRUNG TÂM CLOUD
            </h1>
            <p className="text-xs text-slate-300 font-medium max-w-2xl">
              Hệ thống giám sát, xét duyệt hoạt động các chuỗi và cửa hàng thuộc SmartPOS Cloud Tenant System. Đảm bảo phân tách và kiểm soát dữ liệu.
            </p>
          </div>
          <button
            onClick={() => { fetchData(); triggerBeep(true); }}
            className="px-4 py-2 bg-white/10 hover:bg-white/15 active:scale-95 transition-all text-xs font-bold rounded-xl border border-white/10 flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Tải lại dữ liệu
          </button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider block">Tổng số cửa hàng</span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">{totalStores}</span>
          </div>
          <div className="p-3 bg-slate-100 text-slate-600 rounded-2xl">
            <Store className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-amber-500 uppercase tracking-wider block">Đang chờ duyệt</span>
            <span className="text-2xl font-black text-amber-600 mt-1 block">{pendingStores}</span>
          </div>
          <div className="p-3 bg-amber-50 text-amber-600 rounded-2xl border border-amber-100">
            <Clock className="w-5 h-5 animate-pulse" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-emerald-500 uppercase tracking-wider block">Đã phê duyệt</span>
            <span className="text-2xl font-black text-emerald-600 mt-1 block">{activeStores}</span>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
            <ShieldCheck className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold text-rose-500 uppercase tracking-wider block">Người dùng Cloud</span>
            <span className="text-2xl font-black text-rose-600 mt-1 block">{totalUsers}</span>
          </div>
          <div className="p-3 bg-rose-50 text-rose-600 rounded-2xl border border-rose-100">
            <Users className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Content Split Area */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Stores List (Left 8 columns) */}
        <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50">
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-tight">Danh sách chuỗi & cửa hàng đăng ký</h2>
              <p className="text-[11px] text-slate-400 font-medium">Bấm vào từng cửa hàng để xem chi tiết danh sách tài khoản liên kết.</p>
            </div>
            
            <div className="flex gap-2 w-full sm:w-auto">
              {/* Seed Button */}
              {stores.length === 0 && (
                <button
                  onClick={seedInitialSystemData}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs flex items-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Khởi tạo Mẫu
                </button>
              )}
              
              {/* Search box */}
              <div className="relative flex-1 sm:flex-none">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm kiếm..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full sm:w-44 pl-9 pr-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-rose-500"
                />
              </div>

              {/* Status filter dropdown */}
              <select
                value={statusFilter}
                onChange={(e: any) => setStatusFilter(e.target.value)}
                className="px-2 py-1.5 border border-slate-200 rounded-xl text-xs bg-white text-slate-700 font-bold"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="pending">Chờ duyệt</option>
                <option value="active">Đã duyệt</option>
                <option value="rejected">Từ chối</option>
              </select>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            {loading ? (
              <div className="p-12 text-center space-y-2">
                <svg className="animate-spin h-6 w-6 text-rose-500 mx-auto" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span className="text-xs text-slate-400 font-medium block">Đang đọc dữ liệu từ SQLite cục bộ...</span>
              </div>
            ) : filteredStores.length === 0 ? (
              <div className="p-12 text-center text-xs text-slate-400 font-medium">
                Không tìm thấy cửa hàng nào khớp với bộ lọc.
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">
                    <th className="py-3 px-4">Mã Store</th>
                    <th className="py-3 px-4">Tên Cửa Hàng</th>
                    <th className="py-3 px-4">Mô Hình</th>
                    <th className="py-3 px-4">Liên Hệ</th>
                    <th className="py-3 px-4">Trạng Thái</th>
                    <th className="py-3 px-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-medium text-slate-600">
                  {filteredStores.map((store) => {
                    const status = store.status || 'approved';
                    const isSelected = selectedStoreId === store.id;
                    const ownerUser = users.find(u => u.storeId === store.id && u.role === 'owner');

                    return (
                      <tr 
                        key={store.id} 
                        onClick={() => setSelectedStoreId(store.id)}
                        className={`hover:bg-slate-50/70 transition-colors cursor-pointer ${
                          isSelected ? 'bg-rose-50/20 hover:bg-rose-50/30 font-semibold' : ''
                        }`}
                      >
                        <td className="py-3 px-4 font-mono text-[10px] text-slate-500">{store.id}</td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-slate-900">{store.name}</div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="w-2.5 h-2.5" /> {store.address || 'Không rõ địa chỉ'}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                            store.storeType === 'fnb' 
                              ? 'bg-pink-50 text-pink-600 border border-pink-100' 
                              : 'bg-emerald-50 text-emerald-600 border border-emerald-100'
                          }`}>
                            {store.storeType === 'fnb' ? '🍔 FnB (Nhà hàng)' : '🛍️ Bán Lẻ (Retail)'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-col text-[10px]">
                            <span className="font-bold text-slate-700 flex items-center gap-1">
                              <Phone className="w-2.5 h-2.5 text-slate-400" /> {store.phone}
                            </span>
                            {ownerUser && (
                              <span className="text-slate-400 flex items-center gap-1 mt-0.5">
                                <Mail className="w-2.5 h-2.5" /> {ownerUser.email}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-extrabold ${
                            status === 'pending' ? 'bg-amber-50 text-amber-600 border border-amber-100 animate-pulse' :
                            status === 'active' ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' :
                            'bg-rose-50 text-rose-600 border border-rose-100'
                          }`}>
                            {status === 'pending' ? <Clock className="w-3 h-3" /> :
                             status === 'active' ? <CheckCircle2 className="w-3 h-3" /> :
                             <XCircle className="w-3 h-3" />}
                            {status === 'pending' ? 'Chờ Duyệt' :
                             status === 'active' ? 'Đã Kích Hoạt' :
                             'Bị Từ Chối'}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                          <div className="flex justify-end gap-1.5">
                            {status === 'pending' && (
                              <>
                                <button
                                  onClick={() => approveStore(store.id)}
                                  disabled={actionLoading !== null}
                                  className="p-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-extrabold rounded-lg text-[10px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                                  title="Duyệt cửa hàng & seed dữ liệu"
                                >
                                  <Check className="w-3 h-3" /> Duyệt
                                </button>
                                <button
                                  onClick={() => handleRejectStore(store)}
                                  disabled={actionLoading !== null}
                                  className="p-1 px-2.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-200 text-white font-extrabold rounded-lg text-[10px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                                  title="Từ chối hoạt động"
                                >
                                  <X className="w-3 h-3" /> Từ chối
                                </button>
                              </>
                            )}

                            {status === 'rejected' && (
                              <button
                                onClick={() => approveStore(store.id)}
                                disabled={actionLoading !== null}
                                className="p-1 px-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 text-white font-extrabold rounded-lg text-[10px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                              >
                                Kích hoạt lại
                              </button>
                            )}

                            {status === 'active' && (
                              <button
                                onClick={() => handleRejectStore(store)}
                                disabled={actionLoading !== null}
                                className="p-1 px-2 bg-slate-100 hover:bg-rose-50 hover:text-rose-600 disabled:bg-slate-200 text-slate-500 font-extrabold rounded-lg text-[10px] flex items-center gap-1 active:scale-95 transition-all cursor-pointer"
                              >
                                Vô hiệu hóa
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Store Detail & Associated Accounts (Right 4 columns) */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden p-5 space-y-4">
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-tight flex items-center gap-1.5">
                <Users className="w-4 h-4 text-rose-500" /> Tài khoản liên kết
              </h3>
              <p className="text-[11px] text-slate-400 font-medium">Nhân viên & chủ thuộc Store ID được chọn.</p>
            </div>

            {selectedStoreId ? (
              <div className="space-y-3">
                <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-100 text-xs space-y-1.5">
                  <div className="font-bold text-slate-800 flex items-center gap-1">
                    <Store className="w-3.5 h-3.5 text-rose-500" /> {activeStore?.name || 'Cửa hàng không tên'}
                  </div>
                  <div className="text-[10px] text-slate-400 font-mono">ID: {selectedStoreId}</div>
                  <div className="text-[11px] text-slate-500">Mô hình: {activeStore?.storeType === 'fnb' ? '🍔 Nhà hàng FnB' : '🛍️ Cửa hàng Tạp hóa/Bán lẻ'}</div>
                </div>

                <div className="space-y-2">
                  <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Danh sách Nhân viên ({storeUsers.length})</div>
                  {storeUsers.length === 0 ? (
                    <div className="text-[11px] text-slate-400 font-medium py-4 text-center">Chưa có người dùng nào thuộc Store này.</div>
                  ) : (
                    <div className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto pr-1">
                      {storeUsers.map((u) => (
                        <div key={u.uid} className="py-2 flex items-center justify-between">
                          <div className="space-y-0.5">
                            <div className="text-xs font-bold text-slate-800">{u.name || 'Chưa đặt tên'}</div>
                            <div className="text-[10px] text-slate-400 font-mono">{u.email}</div>
                          </div>
                          <span className={`px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                            u.role === 'owner' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-blue-100 text-blue-800 border border-blue-200'
                          }`}>
                            {u.role === 'owner' ? 'CHỦ TIỆM' : 'NHÂN VIÊN'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-slate-400 font-medium border border-dashed border-slate-200 rounded-2xl">
                ⚠️ Click chọn một cửa hàng từ danh sách bên trái để tải dữ liệu tài khoản liên kết.
              </div>
            )}
          </div>

          {/* System Admin Notice Card */}
          <div className="bg-slate-900 text-white rounded-3xl p-5 border border-slate-800 space-y-3 relative overflow-hidden">
            <div className="absolute right-0 bottom-0 translate-x-1/4 translate-y-1/4 pointer-events-none opacity-5">
              <Shield className="w-40 h-40" />
            </div>
            <div className="flex items-center gap-1.5 text-rose-400 text-xs font-black uppercase tracking-wider font-mono">
              <ShieldCheck className="w-4.5 h-4.5" /> Quy tắc phân mảnh dữ liệu
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
              Tất cả dữ liệu kinh doanh (hóa đơn, sản phẩm, tồn kho, sơ đồ bàn...) được lưu trong 1 file SQLite duy nhất trên thiết bị, mọi bảng đều gắn cột <code className="font-mono text-rose-300 text-[10px]">store_id</code> để phân tách dữ liệu giữa các cửa hàng. Khi bật đồng bộ Cloud, dữ liệu của các cửa hàng khác cũng được hợp nhất vào cùng file này để phục vụ báo cáo toàn hệ thống.
            </p>
            <div className="text-[11px] text-slate-400 font-medium">
              Chỉ có System Admin mới được cấp quyền truy cập đa chủ thể (multi-tenant) để phục vụ công tác phê duyệt và hậu kiểm.
            </div>
          </div>
        </div>

        {/* Confirm Modal */}
        {confirmAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-3xl p-6 max-w-sm w-full shadow-2xl space-y-4">
              <div className="text-lg font-black text-slate-900">Xác nhận</div>
              <p className="text-sm text-slate-600">{confirmAction.message}</p>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setConfirmAction(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs"
                >
                  Hủy
                </button>
                <button
                  onClick={confirmAction.onConfirm}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs"
                >
                  Xác nhận
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
