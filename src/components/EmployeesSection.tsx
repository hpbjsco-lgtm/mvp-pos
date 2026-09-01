/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Users, Search, Plus, Edit2, Briefcase, DollarSign, Calendar, Clock,
  CheckCircle2, X, Play, LogOut, ChevronLeft, ChevronRight, Award, Grid, List
} from 'lucide-react';
import { UserProfile, Attendance, UserRole } from '../types';
import { logOperation } from '../utils/logger';

interface EmployeesSectionProps {
  isOffline: boolean;
  storeId: string;
  triggerBeep: (success: boolean) => void;
  simEmployees: UserProfile[];
  setSimEmployees: React.Dispatch<React.SetStateAction<UserProfile[]>>;
  simAttendance: Attendance[];
  setSimAttendance: React.Dispatch<React.SetStateAction<Attendance[]>>;
}

export default function EmployeesSection({
  isOffline,
  storeId,
  triggerBeep,
  simEmployees,
  setSimEmployees,
  simAttendance,
  setSimAttendance
}: EmployeesSectionProps) {
  const employees = simEmployees;
  const attendanceLogs = simAttendance;

  const [activeTab, setActiveTab] = useState<'list' | 'schedule'>('list');
  const [searchQuery, setSearchQuery] = useState('');

  // Editing state
  const [editingEmployee, setEditingEmployee] = useState<UserProfile | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formRole, setFormRole] = useState<UserRole>(UserRole.STAFF);
  const [formHourlyRate, setFormHourlyRate] = useState<number>(25000);

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
    setFormEmail(emp.email);
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
        name: formName.trim(),
        email: formEmail.trim(),
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
    return emp.name.toLowerCase().includes(q) || emp.email.toLowerCase().includes(q);
  });

  const changeWeek = (direction: 'prev' | 'next') => {
    const nextStart = new Date(currentWeekStart);
    nextStart.setDate(currentWeekStart.getDate() + (direction === 'prev' ? -7 : 7));
    setCurrentWeekStart(nextStart);
    triggerBeep(true);
  };

  return (
    <div className="space-y-6">
      
      {/* Header section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-surface-container-lowest border border-outline-variant rounded-3xl p-6 shadow-sm gap-4">
        <div>
          <h2 className="text-xl font-black text-on-surface tracking-tight uppercase flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-secondary" />
            Hệ thống Quản lý Nhân sự & Chấm công
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            Thiết lập bảng lương, cấu hình mức lương theo giờ, và hiển thị bảng chấm công tuần (Schedule Board).
          </p>
        </div>

        {/* View tab switches */}
        <div className="flex bg-surface-container-high p-1 rounded-xl border border-outline-variant text-xs font-bold">
          <button
            onClick={() => { setActiveTab('list'); triggerBeep(true); }}
            className={`px-4.5 py-2 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'list' ? 'bg-slate-900 text-white shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <List className="w-4 h-4" /> Danh sách nhân viên
          </button>
          <button
            onClick={() => { setActiveTab('schedule'); triggerBeep(true); }}
            className={`px-4.5 py-2 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'schedule' ? 'bg-slate-900 text-white shadow-sm' : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <Calendar className="w-4 h-4" /> Bảng chấm công tuần
          </button>
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center relative">
            <Search className="w-4 h-4 text-on-surface-variant absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm nhân viên theo Tên, Email hoặc Vai trò..."
              className="w-full pl-10 pr-4 py-3 border border-outline-variant rounded-xl text-xs focus:ring-1 focus:ring-primary font-semibold"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-outline-variant">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-surface-container text-on-surface-variant font-bold uppercase border-b border-outline-variant">
                  <th className="p-4">Họ và tên</th>
                  <th className="p-4">Email đăng nhập</th>
                  <th className="p-4">Vai trò chức vụ</th>
                  <th className="p-4 text-right">Lương theo giờ (đ/giờ)</th>
                  <th className="p-4 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-on-surface">
                {filteredEmployees.map((emp) => {
                  return (
                    <tr key={emp.uid} className="hover:bg-surface-container/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center font-bold text-xs uppercase border border-outline-variant">
                            {emp.name.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-extrabold text-on-surface">{emp.name}</p>
                            <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">UID: {emp.uid.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-on-surface-variant">{emp.email}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          emp.role === 'owner'
                            ? 'bg-tertiary-container text-on-tertiary-container border border-tertiary-container/50'
                            : emp.role === 'manager'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200/50'
                              : emp.role === 'sysadmin'
                                ? 'bg-error-container text-on-error-container border border-error-container/50'
                                : 'bg-primary-container text-primary border border-primary-container/50'
                        }`}>
                          {emp.role === 'owner'
                            ? 'Chủ cửa hàng'
                            : emp.role === 'manager'
                              ? 'Quản lý cửa hàng'
                              : emp.role === 'sysadmin'
                                ? 'System Admin'
                                : 'Nhân viên'}
                        </span>
                      </td>
                      <td className="p-4 text-right font-bold text-on-surface font-mono">
                        {(emp.hourlyRate || 25000).toLocaleString('vi-VN')} đ/h
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          className="px-3 py-1.5 bg-surface-container hover:bg-surface-container-high text-on-surface-variant border border-outline-variant rounded-lg font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3 text-on-surface-variant" /> Thiết lập lương
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="space-y-4">
          
          {/* Week controller */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-[10px] font-black text-on-surface-variant uppercase tracking-widest">Thời gian chấm công</span>
              <h3 className="text-sm font-extrabold text-on-surface">
                Tuần: {weekDays[0].rawDate.toLocaleDateString('vi-VN')} – {weekDays[6].rawDate.toLocaleDateString('vi-VN')}
              </h3>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => changeWeek('prev')}
                className="p-2 border border-outline-variant hover:bg-surface-container-high rounded-xl transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-on-surface-variant" />
              </button>
              <button
                onClick={() => { setCurrentWeekStart(new Date()); triggerBeep(true); }}
                className="px-3.5 py-1.5 border border-outline-variant hover:bg-surface-container-high rounded-xl text-xs font-bold text-on-surface-variant transition-colors cursor-pointer"
              >
                Tuần này
              </button>
              <button
                onClick={() => changeWeek('next')}
                className="p-2 border border-outline-variant hover:bg-surface-container-high rounded-xl transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 text-on-surface-variant" />
              </button>
            </div>
          </div>

          {/* Schedule board grid */}
          <div className="bg-surface-container-lowest border border-outline-variant rounded-3xl p-5 shadow-sm overflow-x-auto">
            <div className="min-w-[1000px] space-y-4">
              
              {/* Grid headers */}
              <div className="grid grid-cols-8 gap-2 bg-surface-container border border-outline-variant rounded-2xl p-2.5 font-extrabold text-on-surface-variant uppercase tracking-wide text-center">
                <div className="text-left pl-3 self-center">Nhân viên</div>
                {weekDays.map(day => {
                  const isToday = day.dateStr === new Date().toLocaleDateString('sv-SE');
                  return (
                    <div key={day.dateStr} className={`p-1.5 rounded-xl ${isToday ? 'bg-primary text-white font-black shadow-sm' : ''}`}>
                      <p className="text-[10px]">{day.dayLabel}</p>
                      <p className="text-[9px] font-mono opacity-80 mt-0.5">{day.dateStr.slice(5)}</p>
                    </div>
                  );
                })}
              </div>

              {/* Grid content rows */}
              <div className="space-y-3">
                {employees.map(emp => {
                  let totalHours = 0;
                  let totalEarnings = 0;

                  return (
                    <div key={emp.uid} className="grid grid-cols-8 gap-2 border border-outline-variant rounded-2xl p-2.5 items-center hover:bg-surface-container/20 transition-all">
                      {/* Name / Wage summary left card */}
                      <div className="text-left pl-2">
                        <p className="font-extrabold text-on-surface">{emp.name}</p>
                        <p className="text-[10px] text-on-surface-variant font-mono mt-0.5">
                          {emp.role === 'owner'
                            ? 'Chủ cửa hàng'
                            : emp.role === 'manager'
                              ? 'Quản lý'
                              : emp.role === 'sysadmin'
                                ? 'System Admin'
                                : 'Nhân viên'}
                        </p>
                        <p className="text-[10px] text-secondary font-extrabold font-mono mt-1">
                          Rate: {(emp.hourlyRate || 25000).toLocaleString('vi-VN')}đ/h
                        </p>
                      </div>

                      {/* Daily slots */}
                      {weekDays.map(day => {
                        const dayLog = attendanceLogs.find(l => l.userId === emp.uid && l.date === day.dateStr);
                        
                        if (dayLog) {
                          totalHours += dayLog.hoursWorked;
                          totalEarnings += dayLog.dailyWage;
                        }

                        return (
                          <div key={day.dateStr} className={`p-2.5 rounded-xl border text-center transition-all min-h-[90px] flex flex-col justify-center gap-1 ${
                            dayLog?.status === 'working'
                              ? 'bg-tertiary-container border-tertiary-container text-on-tertiary-container animate-pulse'
                              : dayLog?.status === 'completed'
                                ? 'bg-secondary-container/60 border-secondary-container text-on-surface'
                                : 'bg-surface-container/30 border-transparent text-outline border-dashed border-outline-variant'
                          }`}>
                            {dayLog ? (
                              <>
                                <div className="text-[10px] font-bold font-mono">
                                  {new Date(dayLog.checkIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                  {dayLog.checkOut ? ` - ${new Date(dayLog.checkOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ' - ...'}
                                </div>
                                <div className="text-[9px] font-extrabold px-1 py-0.5 rounded uppercase font-sans mt-0.5 w-fit mx-auto bg-surface-container-lowest border shadow-sm">
                                  {dayLog.status === 'working' ? 'ON Shift' : `${dayLog.hoursWorked.toFixed(1)}h`}
                                </div>
                                <div className="text-[10px] font-mono font-black text-on-surface mt-1">
                                  {dayLog.status === 'working' ? 'Đang trực' : `+${dayLog.dailyWage.toLocaleString('vi-VN')}đ`}
                                </div>
                              </>
                            ) : (
                              <span className="text-[10px] font-semibold text-outline">Vắng mặt</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Attendance legend */}
              <div className="pt-4 border-t border-outline-variant flex items-center gap-6 text-[10px] text-on-surface-variant font-semibold pl-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-secondary-container border border-secondary-container block" /> Đã chấm công & Tính lương xong
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-tertiary-container border border-tertiary-container animate-pulse block" /> Đang trong ca làm (Working)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-surface-container-high border border-transparent block" /> Nghỉ làm / Vắng mặt
                </span>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* Modal to configure Employee wage / hourlyRate */}
      {modalOpen && editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-surface-container-lowest rounded-3xl border border-outline-variant max-w-sm w-full p-6 shadow-xl space-y-4">
            
            <div className="flex justify-between items-center pb-3 border-b border-outline-variant">
              <h3 className="text-sm font-black text-on-surface uppercase flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-tertiary" /> Thiết lập lương & vai trò
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-1 hover:bg-surface-container-high rounded-lg text-on-surface-variant hover:text-on-surface-variant transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Tên nhân viên</label>
                <input
                  type="text"
                  value={formName}
                  disabled
                  className="w-full px-3 py-2 border border-outline-variant bg-surface-container rounded-xl text-xs font-semibold text-on-surface-variant cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Chức danh / Vai trò</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-outline-variant bg-surface-container-lowest rounded-xl text-xs font-semibold text-on-surface"
                >
                  <option value={UserRole.STAFF}>Nhân viên (Staff)</option>
                  <option value={UserRole.MANAGER}>Quản lý (Store Manager)</option>
                  <option value={UserRole.OWNER}>Chủ cửa hàng (Store Admin)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-on-surface-variant uppercase">Mức lương mỗi giờ (đ/giờ)</label>
                <input
                  type="number"
                  value={formHourlyRate}
                  onChange={(e) => setFormHourlyRate(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="25000"
                  className="w-full px-3 py-2 border border-outline-variant rounded-xl text-xs font-mono font-bold focus:ring-1 focus:ring-primary"
                  required
                />
                <span className="text-[9px] text-on-surface-variant font-semibold block mt-1">
                  * Hệ thống sẽ tự động tính: Lương ngày = Tổng giờ công × Mức lương giờ.
                </span>
              </div>

              <div className="pt-4 border-t border-outline-variant flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-surface-container hover:bg-surface-container-high text-on-surface-variant rounded-xl font-bold transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-primary hover:brightness-110 text-white rounded-xl font-bold shadow transition-all cursor-pointer"
                >
                  Cập nhật cấu hình
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
