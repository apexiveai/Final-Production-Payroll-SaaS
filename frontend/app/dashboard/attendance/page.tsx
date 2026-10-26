"use client";

import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarCheck, CircleAlert, Clock3, Download, FileUp, LoaderCircle, Plus } from "lucide-react";

import api from "@/lib/api";
import { getEmployees } from "@/lib/employees";
import { getCompanies } from "@/lib/companies";
import { getToken, getUser } from "@/lib/auth";
import type { Company } from "@/types/company";
import type { Employee } from "@/types/employee";

type AttendanceRecord = {
  id: string;
  employee_id: string;
  work_date: string;
  check_in: string | null;
  check_out: string | null;
  status: string;
  overtime_minutes: number;
};
type LeaveType = { id: string; name: string; is_paid: boolean; annual_allowance_days: number };
type LeaveRequest = {
  id: string;
  employee_id: string;
  leave_type_id: string;
  starts_on: string;
  ends_on: string;
  reason: string | null;
  status: string;
};

function messageFor(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export default function AttendancePage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<LeaveType[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [employeeMode, setEmployeeMode] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [manualOpen, setManualOpen] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [attendanceStatus, setAttendanceStatus] = useState("PRESENT");
  const [overtimeMinutes, setOvertimeMinutes] = useState("0");
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [leaveStart, setLeaveStart] = useState("");
  const [leaveEnd, setLeaveEnd] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canExport, setCanExport] = useState(false);
  const [reportStart, setReportStart] = useState("");
  const [reportEnd, setReportEnd] = useState("");

  const loadData = useCallback(async (targetCompanyId = companyId, isEmployee = employeeMode) => {
    const params = isEmployee ? {} : { company_id: targetCompanyId };
    try {
      const [attendanceResponse, leaveResponse, typeResponse, employeeResult] = await Promise.all([
        api.get<AttendanceRecord[]>("/attendance", { params: { ...params, limit: 100 } }),
        api.get<LeaveRequest[]>("/leave/requests", { params: { ...params, limit: 100 } }),
        api.get<LeaveType[]>("/leave/types", { params }),
        isEmployee ? Promise.resolve([] as Employee[]) : getEmployees({ company_id: targetCompanyId, limit: 100 }),
      ]);
      setAttendance(attendanceResponse.data);
      setLeaveRequests(leaveResponse.data);
      setLeaveTypes(typeResponse.data);
      setEmployees(employeeResult);
      setError("");
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setLoading(false);
    }
  }, [companyId, employeeMode]);

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    let cancelled = false;
    const user = getUser();
    const employee = user?.role === "EMPLOYEE";
    const superAdmin = user?.role === "SUPER_ADMIN";
    const manager = ["SUPER_ADMIN", "COMPANY_ADMIN", "HR", "SUPERVISOR"].includes(user?.role ?? "");
    const reportAccess = ["SUPER_ADMIN", "COMPANY_ADMIN", "HR", "PAYROLL", "SUPERVISOR"].includes(user?.role ?? "");
    const initialCompany = user?.company_id ?? "";
    const companyRequest = employee ? Promise.resolve([] as Company[]) : getCompanies();
    void companyRequest
      .then(async (result) => {
        if (cancelled) return;
        setEmployeeMode(employee);
        setCanManage(manager);
        setCanExport(reportAccess);
        setIsSuperAdmin(superAdmin);
        setCompanies(result);
        const targetCompany = initialCompany || result[0]?.id || "";
        setCompanyId(targetCompany);
        const params = employee ? {} : { company_id: targetCompany };
        const [attendanceResponse, leaveResponse, typeResponse, employeeResult] = await Promise.all([
          api.get<AttendanceRecord[]>("/attendance", { params: { ...params, limit: 100 } }),
          api.get<LeaveRequest[]>("/leave/requests", { params: { ...params, limit: 100 } }),
          api.get<LeaveType[]>("/leave/types", { params }),
          employee ? Promise.resolve([] as Employee[]) : getEmployees({ company_id: targetCompany, limit: 100 }),
        ]);
        if (cancelled) return;
        setAttendance(attendanceResponse.data);
        setLeaveRequests(leaveResponse.data);
        setLeaveTypes(typeResponse.data);
        setEmployees(employeeResult);
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(messageFor(requestError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  async function checkPunch(action: "check-in" | "check-out") {
    try {
      await api.post(`/attendance/${action}`);
      await loadData(companyId, true);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function submitAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.post("/attendance", {
        employee_id: selectedEmployee,
        work_date: workDate,
        status: attendanceStatus,
        overtime_minutes: Number(overtimeMinutes),
      });
      setManualOpen(false);
      await loadData(companyId, false);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  function openManualAttendance() {
    setWorkDate(new Date().toISOString().slice(0, 10));
    setManualOpen(true);
  }

  async function submitLeave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      await api.post("/leave/requests", {
        employee_id: employeeMode ? undefined : selectedEmployee,
        leave_type_id: leaveTypeId,
        starts_on: leaveStart,
        ends_on: leaveEnd,
        reason: leaveReason.trim() || null,
      });
      setLeaveReason("");
      await loadData(companyId, employeeMode);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function decideLeave(requestId: string, status: "APPROVED" | "REJECTED") {
    try {
      await api.patch(`/leave/requests/${requestId}`, { status });
      await loadData(companyId, false);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const data = new FormData();
    data.append("file", file);
    try {
      await api.post("/attendance/import.csv", data, {
        params: isSuperAdmin ? { company_id: companyId } : undefined,
        headers: { "Content-Type": "multipart/form-data" },
      });
      await loadData(companyId, false);
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      event.target.value = "";
    }
  }

  async function exportAttendance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const response = await api.get<Blob>("/reports/attendance.csv", {
        params: {
          starts_on: reportStart,
          ends_on: reportEnd,
          ...(isSuperAdmin ? { company_id: companyId } : {}),
        },
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `attendance-${reportStart}-${reportEnd}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-200">
      <header className="flex h-12 items-center justify-between border-b border-white/[0.08] bg-[#10151c] px-4"><Link href="/dashboard" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft size={15} /> Dashboard</Link><span className="text-xs text-slate-500">Attendance & leave</span></header>
      <div className="mx-auto max-w-7xl space-y-5 p-5 md:p-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-400"><CalendarCheck size={14} /> Workforce operations</div><h1 className="text-2xl font-semibold text-white">Attendance & Leave</h1><p className="mt-2 text-sm text-slate-400">Attendance records, shift punches, leave requests and approvals.</p></div>
          <div className="flex flex-wrap gap-2">{employeeMode && <><button onClick={() => void checkPunch("check-in")} className="rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950">Check in</button><button onClick={() => void checkPunch("check-out")} className="rounded-lg border border-white/10 px-3 py-2 text-xs">Check out</button></>}{canManage && <><label className="flex cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-cyan-400/40"><FileUp size={14} /> Import CSV<input type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event)} className="sr-only" /></label><button onClick={openManualAttendance} className="flex items-center gap-1 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950"><Plus size={14} /> Manual entry</button></>}</div>
        </section>
        {isSuperAdmin && <label className="block max-w-sm text-xs text-slate-400">Company<select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setLoading(true); void loadData(event.target.value, false); }} className="mt-2 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2.5 text-sm text-white">{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200"><CircleAlert size={17} />{error}</div>}
        <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111820]">
            <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 lg:flex-row lg:items-center lg:justify-between">
              <h2 className="text-sm font-medium text-white">Attendance history</h2>
              {canExport && <form onSubmit={(event) => void exportAttendance(event)} className="flex flex-wrap items-end gap-2">
                <label className="text-[10px] text-slate-500">From<input required type="date" value={reportStart} onChange={(event) => setReportStart(event.target.value)} className="mt-1 block rounded border border-white/10 bg-[#0b1016] px-2 py-1.5 text-xs text-white" /></label>
                <label className="text-[10px] text-slate-500">To<input required type="date" min={reportStart || undefined} value={reportEnd} onChange={(event) => setReportEnd(event.target.value)} className="mt-1 block rounded border border-white/10 bg-[#0b1016] px-2 py-1.5 text-xs text-white" /></label>
                <button type="submit" className="flex items-center gap-1 rounded border border-white/10 px-3 py-2 text-xs hover:border-cyan-400/40"><Download size={13} /> CSV</button>
              </form>}
            </div>
            <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#0d131a] text-[10px] uppercase text-slate-500"><tr><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Date</th><th className="px-4 py-3">In / Out</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">OT</th></tr></thead><tbody className="divide-y divide-white/[0.05]">{loading ? <tr><td colSpan={5} className="py-10 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin" /></td></tr> : attendance.length === 0 ? <tr><td colSpan={5} className="py-10 text-center text-slate-500">No attendance records.</td></tr> : attendance.map((record) => <tr key={record.id}><td className="px-4 py-3 text-xs text-white">{employees.find((employee) => employee.id === record.employee_id)?.full_name ?? "My attendance"}</td><td className="px-4 py-3 text-xs text-slate-400">{record.work_date}</td><td className="px-4 py-3 text-xs text-slate-400">{record.check_in ? new Date(record.check_in).toLocaleTimeString() : "—"} / {record.check_out ? new Date(record.check_out).toLocaleTimeString() : "—"}</td><td className="px-4 py-3 text-xs">{record.status}</td><td className="px-4 py-3 text-xs text-slate-400">{record.overtime_minutes} min</td></tr>)}</tbody></table></div>
          </section>
          {(employeeMode || canManage) && <section className="rounded-xl border border-white/[0.08] bg-[#111820]"><div className="flex items-center gap-2 border-b border-white/[0.07] p-4"><Clock3 size={15} className="text-cyan-400" /><h2 className="text-sm font-medium text-white">Request leave</h2></div><form onSubmit={submitLeave} className="space-y-3 p-4">
            {!employeeMode && <label className="block text-xs text-slate-400">Employee<select required value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_code} · {employee.full_name}</option>)}</select></label>}
            <label className="block text-xs text-slate-400">Leave type<select required value={leaveTypeId} onChange={(event) => setLeaveTypeId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option value="">Select type</option>{leaveTypes.map((type) => <option key={type.id} value={type.id}>{type.name} · {type.is_paid ? "Paid" : "Unpaid"}</option>)}</select></label>
            <div className="grid grid-cols-2 gap-2"><label className="text-xs text-slate-400">From<input required type="date" value={leaveStart} onChange={(event) => setLeaveStart(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-2 py-2 text-xs text-white" /></label><label className="text-xs text-slate-400">To<input required type="date" value={leaveEnd} onChange={(event) => setLeaveEnd(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-2 py-2 text-xs text-white" /></label></div>
            <label className="block text-xs text-slate-400">Reason<textarea maxLength={1000} value={leaveReason} onChange={(event) => setLeaveReason(event.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label>
            <button type="submit" className="w-full rounded-lg bg-cyan-400 px-3 py-2.5 text-xs font-semibold text-slate-950">Submit request</button>
          </form></section>}
        </div>
        <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#111820]"><div className="border-b border-white/[0.07] p-4"><h2 className="text-sm font-medium text-white">Leave approvals</h2></div><div className="divide-y divide-white/[0.05]">{leaveRequests.length === 0 ? <p className="p-5 text-xs text-slate-500">No leave requests.</p> : leaveRequests.map((request) => <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="text-xs font-medium text-white">{employees.find((employee) => employee.id === request.employee_id)?.full_name ?? (employeeMode ? "My leave" : "Employee")} · {leaveTypes.find((type) => type.id === request.leave_type_id)?.name ?? "Leave"}</p><p className="mt-1 text-xs text-slate-500">{request.starts_on} — {request.ends_on}{request.reason ? ` · ${request.reason}` : ""}</p></div><div className="flex items-center gap-2"><span className="text-[10px] text-slate-400">{request.status}</span>{canManage && request.status === "PENDING" && <><button onClick={() => void decideLeave(request.id, "APPROVED")} className="rounded border border-emerald-400/20 px-2 py-1 text-[10px] text-emerald-300">Approve</button><button onClick={() => void decideLeave(request.id, "REJECTED")} className="rounded border border-rose-400/20 px-2 py-1 text-[10px] text-rose-300">Reject</button></>}</div></div>)}</div></section>
      </div>
      {manualOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"><form onSubmit={submitAttendance} className="w-full max-w-md space-y-3 rounded-2xl border border-white/10 bg-[#111820] p-5"><h2 className="font-semibold text-white">Manual attendance</h2><label className="block text-xs text-slate-400">Employee<select required value={selectedEmployee} onChange={(event) => setSelectedEmployee(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option value="">Select employee</option>{employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_code} · {employee.full_name}</option>)}</select></label><label className="block text-xs text-slate-400">Work date<input required type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label><label className="block text-xs text-slate-400">Status<select value={attendanceStatus} onChange={(event) => setAttendanceStatus(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white">{["PRESENT", "ABSENT", "LATE", "LEAVE", "HOLIDAY"].map((status) => <option key={status}>{status}</option>)}</select></label><label className="block text-xs text-slate-400">Overtime minutes<input type="number" min="0" max="1440" value={overtimeMinutes} onChange={(event) => setOvertimeMinutes(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label><div className="flex justify-end gap-2"><button type="button" onClick={() => setManualOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-xs">Cancel</button><button type="submit" className="rounded-lg bg-cyan-400 px-4 py-2 text-xs font-semibold text-slate-950">Save record</button></div></form></div>}
    </main>
  );
}
