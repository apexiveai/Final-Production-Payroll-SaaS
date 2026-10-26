
"use client";
import api from "../../lib/api";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Building2,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock3,
  Command,
  CreditCard,
  FileBarChart,
  FileClock,
  Folder,
  Gauge,
  LayoutDashboard,
  LogOut,
  MapPinned,
  Menu,
  Monitor,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Terminal,
  Users,
  UserRoundCog,
  Wallet,
  X,
  Zap,
} from "lucide-react";
import { clearAuth, getToken } from "@/lib/auth";
import type { User } from "@/types/auth";
import type { Company } from "@/types/company";

type DashboardSummary = {
  active_employees: number;
  active_sites: number;
  attendance_records_today: number;
  pending_leave_approvals: number;
  pending_payroll_runs: number;
};

type AuditEntry = {
  id: string;
  action: string;
  resource_type: string;
  created_at: string;
};

const modules = [
  { name: "Overview", icon: LayoutDashboard, group: "WORKSPACE" },
  { name: "Companies", icon: Building2, group: "ORGANIZATION" },
  { name: "Sites", icon: Monitor, group: "ORGANIZATION" },
  { name: "Users", icon: UserRoundCog, group: "ORGANIZATION" },
  { name: "Employees", icon: Users, group: "WORKFORCE" },
  { name: "Attendance", icon: CalendarCheck, group: "WORKFORCE" },
  { name: "Shifts", icon: Clock3, group: "WORKFORCE" },
  { name: "Payroll", icon: Wallet, group: "FINANCE" },
  { name: "Payments", icon: CreditCard, group: "FINANCE" },
  { name: "Reports", icon: FileBarChart, group: "INSIGHTS" },
  { name: "Regional Insights", icon: MapPinned, group: "INSIGHTS" },
  { name: "Audit Logs", icon: ShieldCheck, group: "SYSTEM" },
  { name: "Settings", icon: Settings, group: "SYSTEM" },
];

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [activeModule, setActiveModule] = useState("Overview");
  const [openTabs, setOpenTabs] = useState(["Overview"]);
  const [activeActivity, setActiveActivity] = useState("explorer");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [outputOpen, setOutputOpen] = useState(true);
  const [outputTab, setOutputTab] = useState("OUTPUT");
  const [apiStatus, setApiStatus] = useState("CHECKING");
  const [databaseStatus, setDatabaseStatus] = useState("CHECKING");
  const [dashboardSummary, setDashboardSummary] = useState<DashboardSummary | null>(null);
  const [auditEntries, setAuditEntries] = useState<AuditEntry[]>([]);
  const [clock, setClock] = useState("");
  const [notice, setNotice] = useState("");
  const [logoutPending, setLogoutPending] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function authenticate() {
      const token = getToken();

      if (!token) {
        router.replace("/login");
        return;
      }

      try {
        const response = await api.get<User>("/auth/me");

        if (!cancelled) {
          setUser(response.data);
          setApiStatus("CONNECTED");
        }

        try {
          await api.get("/health/ready");
          if (!cancelled) setDatabaseStatus("CONNECTED");
        } catch {
          if (!cancelled) setDatabaseStatus("UNAVAILABLE");
        }

        if (response.data.role !== "EMPLOYEE") {
          try {
            let companyId = response.data.company_id;
            if (!companyId && response.data.role === "SUPER_ADMIN") {
              const companiesResponse = await api.get<Company[]>("/companies");
              companyId = companiesResponse.data[0]?.id ?? null;
            }
            if (companyId) {
              const summaryResponse = await api.get<DashboardSummary>(
                "/reports/summary",
                { params: { company_id: companyId } },
              );
              const auditResponse = await api.get<AuditEntry[]>("/audit-logs", {
                params: { company_id: companyId, limit: 5 },
              });
              if (!cancelled) {
                setDashboardSummary(summaryResponse.data);
                setAuditEntries(auditResponse.data);
              }
            }
          } catch {
            if (!cancelled) {
              setNotice("Workforce metrics are unavailable for the current account.");
            }
          }
        }
      } catch {
        if (!cancelled) {
          clearAuth();
          router.replace("/login");
        }
      }
    }

    void authenticate();

    const updateClock = () => {
      setClock(
        new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
          second: "2-digit",
          hour12: false,
        }).format(new Date()),
      );
    };

    updateClock();
    const timer = window.setInterval(updateClock, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [router]);

  const selectModule = useCallback((name: string) => {
    const moduleRoutes: Record<string, string> = {
      Companies: "/dashboard/companies",
      Sites: "/dashboard/sites",
      Users: "/dashboard/users",
      Shifts: "/dashboard/shifts",
      Settings: "/dashboard/security",
      Employees: "/dashboard/employees",
      Attendance: "/dashboard/attendance",
      Payroll: "/dashboard/payroll",
      "Regional Insights": "/dashboard/regional-workforce",
    };
    if (moduleRoutes[name]) {
      router.push(moduleRoutes[name]);
      return;
    }
    setActiveModule(name);
    setOpenTabs((previous) =>
      previous.includes(name) ? previous : [...previous, name],
    );
    setNotice("");
  }, [router]);

  const closeTab = useCallback(
    (name: string) => {
      if (name === "Overview") return;

      setOpenTabs((previous) => previous.filter((tab) => tab !== name));

      if (activeModule === name) {
        setActiveModule("Overview");
      }
    },
    [activeModule],
  );

  const filteredModules = useMemo(
    () =>
      modules.filter((module) =>
        module.name.toLowerCase().includes(commandQuery.toLowerCase())
        && (
          module.name !== "Users"
          || ["SUPER_ADMIN", "COMPANY_ADMIN"].includes(user?.role ?? "")
        ),
      ),
    [commandQuery, user?.role],
  );
  const stats = [
    {
      label: "ACTIVE EMPLOYEES",
      value: dashboardSummary?.active_employees.toLocaleString() ?? "—",
      note: "Active employee records",
      icon: Users,
    },
    {
      label: "ACTIVE SITES",
      value: dashboardSummary?.active_sites.toLocaleString() ?? "—",
      note: "Sites registered in this company",
      icon: Building2,
    },
    {
      label: "ATTENDANCE TODAY",
      value: dashboardSummary?.attendance_records_today.toLocaleString() ?? "—",
      note: "Attendance records for today",
      icon: CalendarCheck,
    },
    {
      label: "PENDING APPROVALS",
      value: dashboardSummary
        ? (
            dashboardSummary.pending_leave_approvals
            + dashboardSummary.pending_payroll_runs
          ).toLocaleString()
        : "—",
      note: "Leave and payroll reviews",
      icon: Wallet,
    },
  ];

  async function logout() {
    setLogoutPending(false);
    try {
      await api.post("/auth/logout");
      clearAuth();
      router.replace("/login");
    } catch {
      setLogoutPending(true);
      setNotice("Could not revoke the server session. Check your connection and try signing out again.");
    }
  }

  function runAction(action: string) {
    if (action === "New employee") {
      selectModule("Employees");
      setNotice("Employee workspace opened. Connect the employee API to create records.");
    } else if (action === "Record attendance") {
      selectModule("Attendance");
      setNotice("Attendance workspace opened. Live records will appear after the attendance API is connected.");
    } else if (action === "Process payroll") {
      selectModule("Payroll");
      setNotice("Payroll workspace opened. No payroll has been processed.");
    } else {
      selectModule(action);
    }
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#101114] text-zinc-400">
        <div className="flex items-center gap-3 text-sm">
          <Activity className="animate-pulse text-cyan-400" size={18} />
          Verifying secure workspace...
        </div>
      </main>
    );
  }

  return (
    <main className="flex h-screen min-h-[540px] flex-col overflow-hidden bg-[#101114] text-[#d4d4d8] selection:bg-cyan-400/20">
      {/* Desktop title bar */}
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-white/[0.08] bg-[#18191e] px-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-400">
            <Zap size={17} />
          </div>
          <span className="hidden text-xs font-semibold tracking-wide text-zinc-200 sm:inline">
            ApexiveAI Workforce Payroll
          </span>
          <span className="text-xs text-zinc-600">—</span>
          <span className="truncate text-xs text-zinc-400">{activeModule}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setCommandOpen(true);
              setCommandQuery("");
            }}
            className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-zinc-500 hover:border-cyan-500/40 sm:flex"
          >
            <Search size={13} />
            Search modules...
            <span className="ml-3 flex items-center gap-1 rounded border border-white/10 px-1.5 py-0.5">
              <Command size={10} /> K
            </span>
          </button>
          <button
            onClick={() => setNotice("Notifications are ready for integration. No live alerts are configured yet.")}
            className="rounded-md p-2 text-zinc-400 hover:bg-white/5 hover:text-white"
            aria-label="Notifications"
          >
            <Bell size={16} />
          </button>
          <button
            onClick={() => setSidebarOpen((value) => !value)}
            className="rounded-md p-2 text-zinc-400 hover:bg-white/5"
            aria-label="Toggle explorer"
          >
            <Menu size={16} />
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {/* Activity bar */}
        <aside className="flex w-12 shrink-0 flex-col items-center border-r border-white/[0.08] bg-[#18191e] py-2">
          {[
            { id: "explorer", icon: Folder, label: "Explorer" },
            { id: "workforce", icon: Users, label: "Workforce" },
            { id: "finance", icon: Wallet, label: "Finance" },
            { id: "reports", icon: FileBarChart, label: "Reports" },
          ].map((item) => {
            const Icon = item.icon;
            const selected = activeActivity === item.id;

            return (
              <button
                key={item.id}
                title={item.label}
                onClick={() => {
                  setActiveActivity(item.id);
                  setSidebarOpen(true);
                }}
                className={`relative mb-1 flex h-11 w-12 items-center justify-center transition ${
                  selected
                    ? "text-white"
                    : "text-zinc-600 hover:text-zinc-300"
                }`}
              >
                {selected && (
                  <span className="absolute bottom-2 left-0 top-2 w-[2px] rounded-r bg-cyan-400" />
                )}
                <Icon size={21} strokeWidth={selected ? 1.8 : 1.5} />
              </button>
            );
          })}

          <div className="mt-auto flex flex-col items-center gap-1">
            <button
              title="Help"
              onClick={() => setNotice("Help center integration is not configured yet.")}
              className="flex h-10 w-12 items-center justify-center text-zinc-600 hover:text-zinc-300"
            >
              <CircleHelp size={19} />
            </button>
            <button
              title="Account settings"
              onClick={() => selectModule("Settings")}
              className="flex h-10 w-12 items-center justify-center text-zinc-500 hover:text-white"
            >
              <Settings size={20} />
            </button>
          </div>
        </aside>

        {/* Explorer */}
        {sidebarOpen && (
          <aside className="flex w-52 shrink-0 flex-col border-r border-white/[0.08] bg-[#18191e] sm:w-60">
            <div className="flex h-10 items-center justify-between px-4">
              <span className="text-[10px] font-semibold tracking-[0.16em] text-zinc-400">
                {activeActivity === "explorer" ? "EXPLORER" : activeActivity.toUpperCase()}
              </span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="text-zinc-600 hover:text-zinc-300"
                aria-label="Collapse explorer"
              >
                <PanelLeftClose size={15} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 pb-4">
              <div className="mb-2 flex items-center gap-1 px-2 py-2 text-[10px] font-semibold tracking-widest text-zinc-500">
                <ChevronDown size={13} />
                APEXIVEAI WORKSPACE
              </div>

              {modules
                .filter((module) => {
                  if (
                    module.name === "Users"
                    && !["SUPER_ADMIN", "COMPANY_ADMIN"].includes(user?.role ?? "")
                  ) {
                    return false;
                  }
                  if (activeActivity === "workforce") {
                    return ["Employees", "Attendance", "Shifts", "Sites"].includes(module.name);
                  }
                  if (activeActivity === "finance") {
                    return ["Payroll", "Payments"].includes(module.name);
                  }
                  if (activeActivity === "reports") {
                    return ["Reports", "Audit Logs"].includes(module.name);
                  }
                  return true;
                })
                .map((module, index, list) => {
                  const Icon = module.icon;
                  const showGroup =
                    index === 0 || list[index - 1].group !== module.group;

                  return (
                    <div key={module.name}>
                      {showGroup && (
                        <div className="mb-1 mt-4 flex items-center gap-1 px-2 text-[9px] font-semibold tracking-[0.15em] text-zinc-600">
                          <ChevronRight size={11} />
                          {module.group}
                        </div>
                      )}
                      <button
                        onClick={() => selectModule(module.name)}
                        className={`flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-xs transition ${
                          activeModule === module.name
                            ? "bg-cyan-500/[0.10] text-cyan-300"
                            : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-200"
                        }`}
                      >
                        <Icon size={15} />
                        <span className="flex-1">{module.name}</span>
                        {activeModule === module.name && (
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
                        )}
                      </button>
                    </div>
                  );
                })}

              <div className="mt-7 border-t border-white/[0.07] pt-4">
                <div className="mb-3 px-2 text-[9px] font-semibold tracking-[0.15em] text-zinc-600">
                  WORKSPACE INFO
                </div>
                <div className="space-y-3 px-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500">Access level</span>
                    <span className="text-cyan-300">{user.role}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-zinc-500">Environment</span>
                    <span className="text-zinc-300">Development</span>
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={logout}
              className="flex h-11 shrink-0 items-center gap-2 border-t border-white/[0.08] px-4 text-xs text-zinc-500 hover:bg-red-400/[0.05] hover:text-red-300"
            >
              <LogOut size={15} />
              Sign out
            </button>
          </aside>
        )}

        {/* Main editor */}
        <section className="flex min-w-0 flex-1 flex-col bg-[#101114]">
          {/* Tabs */}
          <div className="flex h-10 shrink-0 items-stretch overflow-x-auto border-b border-white/[0.08] bg-[#18191e]">
            {openTabs.map((tab) => {
              const moduleItem = modules.find((item) => item.name === tab);
              const Icon = moduleItem?.icon ?? Terminal;

              return (
                <div
                  key={tab}
                  className={`group flex shrink-0 items-center gap-2 border-r border-white/[0.06] px-3 text-xs ${
                    activeModule === tab
                      ? "border-t-2 border-t-cyan-400 bg-[#101114] text-zinc-100"
                      : "border-t-2 border-t-transparent text-zinc-500 hover:bg-white/[0.025]"
                  }`}
                >
                  <button
                    onClick={() => selectModule(tab)}
                    className="flex items-center gap-2"
                  >
                    <Icon size={14} />
                    {tab}
                  </button>
                  {tab !== "Overview" && (
                    <button
                      onClick={() => closeTab(tab)}
                      title={`Close ${tab}`}
                      className="rounded p-0.5 opacity-50 hover:bg-white/10 hover:opacity-100"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
              );
            })}
            <button
              onClick={() => {
                setCommandOpen(true);
                setCommandQuery("");
              }}
              className="flex items-center px-3 text-zinc-600 hover:text-zinc-300"
              title="Open module"
            >
              <Plus size={15} />
            </button>
          </div>

          {/* Breadcrumb */}
          <div className="flex h-8 shrink-0 items-center gap-2 border-b border-white/[0.05] px-5 text-[10px] text-zinc-600">
            <span>apexiveai</span>
            <ChevronRight size={12} />
            <span>workforce</span>
            <ChevronRight size={12} />
            <span className="text-cyan-400/80">{activeModule.toLowerCase()}</span>
          </div>

          {/* Scrollable content */}
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl p-5 sm:p-8">
              <div className="mb-7 flex flex-wrap items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex items-center gap-2 text-[10px] font-medium tracking-[0.2em] text-cyan-400">
                    <Activity size={13} />
                    WORKFORCE INTELLIGENCE
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight text-zinc-100 sm:text-3xl">
                    {activeModule === "Overview"
                      ? "Command Center"
                      : activeModule}
                  </h1>
                  <p className="mt-2 max-w-xl text-xs leading-5 text-zinc-500">
                    {activeModule === "Overview"
                      ? "Monitor your workforce operations from one unified workspace."
                      : `Manage ${activeModule.toLowerCase()} within your authorized workspace.`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setOutputOpen((value) => !value)}
                    className="flex h-9 items-center gap-2 rounded-lg border border-white/10 bg-white/[0.025] px-3 text-xs text-zinc-400 hover:border-white/20 hover:text-white"
                  >
                    <Terminal size={14} />
                    Console
                  </button>
                  <button
                    onClick={() => runAction(
                      activeModule === "Overview"
                        ? "New employee"
                        : activeModule === "Employees"
                          ? "New employee"
                          : activeModule,
                    )}
                    className="flex h-9 items-center gap-2 rounded-lg bg-cyan-400 px-3 text-xs font-semibold text-[#071014] transition hover:bg-cyan-300"
                  >
                    <Plus size={15} />
                    Open module
                  </button>
                </div>
              </div>

              {notice && (
                <div className="mb-5 flex items-start justify-between gap-3 rounded-lg border border-cyan-500/20 bg-cyan-500/[0.05] px-4 py-3 text-xs leading-5 text-cyan-100">
                  <span>{notice}</span>
                  <div className="flex shrink-0 items-center gap-3">
                    {logoutPending && (
                      <button
                        onClick={() => { clearAuth(); router.replace("/login"); }}
                        className="underline underline-offset-2"
                      >
                        Sign out locally
                      </button>
                    )}
                    <button
                      onClick={() => { setNotice(""); setLogoutPending(false); }}
                      aria-label="Dismiss"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              )}

              {activeModule === "Overview" ? (
                <>
                  {/* Summary cards */}
                  <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {stats.map((stat, index) => {
                      const Icon = stat.icon;

                      return (
                        <div
                          key={stat.label}
                          className="rounded-xl border border-white/[0.08] bg-[#18191e] p-4 transition hover:border-cyan-500/25"
                        >
                          <div className="mb-5 flex items-center justify-between">
                            <span className="text-[9px] font-medium tracking-[0.12em] text-zinc-500">
                              {stat.label}
                            </span>
                            <div className="rounded-lg border border-white/[0.06] bg-white/[0.025] p-2 text-cyan-400">
                              <Icon size={16} />
                            </div>
                          </div>
                          <div className="text-2xl font-semibold text-zinc-100">
                            {stat.value}
                          </div>
                          <div className="mt-2 text-[10px] text-zinc-600">
                            {stat.note}
                          </div>
                          {index === 3 && dashboardSummary && (
                            <div className="mt-4 flex items-center gap-1.5 text-[10px] text-emerald-400">
                              <Check size={12} />
                              Live database metrics
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Quick actions and system health */}
                  <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.35fr_0.85fr]">
                    <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#18191e]">
                      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                        <div>
                          <h2 className="text-sm font-medium text-zinc-200">
                            Quick Actions
                          </h2>
                          <p className="mt-1 text-[10px] text-zinc-600">
                            Open a workspace to continue
                          </p>
                        </div>
                        <Zap size={16} className="text-cyan-400" />
                      </div>

                      <div className="grid grid-cols-1 gap-2 p-4 sm:grid-cols-2">
                        {[
                          {
                            title: "New employee",
                            description: "Employee records and profiles",
                            icon: Users,
                          },
                          {
                            title: "Record attendance",
                            description: "Daily workforce attendance",
                            icon: CalendarCheck,
                          },
                          {
                            title: "Process payroll",
                            description: "Salary and payroll processing",
                            icon: Wallet,
                          },
                          {
                            title: "View reports",
                            description: "Operational reports and analytics",
                            icon: FileBarChart,
                          },
                        ].map((action) => {
                          const Icon = action.icon;

                          return (
                            <button
                              key={action.title}
                              onClick={() => runAction(action.title)}
                              className="group flex items-center gap-3 rounded-lg border border-white/[0.06] bg-white/[0.015] p-4 text-left transition hover:border-cyan-500/25 hover:bg-cyan-500/[0.035]"
                            >
                              <div className="rounded-lg bg-cyan-400/[0.08] p-2.5 text-cyan-400">
                                <Icon size={17} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="text-xs font-medium text-zinc-200">
                                  {action.title}
                                </div>
                                <div className="mt-1 text-[10px] leading-4 text-zinc-600">
                                  {action.description}
                                </div>
                              </div>
                              <ArrowRight
                                size={14}
                                className="shrink-0 text-zinc-700 transition group-hover:translate-x-0.5 group-hover:text-cyan-400"
                              />
                            </button>
                          );
                        })}
                      </div>
                    </section>

                    <section className="rounded-xl border border-white/[0.08] bg-[#18191e]">
                      <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                        <div>
                          <h2 className="text-sm font-medium text-zinc-200">
                            System Diagnostics
                          </h2>
                          <p className="mt-1 text-[10px] text-zinc-600">
                            Application connectivity
                          </p>
                        </div>
                        <Gauge size={17} className="text-cyan-400" />
                      </div>

                      <div className="space-y-4 p-5">
                        {[
                          {
                            name: "Authentication API",
                            value: apiStatus,
                            good: apiStatus === "CONNECTED",
                          },
                          {
                            name: "User session",
                            value: "VERIFIED",
                            good: true,
                          },
                          {
                            name: "Database",
                            value: databaseStatus,
                            good: databaseStatus === "CONNECTED",
                          },
                          {
                            name: "Workforce API",
                            value: apiStatus,
                            good: apiStatus === "CONNECTED",
                          },
                        ].map((item) => (
                          <div
                            key={item.name}
                            className="flex items-center justify-between gap-2"
                          >
                            <div className="flex items-center gap-2 text-xs text-zinc-400">
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  item.good
                                    ? "bg-emerald-400"
                                    : "bg-amber-400"
                                }`}
                              />
                              {item.name}
                            </div>
                            <span
                              className={`text-[9px] font-medium tracking-wide ${
                                item.good
                                  ? "text-emerald-400"
                                  : "text-amber-400"
                              }`}
                            >
                              {item.value}
                            </span>
                          </div>
                        ))}

                        <div className="mt-5 rounded-lg border border-white/[0.06] bg-black/10 p-3">
                          <div className="mb-2 flex items-center gap-2 text-[10px] text-zinc-500">
                            <ShieldCheck size={13} />
                            Current session
                          </div>
                          <div className="truncate text-xs text-zinc-300">
                            {user.full_name}
                          </div>
                          <div className="mt-1 text-[10px] text-cyan-400">
                            {user.role}
                          </div>
                        </div>
                      </div>
                    </section>
                  </div>

                  <section className="mt-5 rounded-xl border border-white/[0.08] bg-[#18191e]">
                    <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                      <div>
                        <h2 className="text-sm font-medium text-zinc-200">
                          Operations Activity
                        </h2>
                        <p className="mt-1 text-[10px] text-zinc-600">
                          Recent audit events recorded for this company.
                        </p>
                      </div>
                      <FileClock size={17} className="text-zinc-500" />
                    </div>
                    {auditEntries.length > 0 ? (
                      <ul className="divide-y divide-white/[0.05]">
                        {auditEntries.map((entry) => (
                          <li key={entry.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                            <span className="text-xs text-zinc-300">
                              {entry.action.replaceAll(".", " ")} · {entry.resource_type}
                            </span>
                            <time className="text-[10px] text-zinc-600">
                              {new Intl.DateTimeFormat("en-GB", {
                                dateStyle: "medium",
                                timeStyle: "short",
                              }).format(new Date(entry.created_at))}
                            </time>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <div className="flex min-h-28 flex-col items-center justify-center gap-2 p-6 text-center">
                        <Activity size={20} className="text-zinc-700" />
                        <p className="text-xs text-zinc-500">No audit activity recorded yet</p>
                      </div>
                    )}
                  </section>
                </>
              ) : (
                <section className="overflow-hidden rounded-xl border border-white/[0.08] bg-[#18191e]">
                  <div className="flex items-center gap-3 border-b border-white/[0.07] p-5">
                    <div className="rounded-lg bg-cyan-400/[0.08] p-3 text-cyan-400">
                      {(() => {
                        const Icon =
                          modules.find((module) => module.name === activeModule)?.icon ??
                          Terminal;
                        return <Icon size={21} />;
                      })()}
                    </div>
                    <div>
                      <h2 className="text-sm font-medium text-zinc-200">
                        {activeModule} Workspace
                      </h2>
                      <p className="mt-1 text-[10px] text-zinc-600">
                        Module shell initialized
                      </p>
                    </div>
                  </div>

                  <div className="p-6 sm:p-8">
                    <div className="max-w-xl">
                      <div className="mb-3 flex items-center gap-2 text-xs text-amber-400">
                        <Activity size={15} />
                        Backend integration pending
                      </div>
                      <p className="text-sm leading-6 text-zinc-400">
                        This workspace is ready for its module interface.
                        Live records, create/edit actions and reporting will
                        be added when the corresponding API endpoints and
                        permission rules are implemented.
                      </p>
                      <div className="mt-6 flex flex-wrap gap-2">
                        <button
                          onClick={() => {
                            setOutputOpen(true);
                            setOutputTab("OUTPUT");
                            setNotice(`${activeModule} is selected. No records have been created.`);
                          }}
                          className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-300 hover:bg-white/[0.04]"
                        >
                          <Terminal size={14} />
                          View output
                        </button>
                        <button
                          onClick={() => selectModule("Overview")}
                          className="flex items-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-medium text-[#071014] hover:bg-cyan-300"
                        >
                          Back to overview
                          <ArrowRight size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* Integrated output / console */}
          {outputOpen && (
            <section className="flex h-44 shrink-0 flex-col border-t border-white/[0.09] bg-[#141519] sm:h-48">
              <div className="flex h-9 shrink-0 items-center justify-between border-b border-white/[0.06] px-4">
                <div className="flex h-full items-stretch gap-4">
                  {["OUTPUT", "TERMINAL", "PROBLEMS"].map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setOutputTab(tab)}
                      className={`border-b-2 text-[9px] font-medium tracking-[0.13em] ${
                        outputTab === tab
                          ? "border-cyan-400 text-zinc-200"
                          : "border-transparent text-zinc-600 hover:text-zinc-300"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setOutputOpen(false)}
                  className="text-zinc-600 hover:text-white"
                  aria-label="Close output panel"
                >
                  <X size={14} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 font-mono text-[10px] leading-5">
                {outputTab === "OUTPUT" && (
                  <>
                    <div className="text-zinc-500">
                      [workspace] ApexiveAI Workforce Payroll initialized
                    </div>
                    <div className="text-zinc-500">
                      [auth] Current user verified via GET /auth/me
                    </div>
                    <div className={apiStatus === "CONNECTED" ? "text-emerald-400" : "text-amber-400"}>
                      [api] Authentication: {apiStatus}
                    </div>
                    <div className="text-zinc-600">
                      [data] Workforce records are served by the connected API
                    </div>
                    <div className="text-zinc-600">
                      [security] No live database health check has been performed by this panel
                    </div>
                  </>
                )}
                {outputTab === "TERMINAL" && (
                  <div className="text-zinc-500">
                    <span className="text-emerald-400">workspace</span>
                    {" > "}Frontend workspace ready. Use the VS Code terminal to run development commands.
                  </div>
                )}
                {outputTab === "PROBLEMS" && (
                  <div className="text-zinc-500">
                    <Check size={13} className="mr-2 inline text-emerald-400" />
                    No client-side issues reported by this workspace panel.
                  </div>
                )}
              </div>
            </section>
          )}
        </section>
      </div>

      {/* Status bar */}
      <footer className="flex h-6 shrink-0 items-center justify-between bg-[#087e8b] px-2 text-[9px] text-white">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={() => setSidebarOpen((value) => !value)}
            className="flex items-center gap-1 hover:text-cyan-100"
          >
            <PanelLeftClose size={12} />
            <span className="hidden sm:inline">Workspace</span>
          </button>
          <span className="hidden items-center gap-1 sm:flex">
            <Check size={11} /> Session verified
          </span>
          <span className="truncate">{activeModule}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden sm:inline">{apiStatus}</span>
          <span>{clock}</span>
          <button
            onClick={() => setNotice("ApexiveAI Workforce Payroll · Desktop-ready workspace shell.")}
            title="Application information"
            className="flex items-center gap-1 hover:text-cyan-100"
          >
            <ArrowUpRight size={11} />
            <span className="hidden sm:inline">ApexiveAI</span>
          </button>
        </div>
      </footer>

      {/* Command palette */}
      {commandOpen && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/65 px-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setCommandOpen(false);
            }
          }}
        >
          <div className="w-full max-w-lg overflow-hidden rounded-xl border border-white/10 bg-[#1b1c22] shadow-2xl shadow-black/50">
            <div className="flex items-center gap-3 border-b border-white/[0.08] px-4">
              <Search size={17} className="text-cyan-400" />
              <input
                autoFocus
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") setCommandOpen(false);
                  if (event.key === "Enter" && filteredModules[0]) {
                    selectModule(filteredModules[0].name);
                    setCommandOpen(false);
                  }
                }}
                placeholder="Search modules and commands..."
                className="h-12 min-w-0 flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
              />
              <kbd className="rounded border border-white/10 px-1.5 py-1 text-[10px] text-zinc-500">
                ESC
              </kbd>
            </div>
            <div className="max-h-72 overflow-y-auto p-2">
              <div className="px-2 py-2 text-[9px] font-semibold tracking-widest text-zinc-600">
                WORKSPACE MODULES
              </div>
              {filteredModules.map((module) => {
                const Icon = module.icon;

                return (
                  <button
                    key={module.name}
                    onClick={() => {
                      selectModule(module.name);
                      setCommandOpen(false);
                    }}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-xs text-zinc-300 hover:bg-cyan-400/[0.08] hover:text-cyan-200"
                  >
                    <Icon size={15} />
                    <span className="flex-1">{module.name}</span>
                    <span className="text-[9px] text-zinc-600">{module.group}</span>
                  </button>
                );
              })}
              {filteredModules.length === 0 && (
                <div className="px-3 py-6 text-center text-xs text-zinc-600">
                  No matching modules found.
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-white/[0.07] px-4 py-2.5 text-[9px] text-zinc-600">
              <span>ENTER Select module</span>
              <span>ESC Close palette</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
