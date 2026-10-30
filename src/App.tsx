/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Banknote, FileText, ShoppingBag, Layers, TrendingUp, LogOut, Store, ChevronRight, ChevronDown, Coffee, Check, X,
  MapPin, Phone, Clock, UserCircle, ChefHat, ClipboardList, Users, Briefcase, Truck, History, Wallet, Menu
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
import SysAdminStores from './components/SysAdminStores';
import SysAdminAccounts from './components/SysAdminAccounts';
import SuppliersSection from './components/SuppliersSection';
import MyAccountDialog from './components/MyAccountDialog';
import TopNavBar from './components/TopNavBar';
import CashbookSection from './components/CashbookSection';
import EndOfDayReport from './components/EndOfDayReport';
import { canAccess, defaultScreen, isAdminRole, normalizeRole, ROLE_LABELS, type ScreenId } from './utils/permissions';
import { setLogContext, logOperation } from './utils/logger';
import { useAppData } from './db/useAppData';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ScreenId>('reports');

  // --- CORE DATA (SQLite local-first, xem src/db/useAppData.ts) ---
  const app = useAppData();
  const {
    ready,
    initError,
    user: fbUserProfile,
    store: fbStoreProfile,
    storeId,
    storeType: simStoreType,
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
  const simBankAccounts = data.bankAccounts;
  const setSimBankAccounts = setters.bankAccounts;
  const simCashVouchers = data.cashVouchers;
  const setSimCashVouchers = setters.cashVouchers;
  const simShifts = data.shifts;
  const setSimShifts = setters.shifts;

  const fbUser = fbUserProfile; // giữ tên biến cũ cho phần JSX phía dưới chưa đổi
  // Ứng dụng hiện chỉ lưu dữ liệu cục bộ (SQLite); khi nối Firebase sau này sẽ đổi cờ này theo trạng thái kết nối
  const isLocalOnly = true;

  const [authError, setAuthError] = useState<string>('');
  const [simSelectedTableId, setSimSelectedTableId] = useState<string>('T1');
  const userRole = normalizeRole(fbUserProfile?.role);
  // 'admin' = chủ cửa hàng / quản lý (được thiết kế sơ đồ bàn, v.v.); các vai trò còn lại là 'staff'
  const simUserRole: 'admin' | 'staff' = isAdminRole(userRole) ? 'admin' : 'staff';

  // Audio-visual alert state (beep simulator triggers)
  const [simSuccessBeep, setSimSuccessBeep] = useState<boolean>(false);
  const [simErrorBeep, setSimErrorBeep] = useState<boolean>(false);

  // Hardcoded Auth from config

  // Sidebar collapsibility state
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  const [myAccountOpen, setMyAccountOpen] = useState<boolean>(false);
  // Yêu cầu mở sẵn form thêm Món / Topping ở màn Thực đơn (từ nút "Thêm mới" của Kho hàng)
  const [menuAction, setMenuAction] = useState<'dish' | 'topping' | null>(null);
  // Thanh menu trên cùng (màn hình lớn): thu gọn / mở rộng, nhớ lựa chọn
  const [navCollapsed, setNavCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('nav_collapsed') === '1'; } catch { return false; }
  });
  const toggleNavCollapsed = () => {
    setNavCollapsed(v => {
      const next = !v;
      try { localStorage.setItem('nav_collapsed', next ? '1' : '0'); } catch { /* bỏ qua */ }
      return next;
    });
  };

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

  // Auth helper callbacks passed to login screen (giữ nguyên chữ ký cũ để LoginScreen.tsx không cần đổi)
  const handleFirebaseLogin = async (e?: React.FormEvent, overrideEmail?: string, overridePass?: string) => {
    if (e) e.preventDefault();
    const login = overrideEmail?.trim().toLowerCase();
    const pass = overridePass;
    if (!login || !pass) {
      setAuthError("Vui lòng điền đầy đủ tài khoản và mật khẩu.");
      return;
    }
    setAuthError("");
    try {
      await app.signIn(login, pass);
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
    overrideAddress?: string,
    overrideUsername?: string
  ) => {
    if (e) e.preventDefault();
    const email = overrideEmail?.trim().toLowerCase();
    const pass = overridePass;
    const name = overrideName;
    const storeName = overrideStoreName;
    const storeType = overrideStoreType || 'fnb';
    const phone = overridePhone;
    const address = overrideAddress;
    const username = overrideUsername;

    if (!username || !email || !pass || !name || !storeName || !phone || !address) {
      setAuthError("Vui lòng điền đầy đủ tất cả các trường thông tin.");
      return;
    }
    setAuthError("");
    try {
      await app.register({ username, email, password: pass, name, storeName, storeType, phone, address });
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

  // Đưa người dùng về màn hình được phép theo vai trò (vd: nhân viên bếp chỉ vào màn hình bếp)
  useEffect(() => {
    if (fbUserProfile && !canAccess(userRole, activeScreen)) {
      setActiveScreen(defaultScreen(userRole));
    }
  }, [fbUserProfile, userRole, activeScreen]);

  // Show Loading Spinner while setting up initial SQLite state
  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-slate-100">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-sm font-medium tracking-wide text-slate-400">Đang khởi động hệ thống SmartPOS...</p>
        {initError && <p className="text-xs text-rose-400 mt-3 max-w-sm text-center">{initError}</p>}
      </div>
    );
  }

  // The database could not start (for example the database server is unreachable): show why
  if (initError) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center p-4">
        <div className="w-full max-w-2xl space-y-4">
          <div className="bg-error-container text-on-error-container rounded-2xl p-4 space-y-1">
            <h2 className="text-lg font-bold">Không mở được cơ sở dữ liệu</h2>
            <p className="text-sm">{initError}</p>
          </div>
          <button type="button" onClick={() => window.location.reload()} className="m3-btn-filled !rounded-xl">Thử lại</button>
        </div>
      </div>
    );
  }

  // Biểu tượng cho từng mục điều hướng
  const NAV_ICONS: Record<ScreenId, React.ComponentType<{ className?: string }>> = {
    stores: Store, accounts: Users, reports: TrendingUp, pos: ShoppingBag, kitchen: ChefHat, menu: Coffee,
    tables: ClipboardList, orders: History, shifts: Wallet, cashbook: Banknote, eod: FileText, inventory: Layers, customers: Users,
    employees: Briefcase, suppliers: Truck, account: UserCircle
  };

  // Màu ô menu (thanh menu trên cùng)
  const NAV_COLORS: Record<string, string> = {
    stores: '#4c7bd9', accounts: '#7a5bc7', reports: '#4c7bd9', pos: '#c15f3c', kitchen: '#8a5a3c', menu: '#2f8f7b',
    tables: '#6b5bc7', orders: '#d9568f', shifts: '#3e8fb0', cashbook: '#2e7d5b', eod: '#4c7bd9', inventory: '#1f3a66', customers: '#4ca39b',
    employees: '#8a6a00', suppliers: '#5b7d3a'
  };

  // Define Navigation Items dynamically based on active Store Type
  const allNavItems: { id: ScreenId; name: string }[] = [
    { id: 'stores', name: 'Cửa hàng' },
    { id: 'accounts', name: 'Tài khoản' },
    { id: 'reports', name: 'Báo cáo doanh thu' },
    { id: 'eod', name: 'Báo cáo cuối ngày' },
    { id: 'pos', name: simStoreType === 'fnb' ? 'Bán hàng (F&B Order)' : 'Quầy bán lẻ (POS)' },
    ...(simStoreType === 'fnb' ? [
      { id: 'kitchen' as ScreenId, name: 'Màn hình Bếp (KDS)' },
      { id: 'menu' as ScreenId, name: 'Thực đơn & Menu' },
      { id: 'tables' as ScreenId, name: 'Sơ đồ bàn' }
    ] : [
      { id: 'menu' as ScreenId, name: 'Quản lý sản phẩm' }
    ]),
    { id: 'orders', name: 'Lịch sử hóa đơn' },
    { id: 'shifts', name: 'Sổ quỹ ca làm việc' },
    { id: 'cashbook', name: 'Sổ quỹ & Dòng tiền' },
    { id: 'inventory', name: 'Quản lý kho (FEFO)' },
    { id: 'customers', name: 'Quản lý khách hàng' },
    { id: 'employees', name: 'Quản lý nhân viên' },
    { id: 'suppliers', name: 'Quản lý nhà cung cấp' },
  ];
  // Chỉ hiện các mục mà vai trò hiện tại được phép vào
  const navItems = allNavItems.filter(item => canAccess(userRole, item.id));

  // Mục chính trên thanh điều hướng đáy (di động); các mục còn lại nằm trong nút "Thêm"
  const mobileNavPrimary = [
    { id: 'stores' as ScreenId, name: 'Cửa hàng' },
    { id: 'accounts' as ScreenId, name: 'Tài khoản' },
    { id: 'pos' as ScreenId, name: 'Bán hàng' },
    ...(simStoreType === 'fnb' ? [{ id: 'kitchen' as ScreenId, name: 'Bếp' }] : []),
    { id: 'orders' as ScreenId, name: 'Hóa đơn' },
    { id: 'reports' as ScreenId, name: 'Báo cáo' },
  ].filter(item => canAccess(userRole, item.id));

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
            onLogin={handleFirebaseLogin}
            onRegister={handleFirebaseRegister}
            onLogout={handleFirebaseLogout}
            onDemoLogin={(userName, demoStoreId, demoStoreType, demoStoreName) => {
              app.demoLogin(userName, demoStoreId, demoStoreType, demoStoreName)
                .then(() => {
                  triggerBeep(true);
                  setActiveScreen('reports');
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

  return (
    <div className="h-dvh bg-surface-container-low font-sans text-on-surface flex antialiased overflow-hidden">

      {/* Audio-visual virtual speaker indicator (simulated beeps) */}
      <AnimatePresence>
        {simSuccessBeep && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-3 bg-secondary text-on-secondary rounded-xl shadow-lg flex items-center space-x-3 pointer-events-none"
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
            className="fixed top-4 left-1/2 -translate-x-1/2 z-[70] px-4 py-3 bg-error text-on-error rounded-xl shadow-lg flex items-center space-x-3 pointer-events-none"
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
          ${mobileNavOpen ? 'translate-x-0' : '-translate-x-full'} lg:hidden`}
      >

        {/* Logo & Store Header */}
        <div className="p-4 border-b border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <div className="flex items-center space-x-3 overflow-hidden">
            <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center text-on-primary shadow-lg flex-shrink-0">
              <Store className="w-5 h-5" />
            </div>
            {!sidebarCollapsed && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.15 }} className="min-w-0">
                <h1 className="text-base font-bold text-white tracking-tight truncate max-w-[170px]" title={fbStoreProfile?.name || 'SmartPOS'}>
                  {fbStoreProfile?.name || (userRole === 'sysadmin' ? 'Quản trị hệ thống' : 'SmartPOS')}
                </h1>
                <p className="text-sm text-slate-400 font-semibold flex items-center mt-0.5 whitespace-nowrap">
                  <Check className="w-3.5 h-3.5 text-secondary mr-1 flex-shrink-0" />
                  {userRole ? ROLE_LABELS[userRole] : ''}{isDemoSession ? ' · Demo' : ''}
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
            const Icon = NAV_ICONS[item.id];
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
          <button
            onClick={() => { setMyAccountOpen(true); setMobileNavOpen(false); triggerBeep(true); }}
            className="flex items-center space-x-2.5 overflow-hidden text-left cursor-pointer rounded-xl hover:bg-slate-800/60 p-1 -m-1"
            title="Chấm công / Đổi mật khẩu"
          >
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 flex-shrink-0">
              <UserCircle className="w-5 h-5 text-slate-400" />
            </div>
            <div className={`min-w-0 ${sidebarCollapsed ? 'lg:hidden' : ''}`}>
              <p className="text-sm font-bold text-white truncate">
                {fbUserProfile?.name || 'Nhân viên'}
              </p>
              <p className="text-sm text-slate-500 truncate mt-0.5">
                {fbUserProfile?.username || fbUserProfile?.email}
              </p>
            </div>
          </button>
          <button
            onClick={() => handleFirebaseLogout()}
            className={`p-2 text-slate-500 hover:text-error rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer ${sidebarCollapsed ? 'lg:hidden' : ''}`}
            title="Đăng xuất"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </aside>

      {myAccountOpen && fbUserProfile && (
        <MyAccountDialog
          user={{ uid: fbUserProfile.uid, name: fbUserProfile.name, username: fbUserProfile.username, email: fbUserProfile.email }}
          roleLabel={userRole ? ROLE_LABELS[userRole] : ''}
          canCheckIn={userRole !== 'sysadmin'}
          canChangePassword={userRole !== 'sysadmin'}
          attendance={simAttendance}
          onCheckIn={handleCheckIn}
          onCheckOut={handleCheckOut}
          onChangePassword={app.changeOwnPassword}
          triggerBeep={triggerBeep}
          onClose={() => setMyAccountOpen(false)}
        />
      )}

      {/* --- MAIN CORE SECTION VIEWPORT --- */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Thanh menu trên cùng (màn hình lớn): các chức năng dạng ô màu */}
        <TopNavBar
          items={navItems.map(item => ({ id: item.id, name: item.name.replace(/ \(.*\)$/, ''), Icon: NAV_ICONS[item.id], color: NAV_COLORS[item.id] || '#6b7280' }))}
          activeId={activeScreen}
          onSelect={(id) => { setActiveScreen(id as ScreenId); triggerBeep(true); }}
          collapsed={navCollapsed}
          onToggleCollapsed={toggleNavCollapsed}
          storeName={fbStoreProfile?.name || (userRole === 'sysadmin' ? 'Quản trị hệ thống' : 'SmartPOS')}
          roleLabel={`${userRole ? ROLE_LABELS[userRole] : ''}${isDemoSession ? ' · Demo' : ''}`}
          userName={fbUserProfile?.name || 'Nhân viên'}
          clock={timeStr || '00:00:00'}
          onOpenAccount={() => { setMyAccountOpen(true); triggerBeep(true); }}
          onLogout={() => handleFirebaseLogout()}
        />

        {/* --- GLOBAL APP BAR / HEADER --- */}
        <header className="lg:hidden bg-surface-container-lowest border-b border-outline-variant h-16 px-3 md:px-6 flex items-center justify-between flex-shrink-0 gap-2">
          <div className="flex items-center space-x-3 min-w-0">
            <h2 className="text-base font-bold text-on-surface tracking-tight hidden md:block truncate">
              {activeScreen === 'pos' && 'Quầy bán hàng'}
              {activeScreen === 'kitchen' && 'Màn hình bếp (KDS)'}
              {activeScreen === 'menu' && (simStoreType === 'fnb' ? 'Thực đơn & Menu' : 'Quản lý sản phẩm')}
              {activeScreen === 'tables' && 'Sơ đồ bàn'}
              {activeScreen === 'inventory' && (simStoreType === 'fnb' ? 'Quản lý kho nguyên vật liệu (FIFO/FEFO)' : 'Quản lý kho hàng hóa (FIFO)')}
              {activeScreen === 'reports' && 'Báo cáo doanh thu & chỉ số'}
              {activeScreen === 'orders' && 'Lịch sử hóa đơn'}
              {activeScreen === 'shifts' && 'Sổ quỹ ca làm việc'}
              {activeScreen === 'cashbook' && 'Sổ quỹ & Dòng tiền'}
              {activeScreen === 'eod' && 'Báo cáo cuối ngày'}
              {activeScreen === 'customers' && 'Quản lý khách hàng'}
              {activeScreen === 'employees' && 'Quản lý nhân viên'}
              {activeScreen === 'suppliers' && 'Quản lý nhà cung cấp'}
              {activeScreen === 'account' && 'Thiết lập tài khoản'}
              {activeScreen === 'stores' && 'Quản lý cửa hàng'}
              {activeScreen === 'accounts' && 'Quản lý tài khoản'}
            </h2>

            <div className="md:hidden flex items-center space-x-2 min-w-0">
              <Store className="w-5 h-5 text-primary flex-shrink-0" />
              <span className="text-base font-bold text-on-surface truncate">
                {fbStoreProfile?.name || 'SmartPOS'}
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3 shrink-0">

            {/* Quick stats tags */}
            {userRole !== 'sysadmin' && (
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
            )}

            {/* Current Real Time */}
            <div className="hidden sm:flex items-center space-x-2 bg-surface-container border border-outline-variant rounded-xl px-3 py-1.5 text-sm font-bold text-on-surface-variant font-mono">
              <Clock className="w-4 h-4" />
              <span>{timeStr || '00:00:00'}</span>
            </div>
          </div>
        </header>

        {/* --- DYNAMIC SCREEN RENDER STAGE --- */}
        <section className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 md:px-6 pt-3 sm:pt-4 md:pt-6 pb-20 lg:px-3 lg:pt-3 lg:pb-3 bg-surface-container-low">
          
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
                  isDemoOfflineMode={isLocalOnly}
                  fbUserProfile={fbUserProfile}
                  fbStoreProfile={fbStoreProfile}
                  triggerBeep={triggerBeep}
                  simBatches={simBatches}
                  setSimBatches={setSimBatches}
                  simBankAccounts={simBankAccounts}
                  setSimBankAccounts={setSimBankAccounts}
                  simIngredients={simIngredients}
                  simIngredientBatches={simIngredientBatches}
                  setSimIngredientBatches={setSimIngredientBatches}
                  setSimIngredientTransactions={setSimIngredientTransactions}
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
                  isOffline={isLocalOnly}
                  storeId={storeId}
                  menuProducts={simStoreType === 'fnb' ? simProducts : []}
                  onCreateDish={() => { setMenuAction('dish'); setActiveScreen('menu'); }}
                  onCreateTopping={() => { setMenuAction('topping'); setActiveScreen('menu'); }}
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

            {activeScreen === 'eod' && (
              <motion.div key="eod" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <EndOfDayReport
                  orders={simOrders}
                  vouchers={simCashVouchers}
                  accounts={simBankAccounts}
                  carts={simCarts}
                  products={simProducts}
                  tables={simTables}
                  zones={simZones}
                  storeType={simStoreType}
                />
              </motion.div>
            )}

            {activeScreen === 'cashbook' && (
              <motion.div
                key="cashbook"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
              >
                <CashbookSection
                  simOrders={simOrders}
                  bankAccounts={simBankAccounts}
                  setBankAccounts={setSimBankAccounts}
                  vouchers={simCashVouchers}
                  setVouchers={setSimCashVouchers}
                  staffName={fbUserProfile?.name || 'Nhân viên'}
                  triggerBeep={triggerBeep}
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
                    uid: fbUserProfile?.uid || '',
                    name: fbUserProfile?.name || 'Nhân viên'
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
                  isOffline={isLocalOnly}
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
                  isOffline={isLocalOnly}
                  storeId={storeId}
                  storeType={simStoreType}
                  startAction={menuAction}
                  onActionHandled={() => setMenuAction(null)}
                  ingredients={simStoreType === 'fnb' ? simIngredients : []}
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
                className="max-w-screen-2xl mx-auto"
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
                    isOffline={isLocalOnly}
                    storeId={storeId}
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
                  isOffline={isLocalOnly}
                  storeId={storeId}
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
                  isOffline={isLocalOnly}
                  storeId={storeId}
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
                  isOffline={isLocalOnly}
                  storeId={storeId}
                  triggerBeep={triggerBeep}
                  simEmployees={simEmployees}
                  setSimEmployees={setSimEmployees}
                  simAttendance={simAttendance}
                  setSimAttendance={setSimAttendance}
                  storeType={simStoreType}
                  onCreateEmployee={app.createEmployee}
                  onResetPassword={app.resetPassword}
                  currentRole={userRole}
                  currentUid={fbUserProfile?.uid}
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
                  isOffline={isLocalOnly}
                  storeId={storeId}
                  triggerBeep={triggerBeep}
                  simSuppliers={simSuppliers}
                  setSimSuppliers={setSimSuppliers}
                />
              </motion.div>
            )}

            {activeScreen === 'stores' && userRole === 'sysadmin' && (
              <motion.div key="stores" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <SysAdminStores
                  triggerBeep={triggerBeep}
                  onWiped={async () => { await app.signOut(); window.location.reload(); }}
                />
              </motion.div>
            )}

            {activeScreen === 'accounts' && userRole === 'sysadmin' && (
              <motion.div key="accounts" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                <SysAdminAccounts triggerBeep={triggerBeep} />
              </motion.div>
            )}

            {activeScreen === 'account' && fbStoreProfile && (
              <motion.div
                key="account"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="max-w-6xl mx-auto"
              >
                <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-5 border-b border-slate-100 gap-4">
                    <div className="flex items-center space-x-3.5">
                      <div className="w-12 h-12 bg-primary rounded-xl flex items-center justify-center text-white shadow">
                        <Store className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-900 uppercase">{fbStoreProfile.name}</h3>
                        <p className="text-xs text-slate-500">Mã định danh: <code className="font-mono bg-slate-50 px-1 py-0.5 rounded border border-slate-200/50">{fbStoreProfile.id}</code></p>
                      </div>
                    </div>
                    <button
                      onClick={handleFirebaseLogout}
                      className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold hover:bg-rose-100 transition-colors flex items-center space-x-2 cursor-pointer"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>ĐĂNG XUẤT</span>
                    </button>
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
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Tài khoản đăng nhập</span>
                        <p className="text-sm font-bold text-slate-900 bg-slate-50/50 px-3 py-2.5 border border-slate-100 rounded-xl">{fbUserProfile?.name}{userRole ? ` · ${ROLE_LABELS[userRole]}` : ''}</p>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider">Trạng thái lưu trữ</span>
                        <div className="px-3 py-2.5 border border-emerald-100 bg-emerald-50/30 rounded-xl flex items-center text-xs text-emerald-800 font-bold">
                          <Check className="w-4 h-4 mr-2 text-emerald-600" />
                          Dữ liệu lưu cục bộ trên thiết bị (SQLite)
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
                    <span>Cơ sở dữ liệu: SQLite (lưu trên thiết bị)</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

        </section>

      </main>

      {/* --- BOTTOM NAV: chỉ hiển thị trên di động, thay cho menu trượt. Desktop/tablet vẫn dùng sidebar cố định --- */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-surface-container-lowest border-t border-outline-variant safe-bottom">
        <div className="flex items-stretch h-16">
          {mobileNavPrimary.map(item => {
            const Icon = NAV_ICONS[item.id];
            const isActive = activeScreen === item.id;
            return (
              <button
                key={item.id}
                onClick={() => { setActiveScreen(item.id as any); triggerBeep(true); }}
                className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold cursor-pointer ${
                  isActive ? 'text-primary' : 'text-on-surface-variant'
                }`}
              >
                <Icon className="w-5 h-5" />
                {item.name}
              </button>
            );
          })}
          <button
            onClick={() => setMobileNavOpen(true)}
            className={`flex-1 flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold cursor-pointer ${
              mobileNavOpen ? 'text-primary' : 'text-on-surface-variant'
            }`}
          >
            <Menu className="w-5 h-5" />
            Thêm
          </button>
        </div>
      </nav>

    </div>
  );
}
