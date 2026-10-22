"use client";

import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { StatusBadge } from "@/components/page";

type Ticket = {
  id: number;
  code: string;
  status: string;
  resolution: string | null;
  finding: {
    code: string;
    title: string;
    description: string;
    area: { name: string } | null;
  };
};
export function GaTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    try {
      setTickets(await api<Ticket[]>("/it-support/ga-tickets"));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tiket gagal dimuat.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function update(ticket: Ticket, action: string) {
    const resolution =
      action === "resolve" ? window.prompt("Hasil penanganan") : undefined;
    if (action === "resolve" && !resolution?.trim()) return;
    try {
      await api(`/it-support/ga-tickets/${ticket.id}/${action}`, {
        method: "POST",
        body: resolution ? JSON.stringify({ resolution }) : undefined,
      });
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tiket gagal diperbarui.");
    }
  }
  return (
    <section className="card mb-5 p-5">
      <h2 className="font-semibold">Tiket dari temuan GA</h2>
      <p className="text-sm text-slate-500">
        Hasil penanganan ditampilkan kembali pada temuan GA.
      </p>
      {error && (
        <p role="alert" className="mt-2 text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="mt-3 divide-y">
        {tickets.map((t) => (
          <div
            className="flex flex-wrap items-center justify-between gap-3 py-3"
            key={t.id}
          >
            <div>
              <b>
                {t.code} · {t.finding.title}
              </b>
              <p className="text-sm text-slate-500">
                {t.finding.code} ·{" "}
                {t.finding.area?.name || "Area tidak ditentukan"}
              </p>
              <p className="text-sm">{t.finding.description}</p>
              {t.resolution && (
                <p className="text-sm text-emerald-700">
                  Penanganan: {t.resolution}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <StatusBadge value={t.status} />
              {t.status === "OPEN" && (
                <button
                  className="btn-secondary"
                  onClick={() => void update(t, "start")}
                >
                  Proses
                </button>
              )}
              {t.status === "IN_PROGRESS" && (
                <button
                  className="btn-primary"
                  onClick={() => void update(t, "resolve")}
                >
                  Selesaikan
                </button>
              )}
            </div>
          </div>
        ))}
        {!tickets.length && (
          <p className="py-3 text-sm text-slate-500">
            Belum ada tiket dari GA.
          </p>
        )}
      </div>
    </section>
  );
}
