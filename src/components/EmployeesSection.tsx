/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  Users, Search, Plus, Edit2, Briefcase, DollarSign, Calendar, Clock,
  CheckCircle2, X, Play, LogOut, ChevronLeft, ChevronRight, Award, Grid, List
} from 'lucide-react';
import { UserProfile, Attendance, UserRole } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { logOperation } from '../utils/logger';
import { queueOfflineOperation } from '../utils/offlineManager';

interface EmployeesSectionProps {
  isOffline: boolean;
  storeId: string;
  triggerBeep: (success: boolean) => void;
  // State for offline demo
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
  const [employees, setEmployees] = useState<UserProfile[]>([]);
  const [attendanceLogs, setAttendanceLogs] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  
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

  // Load Sync Employees & Attendance
  useEffect(() => {
    if (isOffline || !storeId) {
      setEmployees(simEmployees);
      setAttendanceLogs(simAttendance);
      return;
    }

    setLoading(true);

    // Sync Employees (Users with match storeId)
    const employeesQuery = query(collection(db, 'users'), where('storeId', '==', storeId));
    const unsubscribeEmployees = onSnapshot(employeesQuery, (snapshot) => {
      const list: UserProfile[] = [];
      snapshot.forEach((docSnap) => {
        list.push({ uid: docSnap.id, ...docSnap.data() } as UserProfile);
      });
      setEmployees(list);
    });

    // Sync Attendance
    const attendanceRef = collection(db, 'stores', storeId, 'attendance');
    const unsubscribeAttendance = onSnapshot(attendanceRef, (snapshot) => {
      const logs: Attendance[] = [];
      snapshot.forEach((docSnap) => {
        logs.push({ id: docSnap.id, ...docSnap.data() } as Attendance);
      });
      logs.sort((a, b) => b.checkIn.localeCompare(a.checkIn));
      setAttendanceLogs(logs);
      setLoading(false);
    }, (error) => {
      console.error(error);
      setLoading(false);
    });

    return () => {
      unsubscribeEmployees();
      unsubscribeAttendance();
    };
  }, [isOffline, storeId, simEmployees, simAttendance]);

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

      if (isOffline) {
        queueOfflineOperation(storeId, 'users', 'set', editingEmployee.uid, updatedProfile);
        setSimEmployees(prev => prev.map(emp => emp.uid === editingEmployee.uid ? updatedProfile : emp));
      } else {
        // Firebase users collection update
        await setDoc(doc(db, 'users', editingEmployee.uid), {
          ...updatedProfile
        });
      }

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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white border border-slate-200 rounded-3xl p-6 shadow-sm gap-4">
        <div>
          <h2 className="text-xl font-black text-slate-900 tracking-tight uppercase flex items-center gap-2">
            <Briefcase className="w-6 h-6 text-emerald-500" />
            Hệ thống Quản lý Nhân sự & Chấm công
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Thiết lập bảng lương, cấu hình mức lương theo giờ, và hiển thị bảng chấm công tuần (Schedule Board).
          </p>
        </div>

        {/* View tab switches */}
        <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold">
          <button
            onClick={() => { setActiveTab('list'); triggerBeep(true); }}
            className={`px-4.5 py-2 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'list' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <List className="w-4 h-4" /> Danh sách nhân viên
          </button>
          <button
            onClick={() => { setActiveTab('schedule'); triggerBeep(true); }}
            className={`px-4.5 py-2 rounded-lg flex items-center gap-1.5 transition-all ${
              activeTab === 'schedule' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Calendar className="w-4 h-4" /> Bảng chấm công tuần
          </button>
        </div>
      </div>

      {activeTab === 'list' && (
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex items-center relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm kiếm nhân viên theo Tên, Email hoặc Vai trò..."
              className="w-full pl-10 pr-4 py-3 border border-slate-200 rounded-xl text-xs focus:ring-1 focus:ring-emerald-500 font-semibold"
            />
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-100">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50 text-slate-400 font-bold uppercase border-b border-slate-100">
                  <th className="p-4">Họ và tên</th>
                  <th className="p-4">Email đăng nhập</th>
                  <th className="p-4">Vai trò chức vụ</th>
                  <th className="p-4 text-right">Lương theo giờ (đ/giờ)</th>
                  <th className="p-4 text-right">Hành động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {filteredEmployees.map((emp) => {
                  return (
                    <tr key={emp.uid} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs uppercase border border-slate-200">
                            {emp.name.slice(0, 2)}
                          </div>
                          <div>
                            <p className="font-extrabold text-slate-900">{emp.name}</p>
                            <p className="text-[10px] text-slate-400 font-mono mt-0.5">UID: {emp.uid.slice(0, 8)}...</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-500">{emp.email}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                          emp.role === 'owner'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200/50'
                            : emp.role === 'manager'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200/50'
                              : emp.role === 'sysadmin'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200/50'
                                : 'bg-blue-50 text-blue-700 border border-blue-200/50'
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
                      <td className="p-4 text-right font-bold text-slate-950 font-mono">
                        {(emp.hourlyRate || 25000).toLocaleString('vi-VN')} đ/h
                      </td>
                      <td className="p-4 text-right">
                        <button
                          onClick={() => handleOpenEdit(emp)}
                          className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3 h-3 text-slate-400" /> Thiết lập lương
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
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Thời gian chấm công</span>
              <h3 className="text-sm font-extrabold text-slate-900">
                Tuần: {weekDays[0].rawDate.toLocaleDateString('vi-VN')} – {weekDays[6].rawDate.toLocaleDateString('vi-VN')}
              </h3>
            </div>
            
            <div className="flex items-center gap-2">
              <button
                onClick={() => changeWeek('prev')}
                className="p-2 border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 text-slate-600" />
              </button>
              <button
                onClick={() => { setCurrentWeekStart(new Date()); triggerBeep(true); }}
                className="px-3.5 py-1.5 border border-slate-200 hover:bg-slate-100 rounded-xl text-xs font-bold text-slate-600 transition-colors cursor-pointer"
              >
                Tuần này
              </button>
              <button
                onClick={() => changeWeek('next')}
                className="p-2 border border-slate-200 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 text-slate-600" />
              </button>
            </div>
          </div>

          {/* Schedule board grid */}
          <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm overflow-x-auto">
            <div className="min-w-[1000px] space-y-4">
              
              {/* Grid headers */}
              <div className="grid grid-cols-8 gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-2.5 font-extrabold text-slate-500 uppercase tracking-wide text-center">
                <div className="text-left pl-3 self-center">Nhân viên</div>
                {weekDays.map(day => {
                  const isToday = day.dateStr === new Date().toLocaleDateString('sv-SE');
                  return (
                    <div key={day.dateStr} className={`p-1.5 rounded-xl ${isToday ? 'bg-blue-600 text-white font-black shadow-sm' : ''}`}>
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
                    <div key={emp.uid} className="grid grid-cols-8 gap-2 border border-slate-100 rounded-2xl p-2.5 items-center hover:bg-slate-50/20 transition-all">
                      {/* Name / Wage summary left card */}
                      <div className="text-left pl-2">
                        <p className="font-extrabold text-slate-900">{emp.name}</p>
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                          {emp.role === 'owner'
                            ? 'Chủ cửa hàng'
                            : emp.role === 'manager'
                              ? 'Quản lý'
                              : emp.role === 'sysadmin'
                                ? 'System Admin'
                                : 'Nhân viên'}
                        </p>
                        <p className="text-[10px] text-emerald-600 font-extrabold font-mono mt-1">
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
                              ? 'bg-amber-50 border-amber-200 text-amber-800 animate-pulse'
                              : dayLog?.status === 'completed'
                                ? 'bg-emerald-50/60 border-emerald-100 text-slate-800'
                                : 'bg-slate-50/30 border-transparent text-slate-300 border-dashed border-slate-100'
                          }`}>
                            {dayLog ? (
                              <>
                                <div className="text-[10px] font-bold font-mono">
                                  {new Date(dayLog.checkIn).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                  {dayLog.checkOut ? ` - ${new Date(dayLog.checkOut).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}` : ' - ...'}
                                </div>
                                <div className="text-[9px] font-extrabold px-1 py-0.5 rounded uppercase font-sans mt-0.5 w-fit mx-auto bg-white border shadow-sm">
                                  {dayLog.status === 'working' ? 'ON Shift' : `${dayLog.hoursWorked.toFixed(1)}h`}
                                </div>
                                <div className="text-[10px] font-mono font-black text-slate-900 mt-1">
                                  {dayLog.status === 'working' ? 'Đang trực' : `+${dayLog.dailyWage.toLocaleString('vi-VN')}đ`}
                                </div>
                              </>
                            ) : (
                              <span className="text-[10px] font-semibold text-slate-300">Vắng mặt</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Attendance legend */}
              <div className="pt-4 border-t border-slate-100 flex items-center gap-6 text-[10px] text-slate-400 font-semibold pl-4">
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-emerald-100 border border-emerald-200 block" /> Đã chấm công & Tính lương xong
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-200 animate-pulse block" /> Đang trong ca làm (Working)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded bg-slate-100 border border-transparent block" /> Nghỉ làm / Vắng mặt
                </span>
              </div>

            </div>
          </div>

        </div>
      )}

      {/* Modal to configure Employee wage / hourlyRate */}
      {modalOpen && editingEmployee && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-3xl border border-slate-200 max-w-sm w-full p-6 shadow-xl space-y-4">
            
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-sm font-black text-slate-900 uppercase flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-amber-500" /> Thiết lập lương & vai trò
              </h3>
              <button 
                onClick={() => setModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Tên nhân viên</label>
                <input
                  type="text"
                  value={formName}
                  disabled
                  className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-xl text-xs font-semibold text-slate-500 cursor-not-allowed"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Chức danh / Vai trò</label>
                <select
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 bg-white rounded-xl text-xs font-semibold text-slate-700"
                >
                  <option value={UserRole.STAFF}>Nhân viên (Staff)</option>
                  <option value={UserRole.MANAGER}>Quản lý (Store Manager)</option>
                  <option value={UserRole.OWNER}>Chủ cửa hàng (Store Admin)</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-500 uppercase">Mức lương mỗi giờ (đ/giờ)</label>
                <input
                  type="number"
                  value={formHourlyRate}
                  onChange={(e) => setFormHourlyRate(Math.max(0, parseInt(e.target.value) || 0))}
                  placeholder="25000"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-mono font-bold focus:ring-1 focus:ring-emerald-500"
                  required
                />
                <span className="text-[9px] text-slate-400 font-semibold block mt-1">
                  * Hệ thống sẽ tự động tính: Lương ngày = Tổng giờ công × Mức lương giờ.
                </span>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-xl font-bold transition-colors cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold shadow transition-all cursor-pointer"
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
