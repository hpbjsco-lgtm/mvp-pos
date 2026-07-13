/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Cloud, Lock, Mail, Store, User, Phone, MapPin, Coffee, ShoppingBag, 
  ArrowRight, ShieldCheck, HelpCircle, Activity, LogIn, ChevronRight, Sparkles, UserCheck, Key
} from 'lucide-react';
import { motion } from 'motion/react';

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
  onOpenDemoExplanation: () => void;
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
  onOpenDemoExplanation,
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
    <div id="login-screen-container" className="grid grid-cols-1 lg:grid-cols-12 min-h-[640px] bg-slate-900 rounded-3xl overflow-hidden shadow-2xl border border-slate-800">
      
      {/* Decorative branding sidebar (Left) */}
      <div className="lg:col-span-5 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-8 lg:p-12 flex flex-col justify-between text-white relative">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent opacity-70 pointer-events-none"></div>
        
        {/* Header Logo */}
        <div className="space-y-2 relative z-10">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-600 rounded-2xl shadow-lg shadow-blue-500/25 border border-blue-400/20">
              <Cloud className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] tracking-widest text-blue-400 font-extrabold uppercase block font-mono">MULTI-TENANT</span>
              <h1 className="text-xl font-black tracking-tight text-white">SmartPOS Cloud</h1>
            </div>
          </div>
          <p className="text-xs text-slate-400 font-medium max-w-sm">
            Hệ thống quản lý điểm bán hàng chuyên dụng. Định danh cửa hàng để tự động tải phân hệ làm việc tối ưu.
          </p>
        </div>

        {/* Feature Cards Showcase */}
        <div className="space-y-4 py-8 relative z-10">
          <div className="flex gap-3 p-3.5 bg-white/5 border border-white/10 rounded-2xl">
            <div className="p-2 bg-indigo-500/15 rounded-xl text-indigo-400 h-fit">
              <Coffee className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">Giao diện chuyên FnB (Nhà hàng)</h4>
              <p className="text-[11px] text-slate-400 leading-normal">Quản lý sơ đồ bàn trực quan kéo thả, thanh toán tại bàn, và màn hình bếp KDS chuyên biệt.</p>
            </div>
          </div>

          <div className="flex gap-3 p-3.5 bg-white/5 border border-white/10 rounded-2xl">
            <div className="p-2 bg-emerald-500/15 rounded-xl text-emerald-400 h-fit">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">Giao diện chuyên Retail (Bán lẻ)</h4>
              <p className="text-[11px] text-slate-400 leading-normal">Quét mã vạch bán lẻ siêu tốc, tìm kiếm nhanh hàng hóa, theo dõi tồn kho theo số lô hạn dùng.</p>
            </div>
          </div>

          <div className="flex gap-3 p-3.5 bg-white/5 border border-white/10 rounded-2xl">
            <div className="p-2 bg-blue-500/15 rounded-xl text-blue-400 h-fit">
              <Activity className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">Phục vụ Đám mây thời gian thực</h4>
              <p className="text-[11px] text-slate-400 leading-normal">Đồng bộ tức thì mọi giao dịch lên cloud, hoạt động ổn định kể cả khi mất mạng đột ngột.</p>
            </div>
          </div>
        </div>

        {/* Bottom Credits */}
        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1.5 pt-4 border-t border-white/5 relative z-10">
          <ShieldCheck className="w-3.5 h-3.5 text-blue-500" /> Secure Multi-Tenant Cloud Architecture
        </div>
      </div>

      {/* Main Authentication Card (Right) */}
      <div className="lg:col-span-7 bg-white p-8 lg:p-12 flex flex-col justify-between">
        
        {/* Top bar info */}
        <div className="flex justify-between items-center pb-6 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
            <span className="text-xs font-extrabold text-slate-500 font-mono">XÁC THỰC CỬA HÀNG</span>
          </div>
        </div>

        {/* Auth Forms */}
        <div className="py-6 space-y-6 max-w-md mx-auto w-full">
          <div className="space-y-1.5">
            <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase">
              {authMode === 'demo' && 'Đăng nhập Demo'}
              {authMode === 'login' && 'Đăng nhập Đám mây'}
              {authMode === 'register' && 'Khởi tạo hệ thống mới'}
            </h2>
            <p className="text-xs text-slate-500">
              {authMode === 'demo' && 'Định nghĩa Store ID & Type để chạy thử nghiệm độc lập ngay tức thì.'}
              {authMode === 'login' && 'Nhập tài khoản để quản trị cửa hàng đám mây của bạn.'}
              {authMode === 'register' && 'Khởi tạo cơ sở dữ liệu riêng, cấu hình mặc định tự động trong 5 giây.'}
            </p>
          </div>

          {/* Mode Toggle Slider (3 options) */}
          <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 gap-1">
            <button
              type="button"
              onClick={() => setAuthMode('demo')}
              className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all ${
                authMode === 'demo' ? 'bg-slate-900 text-white shadow-sm font-extrabold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Demo Sandbox
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('login')}
              className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all ${
                authMode === 'login' ? 'bg-slate-900 text-white shadow-sm font-extrabold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Cloud Login
            </button>
            <button
              type="button"
              onClick={() => setAuthMode('register')}
              className={`flex-1 py-2 text-[10px] font-bold rounded-lg transition-all ${
                authMode === 'register' ? 'bg-slate-900 text-white shadow-sm font-extrabold' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Tạo Cửa Hàng
            </button>
          </div>

          {/* Server-Returned Errors */}
          {authError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-600 text-xs font-semibold rounded-xl">
              ⚠️ {authError}
            </div>
          )}

          {/* Submit Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            
            {/* 1. DEMO SANDBOX FIELDS */}
            {authMode === 'demo' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <UserCheck className="w-3.5 h-3.5 text-blue-500" /> Tên nhân viên
                    </label>
                    <input
                      type="text"
                      value={demoUser}
                      onChange={(e) => setDemoUser(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500 transition-colors font-semibold"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <Key className="w-3.5 h-3.5 text-blue-500" /> Mật khẩu Demo
                    </label>
                    <input
                      type="password"
                      value={demoPass}
                      onChange={(e) => setDemoPass(e.target.value)}
                      placeholder="******"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500 transition-colors font-semibold"
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <Store className="w-3.5 h-3.5 text-blue-500" /> Mã Cửa hàng (ID)
                    </label>
                    <input
                      type="text"
                      value={demoStoreId}
                      onChange={(e) => setDemoStoreId(e.target.value)}
                      placeholder="CH-VIET-88"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500 transition-colors font-mono font-bold text-blue-600"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      🏷️ Mô hình hoạt động
                    </label>
                    <select
                      value={demoStoreType}
                      onChange={(e) => setDemoStoreType(e.target.value as any)}
                      className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-xs focus:ring-1 focus:ring-blue-500 transition-colors font-bold text-slate-700"
                    >
                      <option value="fnb">🍔 F&B (Nhà hàng / Cafe)</option>
                      <option value="retail">🛍️ Retail (Tạp hóa / Bán lẻ)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    ✨ Tên Cửa Hàng Demo
                  </label>
                  <input
                    type="text"
                    value={demoStoreName}
                    onChange={(e) => setDemoStoreName(e.target.value)}
                    placeholder="Bếp Việt Cafe & Restaurant"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500 transition-colors font-semibold"
                    required
                  />
                </div>
              </div>
            )}

            {/* 2. CLOUD LOGIN FIELDS */}
            {authMode === 'login' && (
              <div className="space-y-3 animate-fadeIn">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" /> Email quản trị viên
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="quanly@cuahang.com"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" /> Mật khẩu truy cập
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
              </div>
            )}

            {/* 3. CLOUD REGISTER FIELDS */}
            {authMode === 'register' && (
              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <User className="w-3.5 h-3.5" /> Họ và tên quản trị viên
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nguyễn Văn A"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Store className="w-3.5 h-3.5" /> Tên cửa hàng đám mây
                  </label>
                  <input
                    type="text"
                    value={storeName}
                    onChange={(e) => setStoreName(e.target.value)}
                    placeholder="Gourmet Cafe & Bistro"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    📦 Mô hình kinh doanh mặc định
                  </label>
                  <select
                    value={storeType}
                    onChange={(e) => setStoreType(e.target.value as any)}
                    className="w-full px-3.5 py-2 border border-slate-200 bg-white rounded-xl text-xs font-medium text-slate-700"
                  >
                    <option value="fnb">🍔 FnB (Nhà hàng, Quán Cafe, Trà sữa)</option>
                    <option value="retail">🛍️ Retail (Tạp hóa, Siêu thị mini, Bán lẻ)</option>
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> Điện thoại liên hệ
                    </label>
                    <input
                      type="text"
                      value={storePhone}
                      onChange={(e) => setStorePhone(e.target.value)}
                      placeholder="0912345678"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" /> Địa chỉ chi nhánh
                    </label>
                    <input
                      type="text"
                      value={storeAddress}
                      onChange={(e) => setStoreAddress(e.target.value)}
                      placeholder="Quận 1, TP. HCM"
                      className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs"
                      required
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" /> Email đăng nhập
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="quanly@cuahang.com"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs"
                    required
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wide flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5" /> Mật khẩu truy cập
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 border border-slate-200 rounded-xl text-xs"
                    required
                  />
                </div>
              </div>
            )}

            {/* Submit button with high usability */}
            <button
              type="submit"
              disabled={authLoading}
              className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-blue-700 text-white font-extrabold text-sm py-3.5 px-6 rounded-2xl transition-all shadow-md active:scale-[0.98] cursor-pointer min-h-[50px] disabled:bg-slate-300 disabled:cursor-not-allowed mt-4"
            >
              {authLoading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Đang thiết lập...
                </span>
              ) : authMode === 'demo' ? (
                <span className="flex items-center gap-2">
                  VÀO HỆ THỐNG DEMO <ArrowRight className="w-4 h-4" />
                </span>
              ) : authMode === 'login' ? (
                <span className="flex items-center gap-2">
                  ĐĂNG NHẬP CLOUD <LogIn className="w-4 h-4" />
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  KHỞI TẠO CỬA HÀNG <Sparkles className="w-4 h-4 text-amber-300" />
                </span>
              )}
            </button>

            {/* Temporary Review Project button linked to demo.tsx */}
            <button
              type="button"
              onClick={onOpenDemoExplanation}
              className="w-full flex items-center justify-center gap-2 bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-xs py-3 px-6 rounded-2xl border border-blue-200 transition-all shadow-sm active:scale-[0.98] cursor-pointer min-h-[44px] mt-2.5"
            >
              <Sparkles className="w-4 h-4 text-amber-500 animate-bounce" />
              XEM GIẢI THÍCH DỰ ÁN (REVIEW PROJECT - DEMO)
            </button>
          </form>
        </div>

        {/* Footer info text */}
        <div className="pt-6 border-t border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-2 text-[10px] text-slate-400">
          <span>© 2026 SmartPOS Inc. Đã bảo lưu toàn quyền hệ thống.</span>
          <div className="flex items-center gap-1 hover:text-blue-600 cursor-pointer">
            <HelpCircle className="w-3.5 h-3.5" /> Hỗ trợ kỹ thuật 24/7
          </div>
        </div>

      </div>

    </div>
  );
}
