"use client";
import { useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { PageHeader } from "@/components/page";

type Draft = {
  name: string;
  quantity: number;
  category: string;
  location: string;
  description: string;
};
type Validation = { valid: boolean; errors: string[]; warnings: string[] };
type Diagnosis = {
  answer: string;
  model: string;
  toolsUsed: string[];
  responseTimeMs: number;
  toolResults: Record<
    string,
    {
      matchedTotal: number;
      items: Array<{
        id: number;
        name: string;
        code?: string;
        host?: string;
        status?: string;
        lastStatus?: string;
        assigneeName?: string | null;
        category?: { name: string };
        location?: { name: string } | string | null;
      }>;
    }
  >;
  verified: {
    entries: Array<{
      source: string;
      matchedTotal: number;
      statusBreakdown?: Array<{ status: string; count: number }>;
    }>;
    generatedAt: string;
  };
};
type Created = { id: number; code: string };
type ChatHistory = {
  id: string;
  question: string;
  answer: string;
  model: string;
  createdAt: string;
};
export default function AiPage() {
  const { user } = useAuth();
  const [mode, setMode] = useState<"chat" | "draft">("chat");
  const [prompt, setPrompt] = useState("");
  const [answer, setAnswer] = useState<Diagnosis | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [validation, setValidation] = useState<Validation | null>(null);
  const [created, setCreated] = useState<Created[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<ChatHistory[]>([]);
  async function loadHistory() {
    try {
      setHistory(await api<ChatHistory[]>("/ai/chats"));
    } catch {
      setHistory([]);
    }
  }
  useEffect(() => {
    void loadHistory();
  }, []);
  async function removeHistory(id: string) {
    try {
      await api(`/ai/chats/${id}`, { method: "DELETE" });
      await loadHistory();
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Riwayat tidak dapat dihapus.",
      );
    }
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setAnswer(null);
    setDraft(null);
    setValidation(null);
    setCreated([]);
    try {
      if (mode === "chat") {
        const result = await api<Diagnosis>("/ai/diagnoses", {
          method: "POST",
          body: JSON.stringify({ prompt }),
        });
        setAnswer(result);
        setPrompt("");
        await loadHistory();
      } else
        setDraft(
          (
            await api<{ draft: Draft }>("/ai/asset-drafts", {
              method: "POST",
              body: JSON.stringify({ prompt }),
            })
          ).draft,
        );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Permintaan AI gagal.");
    } finally {
      setBusy(false);
    }
  }
  async function validate() {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      setValidation(
        await api<Validation>("/ai/asset-drafts/validate", {
          method: "POST",
          body: JSON.stringify(draft),
        }),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Validasi gagal.");
    } finally {
      setBusy(false);
    }
  }
  async function execute() {
    if (
      !draft ||
      !validation?.valid ||
      !window.confirm(
        `Buat ${draft.quantity} aset ${draft.name} di kategori ${draft.category} dan lokasi ${draft.location}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ created: Created[] }>("/ai/actions", {
        method: "POST",
        body: JSON.stringify({ type: "create-assets", draft }),
      });
      setCreated(result.created);
      setValidation(null);
      setDraft(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Pembuatan aset gagal.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="AI Assistant"
        description="Tanyakan ringkasan inventaris atau siapkan draft aset dengan Ollama."
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      <section className="card p-5">
        <div className="flex gap-2">
          <button
            type="button"
            className={mode === "chat" ? "btn-primary" : "btn-secondary"}
            onClick={() => {
              setMode("chat");
              setAnswer(null);
              setDraft(null);
              setValidation(null);
            }}
          >
            Tanya AI
          </button>
          <button
            type="button"
            className={mode === "draft" ? "btn-primary" : "btn-secondary"}
            onClick={() => {
              setMode("draft");
              setAnswer(null);
              setDraft(null);
              setValidation(null);
            }}
          >
            Draft Aset
          </button>
        </div>
        <form onSubmit={submit} className="mt-4">
          <label className="block text-sm">
            {mode === "chat" ? "Pertanyaan" : "Deskripsi aset"}
            <textarea
              className="input mt-1 min-h-28 w-full"
              required
              maxLength={4000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
            />
          </label>
          <button className="btn-primary mt-3" disabled={busy}>
            {busy ? "Memproses…" : mode === "chat" ? "Kirim" : "Buat Draft"}
          </button>
          {busy && (
            <p role="status" className="mt-2 text-sm text-slate-500">
              AI sedang memproses data. Waktu respons bergantung pada model dan
              server.
            </p>
          )}
        </form>
        {answer && (
          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <div className="mb-4 space-y-2">
              {answer.verified.entries.map((entry) => (
                <div
                  key={entry.source}
                  className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-950"
                >
                  <p className="font-semibold">
                    Data terverifikasi: {entry.matchedTotal}{" "}
                    {entry.source === "inventory-search"
                      ? "aset"
                      : "perangkat monitoring"}{" "}
                    ditemukan.
                  </p>
                  {entry.statusBreakdown?.length ? (
                    <p className="mt-1 text-xs text-blue-800">
                      {entry.statusBreakdown
                        .map((item) => `${item.status}: ${item.count}`)
                        .join(" · ")}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
            <p className="whitespace-pre-wrap text-sm">{answer.answer}</p>
            <p className="mt-3 text-xs text-slate-500">
              Model: {answer.model} · Data: {answer.toolsUsed.join(", ")} ·{" "}
              {(answer.responseTimeMs / 1000).toFixed(1)} detik
            </p>
            {Object.entries(answer.toolResults || {}).map(([tool, result]) => (
              <details key={tool} className="mt-4 border-t pt-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  Data ditemukan: {result.matchedTotal}{" "}
                  {result.matchedTotal > result.items.length
                    ? `(menampilkan ${result.items.length})`
                    : ""}
                </summary>
                {result.items.length > 0 && (
                  <ul className="mt-2 space-y-2">
                    {result.items.map((item) => (
                      <li key={item.id}>
                        <a
                          className="font-medium text-blue-700 hover:underline"
                          href={
                            tool === "inventory-search"
                              ? `/assets/${item.id}`
                              : `/monitoring/${item.id}`
                          }
                        >
                          {item.code || item.host} · {item.name}
                        </a>
                        <span className="text-slate-500">
                          {" "}
                          · {item.status || item.lastStatus}
                          {item.assigneeName ? ` · ${item.assigneeName}` : ""}
                          {item.location
                            ? ` · ${typeof item.location === "string" ? item.location : item.location.name}`
                            : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </details>
            ))}
          </div>
        )}
        <section className="mt-5 border-t pt-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Riwayat percakapan</h2>
              <p className="text-xs text-slate-500">
                Tersimpan hanya untuk akun kamu.
              </p>
            </div>
            {history.length > 0 && (
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void loadHistory()}
              >
                Muat ulang
              </button>
            )}
          </div>
          {history.length ? (
            <div className="mt-3 space-y-2">
              {history.map((chat) => (
                <details
                  key={chat.id}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <summary className="cursor-pointer text-sm font-medium">
                    {chat.question}
                  </summary>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                    {chat.answer}
                  </p>
                  <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                    <span>
                      {new Date(chat.createdAt).toLocaleString("id-ID")} ·{" "}
                      {chat.model}
                    </span>
                    <button
                      type="button"
                      className="text-rose-600 hover:underline"
                      onClick={() => void removeHistory(chat.id)}
                    >
                      Hapus
                    </button>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-slate-500">
              Belum ada percakapan tersimpan.
            </p>
          )}
        </section>
      </section>
      {draft && (
        <section className="card mt-5 p-5">
          <h2 className="font-semibold">Periksa Draft</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(
              [
                ["name", "Nama aset"],
                ["category", "Kategori"],
                ["location", "Lokasi"],
                ["description", "Deskripsi"],
              ] as const
            ).map(([key, label]) => (
              <label className="text-sm" key={key}>
                {label}
                <input
                  className="input mt-1 w-full"
                  value={draft[key]}
                  onChange={(e) => {
                    setDraft({ ...draft, [key]: e.target.value });
                    setValidation(null);
                  }}
                />
              </label>
            ))}
            <label className="text-sm">
              Jumlah
              <input
                className="input mt-1 w-full"
                type="number"
                min="1"
                max="1000"
                value={draft.quantity}
                onChange={(e) => {
                  setDraft({ ...draft, quantity: Number(e.target.value) });
                  setValidation(null);
                }}
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="btn-secondary"
              disabled={busy}
              onClick={() => void validate()}
            >
              Validasi Draft
            </button>
            {user?.role === "admin" && (
              <button
                className="btn-primary"
                disabled={busy || !validation?.valid || draft.quantity > 100}
                onClick={() => void execute()}
              >
                Buat Aset
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Pembuatan maksimal 100 aset per tindakan dan membutuhkan konfirmasi
            admin.
          </p>
          {validation && (
            <div role="status" className="mt-3 text-sm">
              {validation.valid ? (
                <p className="text-emerald-700">Draft valid.</p>
              ) : (
                [...validation.errors, ...validation.warnings].map(
                  (message) => (
                    <p className="text-rose-700" key={message}>
                      {message}
                    </p>
                  ),
                )
              )}
            </div>
          )}
        </section>
      )}
      {created.length > 0 && (
        <section className="card mt-5 p-5">
          <h2 className="font-semibold">
            Aset berhasil dibuat ({created.length})
          </h2>
          <ul className="mt-2 space-y-1 text-sm">
            {created.map((item) => (
              <li key={item.id}>
                <a
                  className="text-blue-700 underline"
                  href={`/assets/${item.id}`}
                >
                  {item.code}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
