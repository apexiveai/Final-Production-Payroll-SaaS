"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { isAxiosError } from "axios";
import {
  ArrowRight,
  Building2,
  Eye,
  EyeOff,
  LockKeyhole,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import api from "@/lib/api";
import { saveAuth } from "@/lib/auth";
import type { LoginResponse } from "@/types/auth";

export default function LoginPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");

  const [password, setPassword] = useState("");

  const [showPassword, setShowPassword] =
    useState(false);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response =
        await api.post<LoginResponse>(
          "/auth/login",
          {
            username,
            password,
          },
        );

      saveAuth(
        response.data.access_token,
        response.data.user,
      );

      router.replace("/dashboard");
    } catch (error: unknown) {
      const message = isAxiosError<{ detail?: string }>(error)
        ? error.response?.data?.detail
        : undefined;

      setError(message || "Unable to sign in. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#05070b] text-white">
      <div className="grid min-h-screen lg:grid-cols-[1.15fr_0.85fr]">

        <section className="relative hidden overflow-hidden border-r border-white/10 lg:flex">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(59,130,246,0.20),transparent_35%),radial-gradient(circle_at_80%_80%,rgba(14,165,233,0.12),transparent_35%)]" />

          <div className="relative z-10 flex w-full flex-col justify-between p-12">

            <div>
              <div className="mb-10 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-2xl">
                  <Building2 size={21} />
                </div>

                <div>
                  <div className="text-sm font-semibold tracking-[0.25em]">
                    APEXIVEAI
                  </div>

                  <div className="text-xs text-white/40">
                    WORKFORCE PLATFORM
                  </div>
                </div>
              </div>

              <div className="max-w-2xl">
                <p className="mb-5 text-xs font-semibold uppercase tracking-[0.35em] text-sky-400">
                  Workforce Intelligence
                </p>

                <h1 className="text-6xl font-semibold leading-[1.02] tracking-tight">
                  Attendance.
                  <br />
                  Payroll.
                  <br />
                  Workforce.
                </h1>

                <p className="mt-7 max-w-xl text-base leading-7 text-white/50">
                  A centralized workforce management
                  platform for companies, sites,
                  employees, attendance and payroll
                  operations.
                </p>
              </div>
            </div>

            <div className="grid max-w-xl grid-cols-3 gap-3">
              {[
                ["01", "Attendance"],
                ["02", "Payroll"],
                ["03", "Analytics"],
              ].map(([number, label]) => (
                <div
                  key={number}
                  className="rounded-2xl border border-white/10 bg-white/[0.025] p-4 backdrop-blur"
                >
                  <div className="text-xs text-white/30">
                    {number}
                  </div>

                  <div className="mt-6 text-sm text-white/70">
                    {label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-12">
          <div className="w-full max-w-md">

            <div className="mb-10">
              <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5">
                <ShieldCheck size={23} />
              </div>

              <p className="text-xs font-semibold uppercase tracking-[0.3em] text-sky-400">
                Secure Access
              </p>

              <h2 className="mt-3 text-3xl font-semibold tracking-tight">
                Welcome back
              </h2>

              <p className="mt-2 text-sm text-white/40">
                Sign in to your workforce workspace.
              </p>
            </div>

            <form
              onSubmit={handleSubmit}
              className="space-y-5"
            >
              <div>
                <label className="mb-2 block text-xs font-medium text-white/50">
                  Username
                </label>

                <div className="relative">
                  <UserRound
                    size={17}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
                  />

                  <input
                    value={username}
                    onChange={(event) =>
                      setUsername(event.target.value)
                    }
                    autoComplete="username"
                    className="h-13 w-full rounded-2xl border border-white/10 bg-white/[0.035] pl-11 pr-4 text-sm outline-none transition focus:border-sky-500/60 focus:bg-white/[0.055]"
                    placeholder="Enter username"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-xs font-medium text-white/50">
                  Password
                </label>

                <div className="relative">
                  <LockKeyhole
                    size={17}
                    className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30"
                  />

                  <input
                    type={
                      showPassword
                        ? "text"
                        : "password"
                    }
                    value={password}
                    onChange={(event) =>
                      setPassword(event.target.value)
                    }
                    autoComplete="current-password"
                    className="h-13 w-full rounded-2xl border border-white/10 bg-white/[0.035] pl-11 pr-12 text-sm outline-none transition focus:border-sky-500/60 focus:bg-white/[0.055]"
                    placeholder="Enter password"
                  />

                  <button
                    type="button"
                    onClick={() =>
                      setShowPassword(
                        (value) => !value,
                      )
                    }
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-white/30 transition hover:text-white/70"
                  >
                    {showPassword ? (
                      <EyeOff size={17} />
                    ) : (
                      <Eye size={17} />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="group flex h-13 w-full items-center justify-center gap-3 rounded-2xl bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? "Signing in..."
                  : "Sign in"}

                {!loading && (
                  <ArrowRight
                    size={17}
                    className="transition-transform group-hover:translate-x-1"
                  />
                )}
              </button>
            </form>

            <div className="mt-8 border-t border-white/10 pt-6">
              <div className="flex items-center justify-between text-[11px] text-white/25">
                <span>
                  ApexiveAI Workforce Payroll
                </span>

                <span>
                  v1.0.0
                </span>
              </div>
            </div>

          </div>
        </section>

      </div>
    </main>
  );
}