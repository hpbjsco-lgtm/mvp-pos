/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AUTH_CONFIG } from './authConfig';
import React, { useState, useEffect } from 'react';
import {
  ShoppingBag,
  Layers,
  TrendingUp,
  User,
  LogOut,
  Store,
  ChevronRight,
  ChevronDown,
  Coffee,
  Check,
  X,
  XCircle,
  ShieldAlert,
  MapPin,
  Phone,
  Clock,
  WifiOff,
  UserCircle,
  ChefHat,
  ClipboardList,
  Users,
  Briefcase,
  Truck,
  History,
  Wallet,
  Menu
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import KitchenDisplay from './components/KitchenDisplay';

// Clean screen imports
import LoginScreen from './components/LoginScreen';
import POSScreen from './components/POSScreen';
import InventoryScreen from './components/InventoryScreen';
import ReportsSection from './components/ReportsSection';
import OrderHistorySection from './components/OrderHistorySection';
import ShiftSection from './components/ShiftSection';
import MenuManagement from './components/MenuManagement';
import TableMap from './components/TableMap';
import CustomersSection from './components/CustomersSection';
import EmployeesSection from './components/EmployeesSection';
import SuppliersSection from './components/SuppliersSection';
import SysAdminDashboard from './components/SysAdminDashboard';
import { setLogContext, logOperation } from './utils/logger';
import { useAppData } from './db/useAppData';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<'pos' | 'inventory' | 'reports' | 'account' | 'kitchen' | 'menu' | 'tables' | 'customers' | 'employees' | 'suppliers' | 'sysadmin' | 'orders' | 'shifts'>('reports');

  // --- CORE DATA (SQLite local-first, xem src/db/useAppData.ts) ---
  const app = useAppData();
  const {
    ready,
    initError,
    user: fbUserProfile,
    store: fbStoreProfile,
    storeId,
    storeType: simStoreType,
    isSysAdmin,
    isDemoSession,
    data,
    carts: simCarts,
    setters,
    setCarts: setSimCarts,
  } = app;

  const simCustomers = data.customers;
  const setSimCustomers = setters.customers;
  const simSuppliers = data.suppliers;
  const setSimSuppliers = setters.suppliers;
  const simEmployees = data.employees;
  const setSimEmployees = setters.employees;
  const simAttendance = data.attendance;
  const setSimAttendance = setters.attendance;
  const simZones = data.zones;
  const setSimZones = setters.zones;
  const simTables = data.tables;
  const setSimTables = setters.tables;
  const simProducts = data.products;
  const setSimProducts = setters.products;
  const simKitchenItems = data.kitchenItems;
  const setSimKitchenItems = setters.kitchenItems;
  const simOrders = data.orders;
  const setSimOrders = setters.orders;
  const simBatches = data.batches;
  const setSimBatches = setters.batches;
  const simTransactions = data.transactions;
  const setSimTransactions = setters.transactions;
  const simIngredients = data.ingredients;
  const setSimIngredients = setters.ingredients;
  const simIngredientBatches = data.ingredientBatches;
  const setSimIngredientBatches = setters.ingredientBatches;
  const simIngredientTransactions = data.ingredientTransactions;
  const setSimIngredientTransactions = setters.ingredientTransactions;
  const setSimStoreType = app.setStoreType;
  const simShifts = data.shifts;
  const setSimShifts = setters.shifts;

  const fbUser = fbUserProfile; // giữ tên biến cũ cho phần JSX phía dưới chưa đổi
  const demoSession = isDemoSession && fbStoreProfile
    ? { userName: fbUserProfile?.name || '', storeId: fbStoreProfile.id, storeType: fbStoreProfile.storeType, storeName: fbStoreProfile.name }
    : null;
  const isDemoOfflineMode = isDemoSession;

  const [authError, setAuthError] = useState<string>('');
  const [simSelectedTableId, setSimSelectedTableId] = useState<string>('T1');
  const simUserRole: 'admin' | 'staff' = isSysAdmin || fbUserProfile?.role === 'owner' || fbUserProfile?.role === 'manager' ? 'admin' : 'staff';

  // Audio-visual alert state (beep simulator triggers)
  const [simSuccessBeep, setSimSuccessBeep] = useState<boolean>(false);
  const [simErrorBeep, setSimErrorBeep] = useState<boolean>(false);

  // Hardcoded Auth from config
  const HARDCODED_EMAIL = AUTH_CONFIG.EMAIL;

  // Sidebar collapsibility state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);

  // Play audio-visual Beep simulators
  const triggerBeep = (success: boolean) => {
    if (success) {
      setSimSuccessBeep(true);
      setTimeout(() => setSimSuccessBeep(false), 250);
    } else {
      setSimErrorBeep(true);
      setTimeout(() => setSimErrorBeep(false), 250);
    }
  };

  // --- LOG CONTEXT SYNC EFFECT ---
  useEffect(() => {
    if (fbUserProfile) {
      setLogContext({
        userId: fbUserProfile.uid,
        userName: fbUserProfile.name || 'User',
        storeId: storeId || 'Sandbox',
      });
    } else {
      setLogContext({
        userId: 'unknown_user',
        userName: 'Khách vãng lai / Hệ thống',
        storeId: 'Sandbox',
      });
    }
  }, [fbUserProfile, storeId]);

  // Seed Data function cho cửa hàng mới (dùng lại từ src/db/seed.ts, gọi được từ SysAdmin để seed thủ công)
  const seedStoreData = async (targetStoreId: string, storeType: 'fnb' | 'retail'): Promise<boolean> => {
    const { seedStore } = await import('./db/seed');
    return seedStore(targetStoreId, storeType);
  };

  // Auth helper callbacks passed to login screen (giữ nguyên chữ ký cũ để LoginScreen.tsx không cần đổi)
  const handleFirebaseLogin = async (e?: React.FormEvent, overrideEmail?: string, overridePass?: string) => {
    if (e) e.preventDefault();
    const email = overrideEmail?.trim().toLowerCase();
    const pass = overridePass;
    if (!email || !pass) {
      setAuthError("Vui lòng điền đầy đủ email và mật khẩu.");
      return;
    }
    setAuthError("");
    try {
      await app.signIn(email, pass);
      triggerBeep(true);
    } catch (err: any) {
      console.error(err);
      setAuthError("Đăng nhập thất bại: " + (err.message || "Kiểm tra lại tài khoản."));
      triggerBeep(false);
    }
  };

  const handleFirebaseRegister = async (
    e?: React.FormEvent,
    overrideEmail?: string,
    overridePass?: string,
    overrideName?: string,
    overrideStoreName?: string,
    overrideStoreType?: 'fnb' | 'retail',
    overridePhone?: string,
    overrideAddress?: string
  ) => {
    if (e) e.preventDefault();
    const email = overrideEmail?.trim().toLowerCase();
    const pass = overridePass;
    const name = overrideName;
    const storeName = overrideStoreName;
    const storeType = overrideStoreType || 'fnb';
    const phone = overridePhone;
    const address = overrideAddress;

    if (!email || !pass || !name || !storeName || !phone || !address) {
      setAuthError("Vui lòng điền đầy đủ tất cả các trường thông tin.");
      return;
    }
    setAuthError("");
    try {
      await app.register({ email, password: pass, name, storeName, storeType, phone, address });
      triggerBeep(true);
      alert("Đăng ký thành công! Cửa hàng " + storeName + " đã sẵn sàng sử dụng ngay trên thiết bị này.");
    } catch (err: any) {
      console.error(err);
      setAuthError("Đăng ký thất bại: " + (err.message || "Đã xảy ra lỗi hệ thống."));
      triggerBeep(false);
    }
  };

  const handleFirebaseLogout = async () => {
    try {
      await app.signOut();
      setActiveScreen('pos');
      triggerBeep(true);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCheckIn = async (userId: string, userName: string) => {
    const todayStr = new Date().toLocaleDateString('sv-SE');
    const attId = `att-${userId}-${todayStr}`;
    const checkInTime = new Date().toISOString();
    const empRecord = simEmployees.find((e: any) => e.uid === userId);

    const newAttendance = {
      id: attId,
      storeId,
      userId,
      userName,
      date: todayStr,
      checkIn: checkInTime,
      checkOut: null,
      hoursWorked: 0,
      hourlyRate: empRecord?.hourlyRate || 25000,
      dailyWage: 0,
      status: 'working' as const
    };

    try {
      logOperation('Chấm công', 'Nhân viên Check-in', { userId, userName, checkInTime });
      setSimAttendance((prev: any[]) => [newAttendance, ...prev.filter((a) => a.id !== attId)]);
      triggerBeep(true);
      alert(`Check-in thành công lúc ${new Date(checkInTime).toLocaleTimeString('vi-VN')}!`);
    } catch (err) {
      console.error(err);
      triggerBeep(false);
      alert("Lỗi ghi nhận Check-in!");
    }
  };

  const handleCheckOut = async (userId: string) => {
    const todayStr = new Date().toLocaleDateString('sv-SE');
    const attId = `att-${userId}-${todayStr}`;
    const checkOutTime = new Date().toISOString();

    try {
      logOperation('Chấm công', 'Nhân viên Check-out', { userId, checkOutTime });
      setSimAttendance((prev: any[]) => prev.map((a) => {
        if (a.id !== attId) return a;
        const checkInDate = new Date(a.checkIn);
        const checkOutDate = new Date(checkOutTime);
        const diffMs = checkOutDate.getTime() - checkInDate.getTime();
        const hours = Number(Math.max(0.01, diffMs / (1000 * 60 * 60)));
        const empRecord = simEmployees.find((e: any) => e.uid === userId);
        const hourlyRate = empRecord?.hourlyRate || a.hourlyRate || 25000;
        return {
          ...a,
          checkOut: checkOutTime,
          hoursWorked: hours,
          hourlyRate,
          dailyWage: Number((hours * hourlyRate).toFixed(0)),
          status: 'completed' as const
        };
      }));
      triggerBeep(true);
      alert("Check-out thành công! Ca trực đã hoàn tất và kết toán lương ngày.");
    } catch (err) {
      console.error(err);
      triggerBeep(false);
      alert("Lỗi ghi nhận Check-out!");
    }
  };

  // Live Clock for Header
  const [timeStr, setTimeStr] = useState<string>('');
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setTimeStr(now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    };
    updateTime();
    const timer = setInterval(updateTime, 1000);
    return () => clearInterval(timer);
  }, []);

  // Redirect staff users away from restricted sections (reports, employees, suppliers, account)
  useEffect(() => {
    if (simUserRole === 'staff') {
      const restrictedScreens = ['reports', 'employees', 'suppliers', 'account'];
      if (restrictedScreens.includes(activeScreen)) {
        setActiveScreen('pos');
      }
    }
  }, [simUserRole, activeScreen]);

  // Show Loading Spinner while setting up initial SQLite state
  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100">
        <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide text-slate-400">Đang khởi động hệ thống SmartPOS...</p>
        {initError && <p className="text-xs text-rose-400 mt-3 max-w-sm text-center">{initError}</p>}
      </div>
    );
  }

  // Define Navigation Items dynamically based on active Store Type
  const navItems = isSysAdmin ? [
    { id: 'reports', name: 'Báo cáo doanh thu', icon: TrendingUp },
    { id: 'sysadmin', name: 'Quản trị hệ thống', icon: ShieldAlert }
  ] : [
    ...(simUserRole !== 'staff' ? [{ id: 'reports', name: 'Báo cáo doanh thu', icon: TrendingUp }] : []),
    { id: 'pos', name: simStoreType === 'fnb' ? 'Bán hàng (F&B Order)' : 'Quầy bán lẻ (POS)', icon: ShoppingBag },
    ...(simStoreType === 'fnb' ? [
      { id: 'kitchen', name: 'Màn hình Bếp (KDS)', icon: ChefHat },
      { id: 'menu', name: 'Thực đơn & Menu', icon: Coffee },
      { id: 'tables', name: 'Sơ đồ bàn', icon: ClipboardList }
    ] : [
      { id: 'menu', name: 'Quản lý sản phẩm', icon: Coffee }
    ]),
    { id: 'orders', name: 'Lịch sử hóa đơn', icon: History },
    { id: 'shifts', name: 'Sổ quỹ ca làm việc', icon: Wallet },
    { id: 'inventory', name: 'Quản lý kho (FEFO)', icon: Layers },
    { id: 'customers', name: 'Quản lý khách hàng', icon: Users },
    ...(simUserRole !== 'staff' ? [
      { id: 'employees', name: 'Quản lý nhân viên', icon: Briefcase },
      { id: 'suppliers', name: 'Quản lý nhà cung cấp', icon: Truck }
    ] : []),
  ];

  const hasActiveSession = !!fbUserProfile;

  // Full-screen Login view if no active session
  if (!hasActiveSession) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-6xl">
          <LoginScreen
            fbUser={fbUser}
            fbUserProfile={fbUserProfile}
            fbStoreProfile={fbStoreProfile}
            authLoading={!ready}
            authError={authError}
            isDemoOfflineMode={isDemoOfflineMode}
            setIsDemoOfflineMode={() => {}}
            onLogin={handleFirebaseLogin}
            onRegister={handleFirebaseRegister}
            onLogout={handleFirebaseLogout}
            onDemoLogin={(userName, demoStoreId, demoStoreType, demoStoreName) => {
              app.demoLogin(userName, demoStoreId, demoStoreType, demoStoreName)
                .then(() => {
                  triggerBeep(true);
                  setActiveScreen('reports'); // Start with reports!
                })
                .catch((err) => {
                  console.error(err);
                  setAuthError('Không mở được cửa hàng demo: ' + (err?.message || 'Lỗi không xác định.'));
                  triggerBeep(false);
                });
            }}
            triggerBeep={triggerBeep}
          />
        </div>
      </div>
    );
  }

  const isStorePending = !isDemoOfflineMode && fbUserProfile && fbUserProfile.role !== 'sysadmin' && fbStoreProfile?.status === 'pending';
  const isStoreRejected = !isDemoOfflineMode && fbUserProfile && fbUserProfile.role !== 'sysadmin' && fbStoreProfile?.status === 'rejected';

  if (isStorePending) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-6 text-center shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none opacity-50"></div>
          
          <div className="relative z-10 space-y-4">
            <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 text-amber-500 rounded-2xl flex items-center justify-center mx-auto animate-pulse">
              <Clock className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <span className="px-2.5 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md text-[10px] font-black tracking-widest uppercase font-mono">
                PENDING APPROVAL
              </span>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Cửa hàng đang chờ duyệt</h2>
              <p className="text-xs text-slate-400 font-medium">
                Cửa hàng <strong className="text-slate-200">"{fbStoreProfile?.name}"</strong> của bạn đã đăng ký thành công. Hiện tại đang chờ Ban quản trị phê duyệt để kích hoạt hệ thống bán hàng.
              </p>
            </div>

            <div className="p-4 bg-slate-950 rounded-2xl border border-slate-800/80 text-left space-y-2 text-xs text-slate-400 font-medium">
              <div className="flex justify-between">
                <span>Mã định danh:</span>
                <span className="font-mono text-slate-300">{fbStoreProfile?.id}</span>
              </div>
              <div className="flex justify-between">
                <span>Người liên hệ:</span>
                <span className="text-slate-300">{fbUserProfile?.name}</span>
              </div>
              <div className="flex justify-between">
                <span>Mô hình:</span>
                <span className="text-slate-300">{fbStoreProfile?.storeType === 'fnb' ? '🍔 F&B (Nhà hàng)' : '🛍️ Bán lẻ'}</span>
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
              Vui lòng liên hệ quản trị viên qua email <strong className="text-slate-200">{AUTH_CONFIG.EMAIL}</strong> hoặc hotline <strong className="text-slate-200">0900.POS.SYS</strong> để được phê duyệt nhanh nhất.
            </p>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={handleFirebaseLogout}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-98 transition-all text-xs font-bold rounded-xl border border-slate-700 text-white cursor-pointer"
              >
                Đăng xuất tài khoản
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isStoreRejected) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-slate-100">
        <div className="w-full max-w-md bg-slate-900 border border-rose-950 rounded-3xl p-8 space-y-6 text-center shadow-xl relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,_var(--tw-gradient-stops))] from-rose-500/10 via-transparent to-transparent pointer-events-none opacity-50"></div>
          
          <div className="relative z-10 space-y-4">
            <div className="w-16 h-16 bg-rose-500/10 border border-rose-500/30 text-rose-500 rounded-2xl flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8" />
            </div>
            
            <div className="space-y-2">
              <span className="px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-md text-[10px] font-black tracking-widest uppercase font-mono">
                ACCESS REJECTED
              </span>
              <h2 className="text-xl font-black text-white uppercase tracking-tight">Kích hoạt bị từ chối</h2>
              <p className="text-xs text-slate-400 font-medium">
                Cửa hàng <strong className="text-slate-200">"{fbStoreProfile?.name}"</strong> đã bị từ chối kích hoạt hoạt động hoặc bị khóa bởi Quản trị viên hệ thống.
              </p>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed font-medium">
              Vui lòng liên hệ quản trị viên qua email <strong className="text-slate-200">{AUTH_CONFIG.EMAIL}</strong> để biết thêm thông tin chi tiết.
            </p>

            <div className="pt-2 flex flex-col gap-2">
              <button
                onClick={handleFirebaseLogout}
                className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 active:scale-98 transition-all text-xs font-bold rounded-xl border border-slate-700 text-white cursor-pointer"
              >
                Đăng xuất tài khoản
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-container-low font-sans text-on-surface flex antialiased">

      {/* Audio-visual virtual speaker indicator (simulated beeps) */}
      <AnimatePresence>
        {simSuccessBeep && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-secondary text-on-secondary rounded-xl shadow-lg flex items-center space-x-3 pointer-events-none"
          >
            <div className="w-2.5 h-2.5 bg-white rounded-full animate-ping" />
            <span className="text-sm font-bold tracking-wide">Thành công</span>
          </motion.div>
        )}
        {simErrorBeep && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-6 right-6 z-50 px-4 py-3 bg-error text-on-error rounded-xl shadow-lg flex items-center space-x-3 pointer-events-none"
          >
            <div className="w-2.5 h-2.5 bg-white rounded-full animate-ping" />
            <span className="text-sm font-bold tracking-wide">Có lỗi xảy ra</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nền mờ phía sau menu điều hướng trên di động */}
      {mobileNavOpen && (
        <div
          onClick={() => setMobileNavOpen(false)}
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
        />
      )}

      {/* --- SIDEBAR NAVIGATION: off-canvas trên di động, cố định trên màn lớn --- */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-72 ${sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'} bg-slate-900 text-slate-300 flex-shrink-0 flex flex-col shadow-xl transition-transform duration-300
          ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'} lg:translate-x-0 lg:static lg:z-10 lg:border-r lg:border-slate-800`}
      >

        {/* Logo & Store Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-lg flex-shrink-0">
              <Store className="w-5 h-5" />
            </div>
            {!sidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="min-w-0">
                <h1 className="text-base font-bold text-white tracking-tight truncate max-w-[170px]" title={fbStoreProfile?.name || demoSession?.storeName || 'SmartPOS Lite'}>
                  {fbStoreProfile?.name || demoSession?.storeName || 'SmartPOS Lite'}
                </h1>
                <p className="text-sm text-slate-400 font-semibold flex items-center mt-0.5 whitespace-nowrap">
                  {isDemoOfflineMode ? (
                    <>
                      <WifiOff className="w-3.5 h-3.5 text-tertiary mr-1 flex-shrink-0" />
                      Demo Ngoại tuyến
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5 text-secondary mr-1 flex-shrink-0" />
                      Tài khoản đã đăng ký
                    </>
                  )}
                </p>
              </motion.div>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Collapse/Expand Toggle button (chỉ trên màn lớn) */}
            <button
              onClick={() => { setSidebarCollapsed(!sidebarCollapsed); triggerBeep(true); }}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors hidden lg:block cursor-pointer"
              title={sidebarCollapsed ? "Mở rộng menu" : "Thu gọn menu"}
            >
              {sidebarCollapsed ? <ChevronRight className="w-5 h-5" /> : <ChevronDown className="w-5 h-5 -rotate-90" />}
            </button>
            {/* Nút đóng menu trên di động */}
            <button
              onClick={() => setMobileNavOpen(false)}
              className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-200 transition-colors lg:hidden cursor-pointer"
              title="Đóng menu"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Navigation Options */}
        <nav className="flex-1 p-3 space-y-1.5 mt-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveScreen(item.id as any); setMobileNavOpen(false); }}
                className={`w-full flex items-center ${sidebarCollapsed ? 'lg:justify-center lg:px-0 lg:py-3' : 'px-4 py-3'} space-x-3.5 rounded-xl text-base font-bold transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-slate-800 text-white border-l-4 border-primary'
                    : 'hover:bg-slate-800/40 text-slate-400 hover:text-slate-100'
                }`}
                title={item.name}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isActive ? 'text-primary' : 'text-slate-500'}`} />
                {!(sidebarCollapsed) && (
                  <span className={`flex-1 text-left whitespace-nowrap truncate ${sidebarCollapsed ? 'lg:hidden' : ''}`}>{item.name}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* User Card & Logout bottom region */}
        <div className={`p-4 border-t border-slate-800 bg-slate-950/60 flex items-center ${sidebarCollapsed ? 'lg:justify-center' : 'justify-between'}`}>
          <div className="flex items-center space-x-2.5 overflow-hidden">
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0" title={fbUserProfile?.name || demoSession?.userName || 'Nhân viên Demo'}>
              <UserCircle className="w-5 h-5 text-slate-400" />
            </div>
            <div className={`min-w-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
              <p className="text-sm font-bold text-white truncate">
                {fbUserProfile?.name || demoSession?.userName || 'Nhân viên Demo'}
              </p>
              <p className="text-sm text-slate-500 truncate mt-0.5">
                {fbUserProfile?.email || `ID: ${demoSession?.storeId || 'Sandbox'}`}
              </p>
            </div>
          </div>
          <button
            onClick={() => handleFirebaseLogout()}
            className={`p-2 text-slate-500 hover:text-error rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer ${sidebarCollapsed ? 'lg:hidden' : ''}`}
            title="Đăng xuất"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {/* --- MAIN CORE SECTION VIEWPORT --- */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* --- GLOBAL APP BAR / HEADER --- */}
        <header className="bg-surface-container-lowest border-b border-outline-variant h-16 px-3 md:px-6 flex items-center justify-between flex-shrink-0 gap-2">
          <div className="flex items-center space-x-3 min-w-0">
            {/* Nút mở menu điều hướng trên di động */}
            <button
              onClick={() => setMobileNavOpen(true)}
              className="m3-icon-btn lg:hidden -ml-1"
              title="Mở menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <h2 className="text-base font-bold text-on-surface tracking-tight hidden md:block truncate">
              {activeScreen === 'pos' && 'Quầy bán hàng'}
              {activeScreen === 'kitchen' && 'Màn hình bếp (KDS)'}
              {activeScreen === 'menu' && (simStoreType === 'fnb' ? 'Thực đơn & Menu' : 'Quản lý sản phẩm')}
              {activeScreen === 'tables' && 'Sơ đồ bàn'}
              {activeScreen === 'inventory' && (simStoreType === 'fnb' ? 'Quản lý kho nguyên vật liệu (FIFO/FEFO)' : 'Quản lý kho hàng hóa (FIFO)')}
              {activeScreen === 'reports' && 'Báo cáo doanh thu & chỉ số'}
              {activeScreen === 'orders' && 'Lịch sử hóa đơn'}
              {activeScreen === 'shifts' && 'Sổ quỹ ca làm việc'}
              {activeScreen === 'customers' && 'Quản lý khách hàng'}
              {activeScreen === 'employees' && 'Quản lý nhân viên'}
              {activeScreen === 'suppliers' && 'Quản lý nhà cung cấp'}
              {activeScreen === 'sysadmin' && 'Quản trị hệ thống'}
              {activeScreen === 'account' && 'Thiết lập tài khoản'}
            </h2>

            {/* Store ID Tag next to title */}
            <div className="hidden md:flex items-center space-x-1.5 bg-primary-container px-3 py-1.5 rounded-xl text-sm font-bold text-on-primary-container font-mono">
              <span>Mã cửa hàng:</span>
              <span className="select-all">{fbUserProfile?.storeId || demoSession?.storeId || 'LOCAL-DEMO'}</span>
            </div>

            <div className="md:hidden flex items-center space-x-2 min-w-0">
              <Store className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-base font-bold text-on-surface truncate">
                {fbStoreProfile?.name || demoSession?.storeName || 'SmartPOS'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">

            {/* Quick stats tags */}
            <div className="hidden lg:flex items-center space-x-3.5 text-sm text-on-surface-variant border-r border-outline-variant pr-4 font-semibold">
              <div className="flex items-center">
                <span className="w-2 h-2 rounded-full bg-secondary mr-1.5" />
                Món khả dụng: <strong className="text-on-surface ml-1">{simProducts.filter(p => p.isAvailable).length}</strong>
              </div>
              {simStoreType === 'fnb' && (
                <div className="flex items-center">
                  <span className="w-2 h-2 rounded-full bg-tertiary mr-1.5" />
                  Bàn đang dùng: <strong className="text-on-surface ml-1">{simTables.filter(t => t.status === 'serving').length}</strong>
                </div>
              )}
            </div>

            {/* Current Real Time */}
            <div className="hidden sm:flex items-center space-x-2 bg-surface-container border border-outline-variant rounded-xl px-3 py-1.5 text-sm font-bold text-on-surface-variant font-mono">
              <Clock className="w-4 h-4" />
              <span>{timeStr || '00:00:00'}</span>
            </div>

            {/* Status Indicator */}
            {isDemoOfflineMode ? (
              <span className="m3-badge m3-badge-warning">
                <span className="w-2 h-2 rounded-full bg-tertiary animate-pulse" />
                <span className="hidden sm:inline">Offline Demo</span>
              </span>
            ) : (
              <span className="m3-badge m3-badge-success">
                <span className="w-2 h-2 rounded-full bg-secondary" />
                <span className="hidden sm:inline">Tài khoản chính thức</span>
              </span>
            )}
          </div>
        </header>

        {/* --- DYNAMIC SCREEN RENDER STAGE --- */}
        <section className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 bg-surface-container-low">
          
          <AnimatePresence mode="wait">
            {activeScreen === 'pos' && (
              <motion.div
                key="pos"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="h-full"
              >
                <POSScreen
                  simStoreType={simStoreType}
                  setSimStoreType={setSimStoreType}
                  simProducts={simProducts}
                  simTables={simTables}
                  setSimTables={setSimTables}
                  simZones={simZones}
                  setSimZones={setSimZones}
                  simCarts={simCarts}
                  setSimCarts={setSimCarts}
                  simKitchenItems={simKitchenItems}
                  setSimKitchenItems={setSimKitchenItems}
                  simOrders={simOrders}
                  setSimOrders={setSimOrders}
                  simCustomers={simCustomers}
                  setSimCustomers={setSimCustomers}
                  simSelectedTableId={simSelectedTableId}
                  setSimSelectedTableId={setSimSelectedTableId}
                  simUserRole={simUserRole}
                  isDemoOfflineMode={isDemoOfflineMode}
                  fbUserProfile={fbUserProfile}
                  fbStoreProfile={fbStoreProfile}
                  triggerBeep={triggerBeep}
                  simBatches={simBatches}
                  setSimBatches={setSimBatches}
                />
              </motion.div>
            )}

            {activeScreen === 'inventory' && (
              <motion.div
                key="inventory"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <InventoryScreen
                  simProducts={simStoreType === 'fnb' ? simIngredients : simProducts}
                  setSimProducts={simStoreType === 'fnb' ? setSimIngredients : setSimProducts}
                  simBatches={simStoreType === 'fnb' ? simIngredientBatches : simBatches}
                  setSimBatches={simStoreType === 'fnb' ? setSimIngredientBatches : setSimBatches}
                  simTransactions={simStoreType === 'fnb' ? simIngredientTransactions : simTransactions}
                  setSimTransactions={simStoreType === 'fnb' ? setSimIngredientTransactions : setSimTransactions}
                  triggerBeep={triggerBeep}
                  fbUserProfile={fbUserProfile}
                  simStoreType={simStoreType}
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                />
              </motion.div>
            )}

            {activeScreen === 'orders' && (
              <motion.div
                key="orders"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <OrderHistorySection
                  simOrders={simOrders}
                  setSimOrders={setSimOrders}
                  simBatches={simBatches}
                  setSimBatches={setSimBatches}
                  simCustomers={simCustomers}
                  setSimCustomers={setSimCustomers}
                  simStoreType={simStoreType}
                  simUserRole={simUserRole}
                  triggerBeep={triggerBeep}
                  fbStoreProfile={fbStoreProfile}
                  fbUserProfile={fbUserProfile}
                />
              </motion.div>
            )}

            {activeScreen === 'shifts' && (
              <motion.div
                key="shifts"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <ShiftSection
                  simShifts={simShifts}
                  setSimShifts={setSimShifts}
                  simOrders={simOrders}
                  triggerBeep={triggerBeep}
                  currentUser={{
                    uid: fbUserProfile?.uid || 'demo-user-123',
                    name: fbUserProfile?.name || demoSession?.userName || 'Nhân viên'
                  }}
                />
              </motion.div>
            )}

            {activeScreen === 'reports' && (
              <motion.div
                key="reports"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <ReportsSection
                  simOrders={simOrders}
                  simProducts={simProducts}
                  triggerBeep={triggerBeep}
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                  currentUser={{
                    uid: fbUser?.uid || 'demo-user-123',
                    name: fbUserProfile?.name || demoSession?.userName || 'Quản trị viên Demo'
                  }}
                  attendanceLogs={simAttendance}
                  onCheckIn={handleCheckIn}
                  onCheckOut={handleCheckOut}
                  isSysAdmin={isSysAdmin}
                />
              </motion.div>
            )}

            {activeScreen === 'menu' && (
              <motion.div
                key="menu"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <MenuManagement
                  simProducts={simProducts}
                  setSimProducts={setSimProducts}
                  triggerBeep={triggerBeep}
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                  storeType={simStoreType}
                />
              </motion.div>
            )}

            {activeScreen === 'tables' && simStoreType === 'fnb' && (
              <motion.div
                key="tables"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-6xl mx-auto"
              >
                <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 space-y-4">
                  <div className="flex justify-between items-center border-b border-slate-100 pb-3">
                    <div>
                      <h3 className="text-base font-black text-slate-900 uppercase">Quản lý sơ đồ phòng bàn F&B</h3>
                      <p className="text-xs text-slate-500">Chỉnh sửa khu vực, thêm bàn ăn, kéo thả di chuyển vị trí bàn trực quan trong chế độ thiết kế.</p>
                    </div>
                  </div>
                  <TableMap
                    simTables={simTables}
                    setSimTables={setSimTables}
                    simZones={simZones}
                    setSimZones={setSimZones}
                    simSelectedTableId={simSelectedTableId}
                    setSimSelectedTableId={setSimSelectedTableId}
                    simUserRole={simUserRole}
                    triggerBeep={triggerBeep}
                    isOffline={isDemoOfflineMode}
                    storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                  />
                </div>
              </motion.div>
            )}

            {activeScreen === 'kitchen' && simStoreType === 'fnb' && (
              <motion.div
                key="kitchen"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <KitchenDisplay
                  simKitchenItems={simKitchenItems}
                  setSimKitchenItems={setSimKitchenItems}
                  triggerBeep={triggerBeep}
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                />
              </motion.div>
            )}

            {activeScreen === 'customers' && (
              <motion.div
                key="customers"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <CustomersSection
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                  triggerBeep={triggerBeep}
                  simCustomers={simCustomers}
                  setSimCustomers={setSimCustomers}
                />
              </motion.div>
            )}

            {activeScreen === 'employees' && (
              <motion.div
                key="employees"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <EmployeesSection
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                  triggerBeep={triggerBeep}
                  simEmployees={simEmployees}
                  setSimEmployees={setSimEmployees}
                  simAttendance={simAttendance}
                  setSimAttendance={setSimAttendance}
                />
              </motion.div>
            )}

            {activeScreen === 'suppliers' && (
              <motion.div
                key="suppliers"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <SuppliersSection
                  isOffline={isDemoOfflineMode}
                  storeId={fbUserProfile?.storeId || demoSession?.storeId || 'Sandbox'}
                  triggerBeep={triggerBeep}
                  simSuppliers={simSuppliers}
                  setSimSuppliers={setSimSuppliers}
                />
              </motion.div>
            )}

            {activeScreen === 'sysadmin' && (
              <motion.div
                key="sysadmin"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <SysAdminDashboard
                  onLogout={handleFirebaseLogout}
                  triggerBeep={triggerBeep}
                  seedStoreData={seedStoreData}
                />
              </motion.div>
            )}

            {activeScreen === 'account' && (
              <motion.div
                key="account"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-4xl mx-auto"
              >
                {/* Active Session Display */}
                {isDemoOfflineMode && demoSession ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-slate-100 gap-4">
                      <div className="flex items-center space-x-3.5">
                        <div className="w-12 h-12 bg-gradient-to-tr from-amber-500 to-amber-600 rounded-xl flex items-center justify-center text-white shadow shadow-amber-500/15">
                          <Store className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-base font-extrabold text-slate-900 uppercase">Cửa hàng Demo Ngoại tuyến</h3>
                          <p className="text-xs text-slate-500">Mã định danh Sandbox: <code className="font-mono bg-slate-50 px-1 py-0.5 rounded border border-slate-200/50">{demoSession.storeId}</code></p>
                        </div>
                      </div>
                      <div>
                        <button
                          onClick={() => handleFirebaseLogout()}
                          className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors flex items-center space-x-2 cursor-pointer shadow-sm active:scale-98"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>ĐĂNG XUẤT DEMO</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Tên cửa hàng</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl">{demoSession.storeName}</p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Số điện thoại liên hệ</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl flex items-center">
                            <Phone className="w-4 h-4 text-slate-400 mr-2" />
                            0900000000 (Chế độ Demo Sandbox)
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Mô hình hoạt động</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl uppercase">
                            {demoSession.storeType === 'fnb' ? '🍔 FnB (Nhà hàng / Bàn ăn)' : '🛍️ Retail (Bán lẻ / Mã vạch)'}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Nhân viên hiện tại</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl">{demoSession.userName}</p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                      <span>Cơ sở dữ liệu: SQLite (local-first)</span>
                      <span>Máy chủ Cloud: chưa kết nối (chế độ Demo)</span>
                    </div>
                  </div>
                ) : !isDemoOfflineMode && fbStoreProfile ? (
                  <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-slate-100 gap-4">
                      <div className="flex items-center space-x-3.5">
                        <div className="w-12 h-12 bg-gradient-to-tr from-emerald-500 to-emerald-600 rounded-xl flex items-center justify-center text-white shadow shadow-emerald-500/15">
                          <Store className="w-6 h-6" />
                        </div>
                        <div>
                          <h3 className="text-base font-extrabold text-slate-900 uppercase">Cửa hàng hoạt động</h3>
                          <p className="text-xs text-slate-500">Mã định danh: <code className="font-mono bg-slate-50 px-1 py-0.5 rounded border border-slate-200/50">{fbStoreProfile.id}</code></p>
                        </div>
                      </div>
                      <div className="flex space-x-2">
                        <button 
                          onClick={handleFirebaseLogout}
                          className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors flex items-center space-x-2 cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" />
                          <span>ĐĂNG XUẤT</span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Tên cửa hàng</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl">{fbStoreProfile.name}</p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Số điện thoại liên hệ</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl flex items-center">
                            <Phone className="w-4 h-4 text-slate-400 mr-2" />
                            {fbStoreProfile.phone}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Địa chỉ chi nhánh</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl flex items-center">
                            <MapPin className="w-4 h-4 text-slate-400 mr-2" />
                            {fbStoreProfile.address}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Mô hình hoạt động</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl uppercase">
                            {fbStoreProfile.storeType === 'fnb' ? '🍔 FnB (Nhà hàng / Bàn ăn)' : '🛍️ Retail (Bán lẻ / Mã vạch)'}
                          </p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Quản trị viên liên kết</span>
                          <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl">{fbUserProfile?.name}</p>
                        </div>
                        <div className="space-y-1.5">
                          <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Trạng thái đồng bộ</span>
                          <div className="px-3 py-2.5 border border-emerald-100 bg-emerald-50/30 rounded-xl flex items-center text-xs text-emerald-800 font-bold">
                            <Check className="w-4 h-4 mr-2 text-emerald-600" />
                            Dữ liệu lưu cục bộ trên thiết bị (SQLite)
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                      <span>Cơ sở dữ liệu: SQLite (local-first)</span>
                      <span>Đồng bộ Cloud: xem mục "Đồng bộ Cloud"</span>
                    </div>
                  </div>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
          
        </section>

      </main>

    </div>
  );
}
