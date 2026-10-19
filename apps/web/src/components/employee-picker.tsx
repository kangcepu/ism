"use client";

import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/api";

export type EmployeeSelection = {
  assigneeName: string;
  assigneeCode: string;
  company: string;
};
type Employee = { fullname: string; employeeCode: string; company: string };
type Result = {
  employees: Employee[];
  enabled: boolean;
  stale: boolean;
  cached: boolean;
  partial: boolean;
};
const empty: EmployeeSelection = {
  assigneeName: "",
  assigneeCode: "",
  company: "",
};

export function EmployeePicker({
  value,
  onChange,
}: {
  value: EmployeeSelection;
  onChange: (value: EmployeeSelection) => void;
}) {
  const [query, setQuery] = useState(value.assigneeName);
  const [results, setResults] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [problem, setProblem] = useState("");
  const [stale, setStale] = useState(false);
  const [partial, setPartial] = useState(false);
  const [manual, setManual] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.setCustomValidity(
      manual || value.assigneeName
        ? ""
        : "Pilih karyawan dari hasil pencarian.",
    );
  }, [manual, value.assigneeName]);
  useEffect(() => {
    if (manual || value.assigneeName || query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      setSearched(false);
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setProblem("");
      api<Result>(
        `/hr/employees?q=${encodeURIComponent(query.trim())}&limit=30`,
        { signal: controller.signal },
      )
        .then((result) => {
          setResults(result.employees);
          setStale(result.stale);
          setPartial(result.partial);
          setSearched(true);
          if (!result.enabled)
            setProblem("HR Directory belum aktif. Hubungi administrator.");
        })
        .catch((error) => {
          if (!controller.signal.aborted) {
            setResults([]);
            setSearched(true);
            setProblem(
              error instanceof ApiError
                ? error.message
                : "HR Directory tidak dapat dihubungi.",
            );
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query, value.assigneeName, manual]);
  if (manual)
    return (
      <div className="space-y-3 sm:col-span-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-amber-700">
            Gunakan data manual saat HR Directory tidak tersedia.
          </p>
          <button
            type="button"
            className="text-xs text-blue-700 underline"
            onClick={() => {
              setManual(false);
              setQuery("");
              onChange(empty);
            }}
          >
            Cari karyawan
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {(
            [
              ["assigneeName", "Nama karyawan"],
              ["assigneeCode", "Kode karyawan"],
              ["company", "Company"],
            ] as const
          ).map(([key, label]) => (
            <label key={key}>
              <span className="label">{label}</span>
              <input
                className="input"
                required={key === "assigneeName"}
                value={value[key]}
                onChange={(e) => onChange({ ...value, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
      </div>
    );
  return (
    <div className="space-y-2 sm:col-span-2">
      <label className="block">
        <span className="label">Cari karyawan HR</span>
        <input
          ref={input}
          className="input"
          required
          autoComplete="off"
          placeholder="Ketik nama atau kode karyawan"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setProblem("");
            setStale(false);
            setPartial(false);
            if (value.assigneeName) onChange(empty);
          }}
        />
      </label>
      {value.assigneeName && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
          <p className="font-semibold text-blue-900">{value.assigneeName}</p>
          <p className="mt-1 text-xs text-blue-700">
            {[value.assigneeCode, value.company].filter(Boolean).join(" · ") ||
              "Kode dan company tidak tersedia"}
          </p>
        </div>
      )}
      {loading && <p className="text-xs text-slate-500">Mencari karyawan…</p>}
      {!loading && stale && (
        <p className="text-xs text-amber-700">
          HR sedang tidak tersedia; hasil berasal dari cache dan mungkin tidak
          terbaru.
        </p>
      )}
      {!loading && partial && !stale && (
        <p className="text-xs text-amber-700">
          Sebagian sumber HR tidak merespons; hasil mungkin belum lengkap.
        </p>
      )}
      {problem && (
        <p role="status" className="text-xs text-amber-700">
          {problem}
        </p>
      )}
      {!loading && searched && !problem && !results.length && (
        <p className="text-xs text-slate-500">Karyawan tidak ditemukan.</p>
      )}
      {results.length > 0 && (
        <div className="max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white">
          {results.map((employee, index) => (
            <button
              type="button"
              key={`${employee.employeeCode}-${employee.company}-${index}`}
              className="block w-full border-b border-slate-100 px-3 py-2 text-left last:border-0 hover:bg-blue-50"
              onClick={() => {
                setQuery(employee.fullname);
                setResults([]);
                onChange({
                  assigneeName: employee.fullname,
                  assigneeCode: employee.employeeCode,
                  company: employee.company,
                });
              }}
            >
              <span className="block text-sm font-medium text-slate-800">
                {employee.fullname}
              </span>
              <span className="block text-xs text-slate-500">
                {[employee.employeeCode, employee.company]
                  .filter(Boolean)
                  .join(" · ") || "Kode dan company tidak tersedia"}
              </span>
            </button>
          ))}
        </div>
      )}
      {(problem || stale || partial) && (
        <button
          type="button"
          className="text-xs text-blue-700 underline"
          onClick={() => {
            setManual(true);
            onChange({ ...empty, assigneeName: query.trim() });
          }}
        >
          Isi data manual
        </button>
      )}
    </div>
  );
}
