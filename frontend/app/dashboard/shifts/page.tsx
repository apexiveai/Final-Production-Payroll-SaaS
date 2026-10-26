"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, CircleAlert, Clock3, LoaderCircle, Plus, RefreshCw, X } from "lucide-react";

import api from "@/lib/api";
import { getCompanies } from "@/lib/companies";
import { getEmployees } from "@/lib/employees";
import { getToken, getUser } from "@/lib/auth";
import type { Company } from "@/types/company";
import type { Employee } from "@/types/employee";

type Shift = {
  id: string;
  company_id: string;
  name: string;
  shift_type: "DAY" | "NIGHT" | "JOKER";
  starts_at: string;
  ends_at: string;
};

type ShiftAssignment = {
  id: string;
  employee_id: string;
  employee_code: string;
  employee_name: string;
  site_id: string | null;
  shift_id: string;
  shift_name: string;
  shift_type: Shift["shift_type"];
  starts_at: string;
  ends_at: string;
  work_date: string;
};

const emptyShift = {
  name: "",
  shift_type: "DAY" as Shift["shift_type"],
  starts_at: "08:00",
  ends_at: "17:00",
};

function messageFor(error: unknown): string {
  if (typeof error === "object" && error !== null && "response" in error) {
    const response = (error as { response?: { data?: { detail?: string } } }).response;
    if (response?.data?.detail) return response.data.detail;
  }
  return error instanceof Error ? error.message : "The request could not be completed.";
}

export default function ShiftsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [assignments, setAssignments] = useState<ShiftAssignment[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [employeeMode, setEmployeeMode] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [shiftFormOpen, setShiftFormOpen] = useState(false);
  const [assignmentFormOpen, setAssignmentFormOpen] = useState(false);
  const [shiftForm, setShiftForm] = useState(emptyShift);
  const [employeeId, setEmployeeId] = useState("");
  const [shiftId, setShiftId] = useState("");
  const [workDate, setWorkDate] = useState("");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadData = useCallback(async (
    targetCompanyId: string,
    employee: boolean,
    firstDate: string,
    lastDate: string,
  ) => {
    try {
      const params = {
        ...(!employee && targetCompanyId ? { company_id: targetCompanyId } : {}),
        ...(firstDate ? { starts_on: firstDate } : {}),
        ...(lastDate ? { ends_on: lastDate } : {}),
        limit: 200,
      };
      const [shiftResponse, assignmentResponse, employeeList] = await Promise.all([
        employee
          ? Promise.resolve({ data: [] as Shift[] })
          : api.get<Shift[]>("/shifts", { params: targetCompanyId ? { company_id: targetCompanyId } : undefined }),
        api.get<ShiftAssignment[]>("/shifts/assignments", { params }),
        employee
          ? Promise.resolve([] as Employee[])
          : getEmployees({ company_id: targetCompanyId || undefined, limit: 100 }),
      ]);
      setShifts(shiftResponse.data);
      setAssignments(assignmentResponse.data);
      setEmployees(employeeList);
      setError("");
    } catch (requestError) {
      setError(messageFor(requestError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!getToken()) {
      window.location.replace("/login");
      return;
    }
    let cancelled = false;
    const user = getUser();
    const employee = user?.role === "EMPLOYEE";
    const superAdmin = user?.role === "SUPER_ADMIN";
    const manager = ["SUPER_ADMIN", "COMPANY_ADMIN", "HR"].includes(user?.role ?? "");
    const initialCompany = user?.company_id ?? "";
    const companyRequest = superAdmin ? getCompanies() : Promise.resolve([] as Company[]);
    void companyRequest
      .then(async (companyList) => {
        if (cancelled) return;
        setEmployeeMode(employee);
        setIsSuperAdmin(superAdmin);
        setCanManage(manager);
        setCompanies(companyList);
        const targetCompany = initialCompany || companyList[0]?.id || "";
        setCompanyId(targetCompany);
        await loadData(targetCompany, employee, "", "");
      })
      .catch((requestError: unknown) => {
        if (!cancelled) {
          setError(messageFor(requestError));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [loadData]);

  async function changeCompany(nextCompany: string) {
    setCompanyId(nextCompany);
    setLoading(true);
    await loadData(nextCompany, false, startsOn, endsOn);
  }

  async function submitShift(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/shifts", {
        ...shiftForm,
        company_id: isSuperAdmin ? companyId : undefined,
      });
      setShiftFormOpen(false);
      setShiftForm(emptyShift);
      setLoading(true);
      await loadData(companyId, false, startsOn, endsOn);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function submitAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    try {
      await api.post("/shifts/assignments", {
        employee_id: employeeId,
        shift_id: shiftId,
        work_date: workDate,
      });
      setAssignmentFormOpen(false);
      setEmployeeId("");
      setShiftId("");
      setWorkDate("");
      setLoading(true);
      await loadData(companyId, false, startsOn, endsOn);
    } catch (requestError) {
      setError(messageFor(requestError));
    }
  }

  async function filterDates(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    await loadData(companyId, employeeMode, startsOn, endsOn);
  }

  const visibleAssignments = assignments;

  return (
    <main className="min-h-screen bg-[#0b0f14] text-slate-200">
      <header className="flex h-12 items-center justify-between border-b border-white/[0.08] bg-[#10151c] px-4">
        <Link href="/dashboard" className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"><ArrowLeft size={15} /> Dashboard</Link>
        <button onClick={() => { setLoading(true); void loadData(companyId, employeeMode, startsOn, endsOn); }} className="flex items-center gap-2 text-xs text-slate-400 hover:text-white"><RefreshCw size={14} /> Refresh</button>
      </header>
      <div className="mx-auto max-w-7xl space-y-5 p-5 md:p-8">
        <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div><div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-cyan-400"><Clock3 size={14} /> Workforce operations</div><h1 className="text-2xl font-semibold text-white">Shift Roster</h1><p className="mt-2 text-sm text-slate-400">Maintain Day, Night, and Joker shift patterns and employee assignments.</p></div>
          {canManage && <div className="flex flex-wrap gap-2"><button onClick={() => setShiftFormOpen(true)} className="flex items-center gap-1 rounded-lg border border-white/10 px-3 py-2 text-xs hover:border-cyan-400/40"><Plus size={14} /> New shift</button><button onClick={() => setAssignmentFormOpen(true)} disabled={!shifts.length || !employees.length} className="flex items-center gap-1 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-semibold text-slate-950 disabled:opacity-50"><Plus size={14} /> Assign shift</button></div>}
        </section>
        {isSuperAdmin && <label className="block max-w-sm text-xs text-slate-400">Company<select value={companyId} onChange={(event) => void changeCompany(event.target.value)} className="mt-2 w-full rounded-lg border border-white/10 bg-[#111820] px-3 py-2.5 text-sm text-white">{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
        {error && <div role="alert" className="flex items-start gap-2 rounded-lg border border-rose-400/20 bg-rose-400/[0.06] p-3 text-sm text-rose-200"><CircleAlert size={17} />{error}</div>}
        <section className="rounded-xl border border-white/[0.08] bg-[#111820]">
          <div className="flex flex-col gap-3 border-b border-white/[0.07] p-4 lg:flex-row lg:items-center lg:justify-between">
            <h2 className="text-sm font-medium text-white">Defined shifts</h2>
            <div className="flex flex-wrap gap-2">{shifts.map((shift) => <div key={shift.id} className="rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-xs"><span className="font-medium text-white">{shift.name}</span><span className="ml-2 text-cyan-300">{shift.shift_type}</span><span className="ml-2 text-slate-500">{shift.starts_at.slice(0, 5)}–{shift.ends_at.slice(0, 5)}</span></div>)}</div>
          </div>
          <form onSubmit={(event) => void filterDates(event)} className="flex flex-wrap items-end gap-2 border-b border-white/[0.07] p-4">
            <label className="text-[10px] text-slate-500">From<input type="date" value={startsOn} onChange={(event) => setStartsOn(event.target.value)} className="mt-1 block rounded border border-white/10 bg-[#0b1016] px-2 py-1.5 text-xs text-white" /></label>
            <label className="text-[10px] text-slate-500">To<input type="date" min={startsOn || undefined} value={endsOn} onChange={(event) => setEndsOn(event.target.value)} className="mt-1 block rounded border border-white/10 bg-[#0b1016] px-2 py-1.5 text-xs text-white" /></label>
            <button type="submit" className="rounded border border-white/10 px-3 py-2 text-xs hover:border-cyan-400/40">Filter roster</button>
          </form>
          <div className="overflow-x-auto"><table className="w-full min-w-[720px] text-left text-sm"><thead className="bg-[#0d131a] text-[10px] uppercase tracking-wider text-slate-500"><tr><th className="px-4 py-3">Work date</th><th className="px-4 py-3">Employee</th><th className="px-4 py-3">Shift</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Hours</th></tr></thead><tbody className="divide-y divide-white/[0.05]">{loading ? <tr><td colSpan={5} className="py-12 text-center text-slate-500"><LoaderCircle className="mx-auto animate-spin" /></td></tr> : visibleAssignments.length === 0 ? <tr><td colSpan={5} className="py-12 text-center text-slate-500">No shift assignments for this date range.</td></tr> : visibleAssignments.map((assignment) => <tr key={assignment.id}><td className="px-4 py-3 text-xs text-slate-300">{assignment.work_date}</td><td className="px-4 py-3"><div className="text-xs font-medium text-white">{assignment.employee_name}</div><div className="mt-1 font-mono text-[10px] text-slate-500">{assignment.employee_code}</div></td><td className="px-4 py-3 text-xs text-slate-300">{assignment.shift_name}</td><td className="px-4 py-3 text-xs text-cyan-300">{assignment.shift_type}</td><td className="px-4 py-3 text-xs text-slate-400">{assignment.starts_at.slice(0, 5)}–{assignment.ends_at.slice(0, 5)}</td></tr>)}</tbody></table></div>
          <footer className="border-t border-white/[0.07] px-4 py-3 text-xs text-slate-500">Showing up to 200 roster assignments</footer>
        </section>
      </div>
      {shiftFormOpen && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"><form onSubmit={(event) => void submitShift(event)} className="my-auto w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-[#111820] p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-white">Create shift</h2><p className="mt-1 text-xs text-slate-500">For overnight shifts, set the end time earlier than the start time.</p></div><button type="button" onClick={() => setShiftFormOpen(false)} aria-label="Close"><X size={18} /></button></div><label className="block text-xs text-slate-400">Shift name<input required minLength={2} maxLength={100} value={shiftForm.name} onChange={(event) => setShiftForm({ ...shiftForm, name: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label><label className="block text-xs text-slate-400">Type<select value={shiftForm.shift_type} onChange={(event) => setShiftForm({ ...shiftForm, shift_type: event.target.value as Shift["shift_type"] })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option value="DAY">Day</option><option value="NIGHT">Night</option><option value="JOKER">Joker</option></select></label><div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">Starts at<input required type="time" value={shiftForm.starts_at} onChange={(event) => setShiftForm({ ...shiftForm, starts_at: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label><label className="text-xs text-slate-400">Ends at<input required type="time" value={shiftForm.ends_at} onChange={(event) => setShiftForm({ ...shiftForm, ends_at: event.target.value })} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label></div><div className="flex justify-end gap-2 border-t border-white/[0.07] pt-4"><button type="button" onClick={() => setShiftFormOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Save shift</button></div></form></div>}
      {assignmentFormOpen && <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4"><form onSubmit={(event) => void submitAssignment(event)} className="my-auto w-full max-w-lg space-y-4 rounded-2xl border border-white/10 bg-[#111820] p-5"><div className="flex items-center justify-between"><div><h2 className="font-semibold text-white">Assign shift</h2><p className="mt-1 text-xs text-slate-500">An employee can only have one shift assignment per day.</p></div><button type="button" onClick={() => setAssignmentFormOpen(false)} aria-label="Close"><X size={18} /></button></div><label className="block text-xs text-slate-400">Employee<select required value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option value="">Select employee</option>{employees.filter((employee) => employee.employment_status === "ACTIVE").map((employee) => <option key={employee.id} value={employee.id}>{employee.employee_code} · {employee.full_name}</option>)}</select></label><label className="block text-xs text-slate-400">Shift<select required value={shiftId} onChange={(event) => setShiftId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white"><option value="">Select shift</option>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name} · {shift.shift_type}</option>)}</select></label><label className="block text-xs text-slate-400">Work date<input required type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b1016] px-3 py-2 text-sm text-white" /></label><div className="flex justify-end gap-2 border-t border-white/[0.07] pt-4"><button type="button" onClick={() => setAssignmentFormOpen(false)} className="rounded-lg border border-white/10 px-4 py-2 text-sm">Cancel</button><button type="submit" className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950">Assign shift</button></div></form></div>}
    </main>
  );
}
