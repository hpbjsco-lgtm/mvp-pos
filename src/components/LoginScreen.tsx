/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Lock, Mail, Store, User, Phone, MapPin, Coffee, ShoppingBag,
  ArrowRight, ShieldCheck, HelpCircle, HardDrive, LogIn, Sparkles, UserCheck, Key
} from 'lucide-react';

interface LoginScreenProps {
  fbUser: any;
  fbUserProfile: any;
  fbStoreProfile: any;
  authLoading: boolean;
  authError: string;
  isDemoOfflineMode: boolean;
  setIsDemoOfflineMode: (val: boolean) => void;
  onLogin: (e: React.FormEvent, email: string, pass: string) => Promise<void>;
  onRegister: (
    e: React.FormEvent, 
    email: string, 
    pass: string, 
    name: string, 
    storeName: string, 
    storeType: 'fnb' | 'retail', 
    phone: string, 
    address: string
  ) => Promise<void>;
  onLogout: () => Promise<void>;
  onDemoLogin: (userName: string, storeId: string, storeType: 'fnb' | 'retail', storeName: string) => void;
  triggerBeep: (success: boolean) => void;
}

export default function LoginScreen({
  fbUser,
  fbUserProfile,
  fbStoreProfile,
  authLoading,
  authError,
  isDemoOfflineMode,
  setIsDemoOfflineMode,
  onLogin,
  onRegister,
  onLogout,
  onDemoLogin,
  triggerBeep
}: LoginScreenProps) {
  const [authMode, setAuthMode] = useState<'demo' | 'login' | 'register'>('demo');
  
  // Cloud Auth state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [storeName, setStoreName] = useState('');
  const [storeType, setStoreType] = useState<'fnb' | 'retail'>('fnb');
  const [storePhone, setStorePhone] = useState('');
  const [storeAddress, setStoreAddress] = useState('');

  // Offline Sandbox / Demo input states
  const [demoUser, setDemoUser] = useState('Nguyễn Hồng Sơn');
  const [demoPass, setDemoPass] = useState('123456');
  const [demoStoreId, setDemoStoreId] = useState('CH-VIET-88');
  const [demoStoreType, setDemoStoreType] = useState<'fnb' | 'retail'>('fnb');
  const [demoStoreName, setDemoStoreName] = useState('Bếp Việt Cafe & Restaurant');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'login') {
      await onLogin(e, email, password);
    } else if (authMode === 'register') {
      await onRegister(e, email, password, name, storeName, storeType, storePhone, storeAddress);
    } else {
      // Demo session local activation
      onDemoLogin(demoUser, demoStoreId, demoStoreType, demoStoreName);
    }
  };

  return (
    <div id="login-screen-container" className="grid grid-cols-1 lg:grid-cols-12 min-h-[640px] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl">

      {/* Decorative branding sidebar (Left) */}
      <div className="lg:col-span-5 bg-slate-950 p-8 lg:p-12 flex flex-col justify-between text-white">

        {/* Header Logo */}
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-primary rounded-2xl shadow-lg">
              <Store className="w-6 h-6 text-on-primary" />
            </div>
            <div>
              <span className="text-sm tracking-widest text-primary-container font-bold uppercase block">Multi-tenant</span>
              <h1 className="text-2xl font-bold tracking-tight text-white">SmartPOS</h1>
            </div>
          </div>
          <p className="text-base text-slate-400 font-medium max-w-sm">
            Hệ thống quản lý điểm bán hàng chuyên dụng. Định danh cửa hàng để tự động tải phân hệ làm việc tối ưu.
          </p>
        </div>

        {/* Feature Cards Showcase */}
        <div className="space-y-4 py-8">
          <div className="flex gap-3 p-3.5 bg-white/5 rounded-2xl">
            <div className="p-2 bg-primary/20 rounded-xl text-primary-container h-fit">
              <Coffee className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-200">Giao diện chuyên F&amp;B (Nhà hàng)</h4>
              <p className="text-sm text-slate-400 leading-normal">Quản lý sơ đồ bàn trực quan kéo thả, thanh toán tại bàn, và màn hình bếp KDS chuyên biệt.</p>
            </div>
          </div>

          <div className="flex gap-3 p-3.5 bg-white/5 rounded-2xl">
            <div className="p-2 bg-secondary/20 rounded-xl text-secondary-container h-fit">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-200">Giao diện chuyên bán lẻ</h4>
              <p className="text-sm text-slate-400 leading-normal">Quét mã vạch bán lẻ siêu tốc, tìm kiếm nhanh hàng hóa, theo dõi tồn kho theo số lô hạn dùng.</p>
            </div>
          </div>

          <div className="flex gap-3 p-3.5 bg-white/5 rounded-2xl">
            <div className="p-2 bg-tertiary/20 rounded-xl text-tertiary-container h-fit">
              <HardDrive className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-200">Hoạt động local-first ổn định</h4>
              <p className="text-sm text-slate-400 leading-normal">Dữ liệu lưu trực tiếp trên thiết bị (SQLite), bán hàng và thao tác vẫn mượt mà kể cả khi mất mạng hoàn toàn.</p>
            </div>
          </div>
        </div>

        {/* Bottom Credits */}
        <div className="text-sm text-slate-500 flex items-center gap-1.5 pt-4 border-t border-white/5">
          <ShieldCheck className="w-4 h-4 text-primary-container" /> Kiến trúc Multi-Tenant Local-First bảo mật
        </div>
      </div>

      {/* Main Authentication Card (Right) */}
      <div className="lg:col-span-7 bg-surface-container-lowest p-8 lg:p-12 flex flex-col justify-between">

        {/* Auth Forms */}
        <div className="py-6 space-y-6 max-w-md mx-auto w-full">
          <div className="space-y-1.5">
            <h2 className="text-2xl font-bold text-on-surface tracking-tight">
              {authMode === 'demo' && 'Đăng nhập Demo'}
              {authMode === 'login' && 'Đăng nhập'}
              {authMode === 'register' && 'Khởi tạo hệ thống mới'}
            </h2>
            <p className="text-base text-on-surface-variant">
              {authMode === 'demo' && 'Định nghĩa Store ID & Type để chạy thử nghiệm độc lập ngay tức thì.'}
              {authMode === 'login' && 'Nhập tài khoản để quản trị cửa hàng của bạn trên thiết bị này.'}
              {authMode === 'register' && 'Khởi tạo cơ sở dữ liệu riêng, cấu hình mặc định tự động trong 5 giây.'}
            </p>
          </div>

          {/* Mode Toggle Slider (3 options) */}
          <div className="flex bg-surface-container p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setAuthMode('demo')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${
                authMode === 'demo' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Demo Sandbox
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${
                authMode === 'login' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Đăng nhập
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={`flex-1 py-2.5 text-sm font-bold rounded-lg transition-all cursor-pointer ${
                authMode === 'register' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Tạo cửa hàng
            </button>
          </div>

          {/* Server-Returned Errors */}
          {authError && (
            <div className="p-3 bg-error-container text-on-error-container text-sm font-semibold rounded-xl">
              {authError}
            </div>
          )}

          {/* Submit Form */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* 1. DEMO SANDBOX FIELDS */}
            {authMode === 'demo' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                      <UserCheck className="w-4 h-4" /> Tên nhân viên
                    </label>
                    <input
                      type="text"
                      value={demoUser}
                      onChange={(e) => setDemoUser(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      className="m3-input"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                      <Key className="w-4 h-4" /> Mật khẩu demo
                    </label>
                    <input
                      type="password"
                      value={demoPass}
                      onChange={(e) => setDemoPass(e.target.value)}
                      placeholder="******"
                      className="m3-input"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                      <Store className="w-4 h-4" /> Mã cửa hàng (ID)
                    </label>
                    <input
                      type="text"
                      value={demoStoreId}
                      onChange={(e) => setDemoStoreId(e.target.value)}
                      placeholder="CH-VIET-88"
                      className="m3-input font-mono text-primary"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-on-surface-variant">Mô hình hoạt động</label>
                    <select
                      value={demoStoreType}
                      onChange={(e) => setDemoStoreType(e.target.value as any)}
                      className="m3-input"
                    >
                      <option value="fnb">F&amp;B (Nhà hàng / Cafe)</option>
                      <option value="retail">Bán lẻ (Tạp hóa)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Tên cửa hàng demo</label>
                  <input
                    type="text"
                    value={demoStoreName}
                    onChange={(e) => setDemoStoreName(e.target.value)}
                    placeholder="Bếp Việt Cafe & Restaurant"
                    className="m3-input"
                    required
                  />
                </div>
              </div>
            )}

            {/* 2. LOGIN FIELDS */}
            {authMode === 'login' && (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                    <Mail className="w-4 h-4" /> Email quản trị viên
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="quanly@cuahang.com"
                    className="m3-input"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                    <Lock className="w-4 h-4" /> Mật khẩu truy cập
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="m3-input"
                    required
                  />
                </div>
              </div>
            )}

            {/* 3. REGISTER FIELDS */}
            {authMode === 'register' && (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                    <User className="w-4 h-4" /> Họ và tên quản trị viên
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="m3-input"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                    <Store className="w-4 h-4" /> Tên cửa hàng
                  </label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Gourmet Cafe & Bistro"
                    className="m3-input"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant">Mô hình kinh doanh mặc định</label>
                  <select
                    value={storeType}
                    onChange={(e) => setStoreType(e.target.value as any)}
                    className="m3-input"
                  >
                    <option value="fnb">F&amp;B (Nhà hàng, Quán Cafe, Trà sữa)</option>
                    <option value="retail">Bán lẻ (Tạp hóa, Siêu thị mini)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                      <Phone className="w-4 h-4" /> Điện thoại liên hệ
                    </label>
                    <input
                      type="text"
                      value={storePhone}
                      onChange={(e) => setStorePhone(e.target.value)}
                      placeholder="0912345678"
                      className="m3-input"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                      <MapPin className="w-4 h-4" /> Địa chỉ chi nhánh
                    </label>
                    <input
                      type="text"
                      value={storeAddress}
                      onChange={(e) => setStoreAddress(e.target.value)}
                      placeholder="Quận 1, TP. HCM"
                      className="m3-input"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                    <Mail className="w-4 h-4" /> Email đăng nhập
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="quanly@cuahang.com"
                    className="m3-input"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-semibold text-on-surface-variant flex items-center gap-1">
                    <Lock className="w-4 h-4" /> Mật khẩu truy cập
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="m3-input"
                    required
                  />
                </div>
              </div>
            )}

            {/* Submit button with high usability */}
            <button
              type="submit"
              disabled={authLoading}
              className="m3-btn-filled w-full !min-h-14 !text-base mt-4"
            >
              {authLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang thiết lập...
                </span>
              ) : authMode === 'demo' ? (
                <span className="flex items-center gap-2">
                  Vào hệ thống demo <ArrowRight className="w-4 h-4" />
                </span>
              ) : authMode === 'login' ? (
                <span className="flex items-center gap-2">
                  Đăng nhập <LogIn className="w-4 h-4" />
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  Khởi tạo cửa hàng <Sparkles className="w-4 h-4" />
                </span>
              )}
            </button>
          </form>
        </div>

        {/* Footer info text */}
        <div className="pt-6 border-t border-outline-variant flex flex-col sm:flex-row justify-between items-center gap-2 text-sm text-on-surface-variant">
          <span>© 2026 SmartPOS. Đã bảo lưu toàn quyền hệ thống.</span>
          <div className="flex items-center gap-1 hover:text-primary cursor-pointer">
            <HelpCircle className="w-4 h-4" /> Hỗ trợ kỹ thuật 24/7
          </div>
        </div>

      </div>

    </div>
  );
}
