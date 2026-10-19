"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Empty, PageHeader, StatusBadge } from "@/components/page";

type Session = {
  id: number;
  code: string;
  name: string;
  status: string;
  createdAt: string;
  _count: { entries: number };
};
type Entry = {
  id: number;
  asset: { code: string; name: string };
  expectedLocation: string;
  actualLocation: string;
  expectedSerial: string | null;
  actualSerial: string | null;
  found: boolean;
  condition: string | null;
  note: string | null;
};
type Detail = Session & { entries: Entry[] };
type Asset = { id: number; code: string; name: string };
function discrepancies(entry: Entry) {
  const issues: string[] = [];
  if (!entry.found) issues.push("Aset tidak ditemukan");
  if (
    entry.found &&
    entry.expectedLocation.trim().toLocaleLowerCase() !==
      entry.actualLocation.trim().toLocaleLowerCase()
  )
    issues.push("Lokasi berbeda");
  if (
    entry.found &&
    entry.expectedSerial &&
    entry.actualSerial &&
    entry.expectedSerial.trim().toLocaleLowerCase() !==
      entry.actualSerial.trim().toLocaleLowerCase()
  )
    issues.push("Serial berbeda");
  return issues;
}
export default function AssetAuditsPage() {
  const [sessions, setSessions] = useState<Session[]>([]),
    [selected, setSelected] = useState<Detail | null>(null),
    [assets, setAssets] = useState<Asset[]>([]),
    [query, setQuery] = useState(""),
    [name, setName] = useState(""),
    [assetId, setAssetId] = useState(""),
    [location, setLocation] = useState(""),
    [serial, setSerial] = useState(""),
    [found, setFound] = useState(true),
    [condition, setCondition] = useState("good"),
    [note, setNote] = useState(""),
    [error, setError] = useState("");
  const load = useCallback(async (id?: number) => {
    try {
      const rows = await api<Session[]>("/asset-audits");
      setSessions(rows);
      if (id) setSelected(await api<Detail>(`/asset-audits/${id}`));
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Data opname gagal dimuat.");
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const timer = setTimeout(() => {
      void api<Asset[]>(`/assets?perPage=100&q=${encodeURIComponent(query)}`)
        .then(setAssets)
        .catch(() => setAssets([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);
  async function post(path: string, body: object) {
    try {
      const result = await api<{ id?: number }>(path, {
        method: "POST",
        body: JSON.stringify(body),
      });
      await load(path === "/asset-audits" ? result.id : selected?.id);
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Data gagal disimpan.");
      return false;
    }
  }
  return (
    <>
      <PageHeader
        title="Opname Aset"
        description="Catat hasil pemeriksaan fisik tanpa mengubah data aset secara otomatis."
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 p-3 text-rose-700"
        >
          {error}
        </p>
      )}
      <div className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <div className="space-y-4">
          <form
            className="card p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void (async () => {
                if (await post("/asset-audits", { name })) setName("");
              })();
            }}
          >
            <h2 className="font-semibold">Buat sesi opname</h2>
            <input
              className="input mt-3"
              required
              placeholder="Nama atau periode"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <button className="btn-primary mt-3">Buat sesi</button>
          </form>
          <section className="card overflow-hidden">
            <h2 className="border-b p-4 font-semibold">Sesi opname</h2>
            {sessions.map((s) => (
              <button
                className={`block w-full border-b p-4 text-left hover:bg-slate-50 ${selected?.id === s.id ? "bg-blue-50" : ""}`}
                key={s.id}
                onClick={() => void load(s.id)}
              >
                <b>
                  {s.code} · {s.name}
                </b>
                <span className="block text-sm text-slate-500">
                  {s.status} · {s._count.entries} aset
                </span>
              </button>
            ))}
            {!sessions.length && <Empty text="Belum ada sesi." />}
          </section>
        </div>
        <div className="space-y-4">
          {!selected ? (
            <section className="card">
              <Empty text="Pilih sesi opname untuk mulai." />
            </section>
          ) : (
            <>
              <section className="card p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">
                      {selected.code} · {selected.name}
                    </h2>
                    <p className="text-sm text-slate-500">
                      {selected.entries.length} aset diperiksa ·{" "}
                      {
                        selected.entries.filter(
                          (entry) => discrepancies(entry).length > 0,
                        ).length
                      }{" "}
                      perlu tindak lanjut
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge value={selected.status} />
                    {selected.status === "OPEN" && (
                      <button
                        className="btn-secondary"
                        onClick={() => {
                          if (window.confirm("Tutup sesi opname ini?"))
                            void post(`/asset-audits/${selected.id}/close`, {});
                        }}
                      >
                        Tutup sesi
                      </button>
                    )}
                  </div>
                </div>
              </section>
              {selected.status === "OPEN" && (
                <form
                  className="card p-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void (async () => {
                      if (
                        await post(`/asset-audits/${selected.id}/entries`, {
                          assetId: Number(assetId),
                          actualLocation: location,
                          ...(serial ? { actualSerial: serial } : {}),
                          found,
                          condition,
                          ...(note ? { note } : {}),
                        })
                      ) {
                        setAssetId("");
                        setLocation("");
                        setSerial("");
                        setNote("");
                      }
                    })();
                  }}
                >
                  <h2 className="font-semibold">Pemeriksaan aset</h2>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm">
                      Cari aset
                      <input
                        className="input mt-1"
                        placeholder="Kode, nama, serial"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <label className="text-sm">
                      Aset
                      <select
                        required
                        className="input mt-1"
                        value={assetId}
                        onChange={(e) => setAssetId(e.target.value)}
                      >
                        <option value="">Pilih aset</option>
                        {assets.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.code} · {a.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Lokasi aktual
                      <input
                        required
                        className="input mt-1"
                        value={location}
                        onChange={(e) => setLocation(e.target.value)}
                      />
                    </label>
                    <label className="text-sm">
                      Serial aktual
                      <input
                        className="input mt-1"
                        value={serial}
                        onChange={(e) => setSerial(e.target.value)}
                      />
                    </label>
                    <label className="text-sm">
                      Kondisi
                      <select
                        className="input mt-1"
                        value={condition}
                        onChange={(e) => setCondition(e.target.value)}
                      >
                        {["new", "good", "fair", "poor", "broken"].map((v) => (
                          <option key={v}>{v}</option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm">
                      Catatan
                      <input
                        className="input mt-1"
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                      />
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={found}
                        onChange={(e) => setFound(e.target.checked)}
                      />
                      Aset ditemukan
                    </label>
                  </div>
                  <button className="btn-primary mt-4">
                    Simpan pemeriksaan
                  </button>
                </form>
              )}
              <section className="card overflow-x-auto">
                <h2 className="border-b p-4 font-semibold">
                  Hasil pemeriksaan
                </h2>
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-3">Aset</th>
                      <th>Lokasi tercatat / aktual</th>
                      <th>Serial tercatat / aktual</th>
                      <th>Hasil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.entries.map((entry) => (
                      <tr className="border-t" key={entry.id}>
                        <td className="p-3">
                          <b>{entry.asset.code}</b>
                          <span className="block text-slate-500">
                            {entry.asset.name}
                          </span>
                        </td>
                        <td>
                          {entry.expectedLocation} / {entry.actualLocation}
                        </td>
                        <td>
                          {entry.expectedSerial || "—"} /{" "}
                          {entry.actualSerial || "—"}
                        </td>
                        <td>
                          {entry.found ? "Ditemukan" : "Tidak ditemukan"}
                          <span className="block text-slate-500">
                            {entry.condition || "—"}
                          </span>
                          {discrepancies(entry).map((issue) => (
                            <span key={issue} className="block text-amber-700">
                              {issue}
                            </span>
                          ))}
                          {entry.found &&
                            entry.expectedSerial &&
                            !entry.actualSerial && (
                              <span className="block text-slate-500">
                                Serial belum diperiksa
                              </span>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!selected.entries.length && (
                  <Empty text="Belum ada pemeriksaan." />
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
