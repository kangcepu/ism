"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Empty, PageHeader, StatusBadge } from "@/components/page";

type Account = { id: number; name: string; config: { notes?: string } };
type Network = {
  id: number;
  name: string;
  externalId: string;
  config: { notes?: string; accountId?: number | null };
};
type Member = {
  id: string;
  name: string;
  description: string;
  authorized: boolean;
  online: boolean;
  lastOnline: number | null;
  ipAssignments: string[];
  physicalAddress: string | null;
  clientVersion: string | null;
};
type Form = {
  name: string;
  token: string;
  notes: string;
  externalId: string;
  accountId: string;
};
const blank: Form = {
  name: "",
  token: "",
  notes: "",
  externalId: "",
  accountId: "",
};

export default function ZeroTierPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [networks, setNetworks] = useState<Network[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [selected, setSelected] = useState<Network | null>(null);
  const [dialog, setDialog] = useState<"account" | "network" | null>(null);
  const [editing, setEditing] = useState<Account | Network | null>(null);
  const [form, setForm] = useState<Form>(blank);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    try {
      const [a, n] = await Promise.all([
        api<Account[]>("/zerotier/accounts"),
        api<Network[]>("/zerotier/networks"),
      ]);
      setAccounts(a);
      setNetworks(n);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat ZeroTier.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function showMembers(network: Network) {
    setSelected(network);
    setMembers([]);
    setBusy(true);
    setError("");
    try {
      setMembers(
        await api<Member[]>(`/zerotier/networks/${network.externalId}/members`),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat member.");
    } finally {
      setBusy(false);
    }
  }
  function open(kind: "account" | "network", row: Account | Network | null) {
    setDialog(kind);
    setEditing(row);
    setForm(
      row
        ? {
            ...blank,
            name: row.name,
            notes: row.config?.notes || "",
            externalId: "externalId" in row ? row.externalId : "",
            accountId:
              "externalId" in row && row.config?.accountId
                ? String(row.config.accountId)
                : "",
          }
        : blank,
    );
    setError("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!dialog) return;
    setBusy(true);
    setError("");
    try {
      const body =
        dialog === "account"
          ? {
              name: form.name,
              notes: form.notes,
              ...(form.token ? { token: form.token } : {}),
            }
          : {
              name: form.name,
              externalId: form.externalId,
              notes: form.notes,
              ...(form.accountId ? { accountId: Number(form.accountId) } : {}),
            };
      await api(
        `/zerotier/${dialog === "account" ? "accounts" : "networks"}${editing ? `/${editing.id}` : ""}`,
        { method: editing ? "PATCH" : "POST", body: JSON.stringify(body) },
      );
      setDialog(null);
      setSelected(null);
      await load();
      setNotice("Konfigurasi tersimpan.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(kind: "accounts" | "networks", row: Account | Network) {
    if (
      !window.confirm(
        kind === "networks"
          ? "Hapus network dari daftar aplikasi? Network di ZeroTier tidak akan dihapus."
          : "Hapus account ini?",
      )
    )
      return;
    setBusy(true);
    try {
      await api(`/zerotier/${kind}/${row.id}`, { method: "DELETE" });
      setSelected(null);
      await load();
      setNotice("Konfigurasi dihapus.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus.");
    } finally {
      setBusy(false);
    }
  }
  async function changeMember(
    member: Member,
    action: "authorize" | "rename" | "delete",
  ) {
    if (!selected) return;
    let method = "PATCH";
    let body: object = {};
    if (action === "authorize") {
      if (
        !window.confirm(
          `${member.authorized ? "Cabut" : "Berikan"} otorisasi untuk ${member.name || member.id}?`,
        )
      )
        return;
      body = { authorized: !member.authorized };
    }
    if (action === "rename") {
      const name = window.prompt("Nama member", member.name);
      if (name === null) return;
      body = { name };
    }
    if (action === "delete") {
      if (
        !window.confirm(
          `Hapus member ${member.name || member.id} dari network?`,
        )
      )
        return;
      method = "DELETE";
    }
    setBusy(true);
    setError("");
    try {
      await api(
        `/zerotier/networks/${selected.externalId}/members/${member.id}`,
        {
          method,
          ...(method === "PATCH" ? { body: JSON.stringify(body) } : {}),
        },
      );
      await showMembers(selected);
      setNotice("Member diperbarui.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memperbarui member.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Empty text="Memuat ZeroTier…" />;
  return (
    <>
      <PageHeader
        title="ZeroTier"
        description="Kelola account, network, dan member ZeroTier Central."
      />
      {error && (
        <p
          role="alert"
          className="mb-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-700"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="mb-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700"
        >
          {notice}
        </p>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Accounts</h2>
            <button
              onClick={() => open("account", null)}
              className="btn-secondary"
            >
              Tambah Account
            </button>
          </div>
          {accounts.length ? (
            <ul className="mt-3 divide-y">
              {accounts.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <b>{row.name}</b>
                    <p className="text-xs text-slate-500">
                      {row.config?.notes || "—"}
                    </p>
                  </div>
                  <button
                    className="btn-secondary"
                    onClick={() => open("account", row)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-secondary text-rose-700"
                    onClick={() => remove("accounts", row)}
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Belum ada account.</p>
          )}
        </section>
        <section className="card p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Networks</h2>
            <button
              onClick={() => open("network", null)}
              className="btn-secondary"
            >
              Tambah Network
            </button>
          </div>
          {networks.length ? (
            <ul className="mt-3 divide-y">
              {networks.map((row) => (
                <li
                  key={row.id}
                  className="flex flex-wrap items-center gap-2 py-3 text-sm"
                >
                  <button
                    className="min-w-0 flex-1 text-left text-blue-700 hover:underline"
                    onClick={() => showMembers(row)}
                  >
                    <b>{row.name}</b>
                    <span className="block text-xs text-slate-500">
                      {row.externalId}
                    </span>
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => open("network", row)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-secondary text-rose-700"
                    onClick={() => remove("networks", row)}
                  >
                    Hapus
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-slate-500">Belum ada network.</p>
          )}
        </section>
      </div>
      {selected && (
        <section className="card mt-5 overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b p-5">
            <div>
              <h2 className="font-semibold">Members · {selected.name}</h2>
              <p className="text-xs text-slate-500">{selected.externalId}</p>
            </div>
            <button
              disabled={busy}
              className="btn-secondary"
              onClick={() => showMembers(selected)}
            >
              Refresh
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                <tr>
                  {[
                    "Member",
                    "Status",
                    "Otorisasi",
                    "IP",
                    "Terakhir Online",
                    "Aksi",
                  ].map((label) => (
                    <th key={label} className="px-4 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {members.map((member) => (
                  <tr key={member.id}>
                    <td className="px-4 py-3">
                      <b>{member.name || "—"}</b>
                      <p className="text-xs text-slate-500">{member.id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge
                        value={member.online ? "online" : "offline"}
                      />
                    </td>
                    <td className="px-4 py-3">
                      {member.authorized ? "Ya" : "Tidak"}
                    </td>
                    <td className="px-4 py-3">
                      {member.ipAssignments.join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {member.lastOnline
                        ? new Date(member.lastOnline).toLocaleString("id-ID")
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          disabled={busy}
                          className="btn-secondary"
                          onClick={() => changeMember(member, "authorize")}
                        >
                          {member.authorized ? "Cabut" : "Authorize"}
                        </button>
                        <button
                          disabled={busy}
                          className="btn-secondary"
                          onClick={() => changeMember(member, "rename")}
                        >
                          Rename
                        </button>
                        <button
                          disabled={busy}
                          className="btn-secondary text-rose-700"
                          onClick={() => changeMember(member, "delete")}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {busy ? (
              <Empty text="Memuat member…" />
            ) : (
              !members.length && (
                <Empty text="Belum ada member yang ditampilkan." />
              )
            )}
          </div>
        </section>
      )}
      {dialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="zero-title"
            onSubmit={save}
            className="w-full max-w-lg rounded-2xl bg-white p-5"
          >
            <h2 id="zero-title" className="mb-4 text-lg font-bold">
              {editing ? "Edit" : "Tambah"}{" "}
              {dialog === "account" ? "Account" : "Network"}
            </h2>
            {error && (
              <p role="alert" className="mb-3 text-sm text-rose-700">
                {error}
              </p>
            )}
            <div className="space-y-4">
              <label className="block">
                <span className="label">Nama</span>
                <input
                  required
                  className="input"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </label>
              {dialog === "account" ? (
                <label className="block">
                  <span className="label">
                    Token {editing && "(kosongkan untuk mempertahankan)"}
                  </span>
                  <input
                    required={!editing}
                    type="password"
                    className="input"
                    value={form.token}
                    onChange={(e) =>
                      setForm({ ...form, token: e.target.value })
                    }
                  />
                </label>
              ) : (
                <>
                  <label className="block">
                    <span className="label">Network ID</span>
                    <input
                      required
                      pattern="[0-9a-fA-F]{16}"
                      className="input"
                      value={form.externalId}
                      onChange={(e) =>
                        setForm({ ...form, externalId: e.target.value })
                      }
                    />
                  </label>
                  <label className="block">
                    <span className="label">Account</span>
                    <select
                      className="input"
                      value={form.accountId}
                      onChange={(e) =>
                        setForm({ ...form, accountId: e.target.value })
                      }
                    >
                      <option value="">Token legacy di Settings</option>
                      {accounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              <label className="block">
                <span className="label">Catatan</span>
                <input
                  className="input"
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                />
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDialog(null)}
              >
                Batal
              </button>
              <button disabled={busy} className="btn-primary">
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
