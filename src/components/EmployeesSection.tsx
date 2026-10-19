/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Briefcase, ChevronLeft, ChevronRight, Edit2, KeyRound, Search, X } from 'lucide-react';
import { UserProfile, Attendance, UserRole } from '../types';
import { logOperation } from '../utils/logger';
import { ROLE_LABELS, normalizeRole } from '../utils/permissions';

interface EmployeesSectionProps {
  isOffline: boolean;
  storeId: string;
  triggerBeep: (success: boolean) => void;
  simEmployees: UserProfile[];
  setSimEmployees: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  storeType?: 'fnb' | 'retail';
  /** Đặt lại mật khẩu cho một tài khoản trong cửa hàng (chủ / quản lý). */
  onResetPassword?: (uid: string, newPassword: string) => Promise<void>;
  currentRole?: string | null;
  currentUid?: string;
  /** Tạo tài khoản nhân viên mới (tên tài khoản + email + mật khẩu) trong cửa hàng hiện tại. */
  onCreateEmployee?: (params: { username: string; email: string; password: string; name: string; role: UserRole; hourlyRate: number }) => Promise<void>;
  simAttendance: Attendance[];
  setSimAttendance: React.Dispatch<React.SetStateAction<Attendance[]>>;
}

const roleLabel = (role: UserRole | string) => {
  const r = normalizeRole(role);
  return r ? ROLE_LABELS[r] : 'Nhân viên';
};

const roleBadgeClass = (role: UserRole | string) => (
  role === 'owner' ? 'm3-badge-warning'
    : role === 'manager' ? 'm3-badge-success'
      : role === 'kitchen' ? 'bg-tertiary-container text-on-tertiary-container'
        : 'bg-primary-container text-on-primary-container'
);

export default function EmployeesSection({
  triggerBeep,
  simEmployees,
  setSimEmployees,
  simAttendance,
  storeType = 'fnb',
  onCreateEmployee,
  onResetPassword,
  currentRole,
  currentUid
}: EmployeesSectionProps) {
  const employees = simEmployees;
  const attendanceLogs = simAttendance;

  const [activeTab, setActiveTab] = useState<'list' | 'schedule'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state
  const [editingEmployee, setEditingEmployee] = useState<UserProfile | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState<UserRole>(UserRole.STAFF);
  const [formHourlyRate, setFormHourlyRate] = useState<number>(25000);

  // Đặt lại mật khẩu (chủ: mọi tài khoản; quản lý: trừ chủ cửa hàng)
  const [pwTarget, setPwTarget] = useState<UserProfile | null>(null);
  const [pwValue, setPwValue] = useState('');
  const [pwError, setPwError] = useState('');
  const canResetPassword = (emp: UserProfile) =>
    !!onResetPassword && (currentRole === 'owner' || (currentRole === 'manager' && emp.role !== 'owner') || emp.uid === currentUid);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pwTarget || !onResetPassword) return;
    try {
      logOperation('Quản lý nhân viên', 'Đặt lại mật khẩu', { uid: pwTarget.uid });
      await onResetPassword(pwTarget.uid, pwValue);
      setPwTarget(null);
      setPwValue('');
      triggerBeep(true);
      alert('Đã đặt lại mật khẩu. Hãy báo mật khẩu mới cho nhân viên.');
    } catch (err: any) {
      setPwError(err?.message || 'Không đặt lại được mật khẩu.');
      triggerBeep(false);
    }
  };

  // Tạo nhân viên mới
  const [createOpen, setCreateOpen] = useState(false);
  const [createError, setCreateError] = useState('');
  const [newName, setNewName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(UserRole.STAFF);
  const [newHourlyRate, setNewHourlyRate] = useState<number>(25000);

  const openCreate = () => {
    setNewName(''); setNewUsername(''); setNewEmail(''); setNewPassword(''); setNewRole(UserRole.STAFF); setNewHourlyRate(25000);
    setCreateError('');
    setCreateOpen(true);
    triggerBeep(true);
  };

  const handleCreateEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateEmployee) return;
    if (newPassword.length < 6) {
      setCreateError('Mật khẩu cần tối thiểu 6 ký tự.');
      return;
    }
    try {
      logOperation('Quản lý nhân viên', 'Thêm nhân viên', { name: newName, username: newUsername, email: newEmail, role: newRole });
      await onCreateEmployee({ username: newUsername, email: newEmail, password: newPassword, name: newName, role: newRole, hourlyRate: Number(newHourlyRate) || 0 });
      setCreateOpen(false);
      triggerBeep(true);
    } catch (err: any) {
      setCreateError(err?.message || 'Không tạo được tài khoản.');
      triggerBeep(false);
    }
  };

  // Weekly calendar selection (starting from Monday of current week)
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is Sunday
    const monday = new Date(today.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  // Handle Edit Employee Hourly Rate or role
  const handleOpenEdit = (emp: UserProfile) => {
    setEditingEmployee(emp);
    setFormName(emp.name);
    setFormRole(emp.role);
    setFormHourlyRate(emp.hourlyRate || 25000);
    setModalOpen(true);
    triggerBeep(true);
  };

  // Save Employee Changes
  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmployee) return;

    try {
      const updatedProfile: UserProfile = {
        ...editingEmployee,
        role: formRole,
        hourlyRate: Number(formHourlyRate) || 0
      };

      logOperation('Quản lý nhân viên', 'Sửa thông tin nhân viên', updatedProfile);
      setSimEmployees(prev => prev.map(emp => emp.uid === editingEmployee.uid ? updatedProfile : emp));
      setModalOpen(false);
      triggerBeep(true);
    } catch (err) {
      console.error(err);
      alert("Lỗi lưu trữ thông tin nhân viên!");
      triggerBeep(false);
    }
  };

  // Generate 7 days for the current week starting on currentWeekStart
  const weekDays = Array.from({ length: 7 }).map((_, idx) => {
    const day = new Date(currentWeekStart);
    day.setDate(currentWeekStart.getDate() + idx);
    const dateStr = day.toLocaleDateString('sv-SE'); // YYYY-MM-DD
    const dayLabel = idx === 6 ? 'CN' : `T${idx + 2}`;
    return { dateStr, dayLabel, rawDate: day };
  });

  // Filter employees
  const filteredEmployees = employees.filter(emp => {
    const q = searchQuery.toLowerCase().trim();
    return emp.name.toLowerCase().includes(q) || (emp.username || '').toLowerCase().includes(q) || emp.email.toLowerCase().includes(q);
  });

  const changeWeek = (direction: 'prev' | 'next') => {
    const nextStart = new Date(currentWeekStart);
    nextStart.setDate(currentWeekStart.getDate() + (direction === 'prev' ? -7 : 7));
    setCurrentWeekStart(nextStart);
    triggerBeep(true);
  };

  return (
    <div className="space-y-4">

      <div className="flex items-center gap-2">
        <Briefcase className="w-5 h-5 text-primary" />
        <h2 className="text-lg font-bold text-on-surface flex-1">Nhân viên</h2>
        {onCreateEmployee && (
          <button onClick={openCreate} className="m3-btn-filled !min-h-11">
             Thêm nhân viên
          </button>
        )}
      </div>

      <div className="flex bg-surface-container-high p-1 rounded-2xl border border-outline-variant gap-1">
        <button
          onClick={() => { setActiveTab('list'); triggerBeep(true); }}
          className={`flex-1 flex items-center justify-center gap-1.5 min-h-10 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
            activeTab === 'list' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
           Danh sách
        </button>
        <button
          onClick={() => { setActiveTab('schedule'); triggerBeep(true); }}
          className={`flex-1 flex items-center justify-center gap-1.5 min-h-10 rounded-xl text-sm font-bold transition-colors cursor-pointer ${
            activeTab === 'schedule' ? 'bg-surface-container-lowest text-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
           Chấm công tuần
        </button>
      </div>

      {activeTab === 'list' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm nhân viên theo tên, tài khoản hoặc email..."
              className="m3-input !rounded-full pl-10"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredEmployees.map((emp) => (
              <div key={emp.uid} className="m3-card p-4 flex items-center gap-3">
                <div className="w-11 h-11 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-bold text-sm uppercase shrink-0">
                  {emp.name.slice(0, 2)}
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <h4 className="text-base font-bold text-on-surface truncate">{emp.name}</h4>
                  <p className="text-sm text-on-surface-variant truncate">@{emp.username || emp.email}</p>
                  <div className="flex items-center gap-2">
                    <span className={`m3-badge ${roleBadgeClass(emp.role)}`}>{roleLabel(emp.role)}</span>
                    <span className="text-sm font-bold text-on-surface font-mono">{(emp.hourlyRate || 25000).toLocaleString('vi-VN')} đ/h</span>
                  </div>
                </div>
                {canResetPassword(emp) && (
                  <button onClick={() => { setPwTarget(emp); setPwValue(''); setPwError(''); triggerBeep(true); }} className="m3-icon-btn shrink-0" title="Đặt lại mật khẩu" aria-label="Đặt lại mật khẩu">
                    <KeyRound className="w-4 h-4" />
                  </button>
                )}
                <button onClick={() => handleOpenEdit(emp)} className="m3-icon-btn shrink-0" title="Thiết lập lương & vai trò">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="space-y-3">

          {/* Week controller */}
          <div className="m3-card p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="text-center sm:text-left">
              <span className="text-sm font-semibold text-on-surface-variant block">Thời gian chấm công</span>
              <h3 className="text-base font-bold text-on-surface">
                {weekDays[0].rawDate.toLocaleDateString('vi-VN')} – {weekDays[6].rawDate.toLocaleDateString('vi-VN')}
              </h3>
            </div>

            <div className="flex items-center gap-1.5">
              <button onClick={() => changeWeek('prev')} className="m3-icon-btn">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => { setCurrentWeekStart(new Date()); triggerBeep(true); }}
                className="m3-chip !rounded-full"
              >
                Tuần này
              </button>
              <button onClick={() => changeWeek('next')} className="m3-icon-btn">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Schedule board grid */}
          <div className="m3-card p-4 overflow-x-auto">
            <div className="min-w-[1000px] space-y-3">

              {/* Grid headers */}
              <div className="grid grid-cols-8 gap-2 bg-surface-container border border-outline-variant rounded-2xl p-2.5 font-bold text-on-surface-variant text-center">
                <div className="text-left pl-3 self-center text-sm">Nhân viên</div>
                {weekDays.map(day => {
                  const isToday = day.dateStr === new Date().toLocaleDateString('sv-SE');
                  return (
                    <div key={day.dateStr} className={`p-1.5 rounded-xl ${isToday ? 'bg-primary text-on-primary shadow-sm' : ''}`}>
                      <p className="text-sm font-bold">{day.dayLabel}</p>
                      <p className="text-sm font-mono opacity-80">{day.dateStr.slice(5)}</p>
                    </div>
                  );
                })}
              </div>

              {/* Grid content rows */}
              <div className="space-y-2.5">
                {employees.map(emp => (
                  <div key={emp.uid} className="grid grid-cols-8 gap-2 border border-outline-variant rounded-2xl p-2.5 items-center">
                    <div className="text-left pl-2">
                      <p className="text-sm font-bold text-on-surface">{emp.name}</p>
                      <p className="text-sm text-on-surface-variant">{roleLabel(emp.role)}</p>
                      <p className="text-sm text-secondary font-bold font-mono">{(emp.hourlyRate || 25000).toLocaleString('vi-VN')}đ/h</p>
                    </div>

                    {weekDays.map(day => {
                      const dayLog = attendanceLogs.find(l => l.userId === emp.uid && l.date === day.dateStr);

                      return (
                        <div key={day.dateStr} className={`p-2.5 rounded-xl border text-center min-h-[86px] flex flex-col justify-center gap-1 ${
                          dayLog?.status === 'working'
                            ? 'bg-tertiary-container border-tertiary-container text-on-tertiary-container'
                            : dayLog?.status === 'completed'
                              ? 'bg-secondary-container/60 border-secondary-container text-on-surface'
                              : 'bg-surface-container/30 border-dashed border-outline-variant text-outline'
                        }`}>
                          {dayLog ? (
                            <>
                              <div className="text-sm font-bold font-mono">
                                {new Date(dayLog.checkIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                {dayLog.checkOut ? ` - ${new Date(dayLog.checkOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ' - ...'}
                              </div>
                              <div className="text-sm font-bold">
                                {dayLog.status === 'working' ? 'Đang trực' : `+${dayLog.dailyWage.toLocaleString('vi-VN')}đ`}
                              </div>
                            </>
                          ) : (
                            <span className="text-sm font-semibold text-outline">Vắng mặt</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Attendance legend */}
              <div className="pt-3 border-t border-outline-variant flex flex-wrap items-center gap-4 text-sm text-on-surface-variant font-semibold pl-2">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-secondary-container block" /> Đã chấm công xong
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-tertiary-container block" /> Đang trong ca
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-surface-container-high block" /> Vắng mặt
                </span>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* Modal to configure Employee wage / hourlyRate */}
      {modalOpen && editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="m3-card !bg-surface-container-lowest max-w-sm w-full p-6 shadow-xl space-y-4">

            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-bold text-on-surface flex items-center gap-1.5">
                 Thiết lập lương & vai trò
              </h3>
              <button onClick={() => setModalOpen(false)} className="m3-icon-btn">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-3">
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Tên nhân viên</label>
                <input type="text" value={formName} disabled className="m3-input !bg-surface-container opacity-70 cursor-not-allowed" />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Chức danh / Vai trò</label>
                <select value={formRole} onChange={(e) => setFormRole(e.target.value as any)} className="m3-input">
                  <option value={UserRole.STAFF}>{ROLE_LABELS.staff}</option>
                  {storeType === 'fnb' && <option value={UserRole.KITCHEN}>{ROLE_LABELS.kitchen}</option>}
                  <option value={UserRole.MANAGER}>{ROLE_LABELS.manager}</option>
                  <option value={UserRole.OWNER}>{ROLE_LABELS.owner}</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Mức lương mỗi giờ (đ/giờ)</label>
                <input
                  type="number"
                  value={formHourlyRate}
                  onChange={(e) => setFormHourlyRate(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="25000"
                  className="m3-input font-mono"
                  required
                />
                <span className="text-sm text-on-surface-variant block mt-1">
                  Hệ thống sẽ tự động tính: Lương ngày = Tổng giờ công × Mức lương giờ.
                </span>
              </div>

              <div className="pt-3 border-t border-outline-variant flex justify-end gap-2">
                <button type="button" onClick={() => setModalOpen(false)} className="m3-btn-tonal !min-h-10 text-sm">
                  Hủy bỏ
                </button>
                <button type="submit" className="m3-btn-filled !min-h-10 text-sm">
                  Cập nhật cấu hình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal đặt lại mật khẩu */}
      {pwTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onClick={() => setPwTarget(null)}>
          <div className="bg-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-bold text-on-surface flex items-center gap-1.5">
                 Đặt lại mật khẩu - {pwTarget.name}
              </h3>
              <button onClick={() => setPwTarget(null)} className="m3-icon-btn"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleResetPassword} className="space-y-3">
              {pwError && <div className="p-3 bg-error-container text-on-error-container text-sm font-semibold rounded-xl">{pwError}</div>}
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Mật khẩu mới (tối thiểu 6 ký tự)</label>
                <input type="password" value={pwValue} onChange={(e) => setPwValue(e.target.value)} className="m3-input" autoFocus required />
              </div>
              <div className="pt-3 border-t border-outline-variant flex justify-end gap-2">
                <button type="button" onClick={() => setPwTarget(null)} className="m3-btn-tonal !min-h-11">Hủy</button>
                <button type="submit" className="m3-btn-filled !min-h-11">Đặt mật khẩu</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal tạo nhân viên mới */}
      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/50" onClick={() => setCreateOpen(false)}>
          <div className="bg-surface w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl p-6 space-y-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-base font-bold text-on-surface flex items-center gap-1.5">
                 Thêm nhân viên
              </h3>
              <button onClick={() => setCreateOpen(false)} className="m3-icon-btn"><X className="w-5 h-5" /></button>
            </div>

            <form onSubmit={handleCreateEmployee} className="space-y-3">
              {createError && <div className="p-3 bg-error-container text-on-error-container text-sm font-semibold rounded-xl">{createError}</div>}

              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Họ và tên</label>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} className="m3-input" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Tên tài khoản (dùng để đăng nhập)</label>
                <input value={newUsername} onChange={(e) => setNewUsername(e.target.value)} placeholder="vd: thungan01" autoCapitalize="none" autoCorrect="off" className="m3-input" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Email (nhận thư khôi phục mật khẩu)</label>
                <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="nhanvien@gmail.com" className="m3-input" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Mật khẩu (tối thiểu 6 ký tự)</label>
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="m3-input" required />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Vai trò</label>
                <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)} className="m3-input">
                  <option value={UserRole.STAFF}>{ROLE_LABELS.staff}</option>
                  {storeType === 'fnb' && <option value={UserRole.KITCHEN}>{ROLE_LABELS.kitchen}</option>}
                  <option value={UserRole.MANAGER}>{ROLE_LABELS.manager}</option>
                  <option value={UserRole.OWNER}>{ROLE_LABELS.owner}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-on-surface-variant">Mức lương mỗi giờ (đ/giờ)</label>
                <input type="number" value={newHourlyRate} onChange={(e) => setNewHourlyRate(Math.max(0, parseInt(e.target.value) || 0))} className="m3-input font-mono" required />
              </div>

              <div className="pt-3 border-t border-outline-variant flex justify-end gap-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="m3-btn-tonal !min-h-11">Hủy</button>
                <button type="submit" className="m3-btn-filled !min-h-11">Tạo tài khoản</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
