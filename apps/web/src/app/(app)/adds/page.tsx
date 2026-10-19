"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Empty, PageHeader } from "@/components/page";

type Service = {
  id: number;
  name: string;
  active: boolean;
  config: {
    url: string;
    baseDn: string;
    bindDn: string;
    startTls: boolean;
    domain: string;
    netbios: string;
    tlsCa: string;
    hasPassword: boolean;
  };
};
type Entry = {
  dn: string;
  name?: string;
  displayName?: string;
  sAMAccountName?: string;
  mail?: string;
  description?: string;
  userAccountControl?: string | string[];
};
type Form = {
  name: string;
  url: string;
  baseDn: string;
  bindDn: string;
  domain: string;
  netbios: string;
  tlsCa: string;
  secret: string;
  startTls: boolean;
  active: boolean;
};
const blank: Form = {
  name: "",
  url: "",
  baseDn: "",
  bindDn: "",
  domain: "",
  netbios: "",
  tlsCa: "",
  secret: "",
  startTls: false,
  active: true,
};
const types = ["users", "groups", "computers"] as const;
const labels = { users: "Pengguna", groups: "Grup", computers: "Komputer" };
type Action = "ou" | "group" | "user" | "password" | "member";
const actionBlank = {
  name: "",
  username: "",
  password: "",
  email: "",
  memberDn: "",
};

export default function AddsPage() {
  const [services, setServices] = useState<Service[]>([]);
  const [selected, setSelected] = useState<Service | null>(null);
  const [path, setPath] = useState<Entry[]>([]);
  const [ous, setOus] = useState<Entry[]>([]);
  const [entries, setEntries] = useState<Record<string, Entry[]>>({});
  const [members, setMembers] = useState<Entry[] | null>(null);
  const [groupName, setGroupName] = useState("");
  const [group, setGroup] = useState<Entry | null>(null);
  const [editing, setEditing] = useState<Service | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [action, setAction] = useState<Action | null>(null);
  const [actionTarget, setActionTarget] = useState<Entry | null>(null);
  const [actionForm, setActionForm] = useState(actionBlank);
  const load = useCallback(async () => {
    try {
      setServices(await api<Service[]>("/adds/services"));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat service.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  async function browse(service: Service, nextPath: Entry[]) {
    setSelected(service);
    setPath(nextPath);
    setMembers(null);
    setBusy(true);
    setError("");
    const dn = nextPath.at(-1)?.dn || service.config.baseDn;
    try {
      const paths = ["organizational-units", ...types];
      const results = await Promise.all(
        paths.map((type) =>
          api<Entry[]>(
            `/adds/services/${service.id}/${type}?baseDn=${encodeURIComponent(dn)}`,
          ),
        ),
      );
      setOus(results[0]);
      setEntries(
        Object.fromEntries(
          types.map((type, index) => [type, results[index + 1]]),
        ),
      );
    } catch (e) {
      setOus([]);
      setEntries({});
      setError(e instanceof ApiError ? e.message : "Gagal membaca direktori.");
    } finally {
      setBusy(false);
    }
  }
  async function showMembers(group: Entry) {
    if (!selected) return;
    setBusy(true);
    setError("");
    setGroupName(group.name || group.dn);
    setGroup(group);
    try {
      setMembers(
        await api<Entry[]>(
          `/adds/services/${selected.id}/group-members?groupDn=${encodeURIComponent(group.dn)}`,
        ),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal membaca member.");
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/adds/services${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify({
          name: form.name,
          active: form.active,
          config: {
            url: form.url,
            baseDn: form.baseDn,
            bindDn: form.bindDn,
            startTls: /^ldap:\/\//i.test(form.url),
            domain: form.domain,
            netbios: form.netbios,
            tlsCa: form.tlsCa,
          },
          ...(form.secret ? { secret: form.secret } : {}),
        }),
      });
      setForm(null);
      setSelected(null);
      await load();
      setNotice("Service tersimpan.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan service.");
    } finally {
      setBusy(false);
    }
  }
  async function test(service: Service) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/adds/services/${service.id}/test`, { method: "POST" });
      setNotice(`Koneksi ${service.name} berhasil.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Tes koneksi gagal.");
    } finally {
      setBusy(false);
    }
  }
  async function remove(service: Service) {
    if (!window.confirm(`Hapus konfigurasi ${service.name}?`)) return;
    setBusy(true);
    setError("");
    try {
      await api(`/adds/services/${service.id}`, { method: "DELETE" });
      if (selected?.id === service.id) setSelected(null);
      await load();
      setNotice("Service dihapus.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menghapus service.");
    } finally {
      setBusy(false);
    }
  }
  function openAction(type: Action, target: Entry | null = null) {
    setError("");
    setActionForm(actionBlank);
    setActionTarget(target);
    setAction(type);
  }
  async function saveAction(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !action) return;
    const parentDn = path.at(-1)?.dn || selected.config.baseDn;
    const endpoints: Record<Action, string> = {
      ou: "organizational-units",
      group: "groups",
      user: "users",
      password: "users/password",
      member: "group-members/add",
    };
    const body =
      action === "user"
        ? {
            parentDn,
            displayName: actionForm.name,
            username: actionForm.username,
            password: actionForm.password,
            ...(actionForm.email ? { email: actionForm.email } : {}),
          }
        : action === "password"
          ? { userDn: actionTarget?.dn, password: actionForm.password }
          : action === "member"
            ? { groupDn: group?.dn, memberDn: actionForm.memberDn }
            : { parentDn, name: actionForm.name };
    setBusy(true);
    setError("");
    try {
      await api(`/adds/services/${selected.id}/${endpoints[action]}`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      setAction(null);
      setActionForm(actionBlank);
      setNotice("Perubahan direktori berhasil disimpan.");
      if (action === "member" && group) await showMembers(group);
      else await browse(selected, path);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Perubahan direktori gagal.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function toggleUser(entry: Entry) {
    if (!selected) return;
    const current = Number(
      Array.isArray(entry.userAccountControl)
        ? entry.userAccountControl[0]
        : entry.userAccountControl,
    );
    if (!Number.isInteger(current)) {
      setError("Status akun tidak tersedia.");
      return;
    }
    const enabled = Boolean(current & 2);
    if (
      !window.confirm(
        `${enabled ? "Aktifkan" : "Nonaktifkan"} akun ${entry.displayName || entry.name || entry.dn}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/adds/services/${selected.id}/users/status`, {
        method: "POST",
        body: JSON.stringify({ userDn: entry.dn, enabled }),
      });
      setNotice(`Akun berhasil ${enabled ? "diaktifkan" : "dinonaktifkan"}.`);
      await browse(selected, path);
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Status akun gagal diperbarui.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function removeMember(entry: Entry) {
    if (
      !selected ||
      !group ||
      !window.confirm(
        `Hapus ${entry.displayName || entry.name || entry.dn} dari grup ${groupName}?`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/adds/services/${selected.id}/group-members/remove`, {
        method: "POST",
        body: JSON.stringify({ groupDn: group.dn, memberDn: entry.dn }),
      });
      setNotice("Member berhasil dikeluarkan dari grup.");
      await showMembers(group);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Member gagal dikeluarkan.");
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <Empty text="Memuat service ADDS…" />;
  return (
    <>
      <PageHeader
        title="ADDS Directory"
        description="Konfigurasi service dan jelajahi direktori Active Directory."
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
      <section className="card mb-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Service ADDS</h2>
          <button
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setForm(blank);
            }}
          >
            Tambah Service
          </button>
        </div>
        {services.length === 0 ? (
          <Empty text="Belum ada service ADDS." />
        ) : (
          <div className="mt-4 space-y-2">
            {services.map((service) => (
              <div
                key={service.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div>
                  <strong>{service.name}</strong>
                  <p className="text-sm text-slate-500">
                    {service.config.url} ·{" "}
                    {service.active ? "Aktif" : "Nonaktif"}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    className="btn-secondary"
                    disabled={busy || !service.active}
                    onClick={() => void browse(service, [])}
                  >
                    Buka Direktori
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={busy || !service.active}
                    onClick={() => void test(service)}
                  >
                    Tes Koneksi
                  </button>
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      setEditing(service);
                      setForm({
                        name: service.name,
                        ...service.config,
                        secret: "",
                        active: service.active,
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="btn-secondary"
                    disabled={busy}
                    onClick={() => void remove(service)}
                  >
                    Hapus
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      {form && (
        <form onSubmit={save} className="card mb-5 p-5">
          <h2 className="font-semibold">
            {editing ? "Edit Service" : "Tambah Service"}
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {(
              [
                ["name", "Nama service", "text"],
                ["url", "URL LDAP atau LDAPS", "url"],
                ["baseDn", "Base DN", "text"],
                ["bindDn", "Bind DN atau username", "text"],
                ["domain", "Domain (opsional)", "text"],
                ["netbios", "NetBIOS (opsional)", "text"],
                [
                  "secret",
                  editing ? "Password baru (opsional)" : "Bind password",
                  "password",
                ],
              ] as const
            ).map(([key, label, type]) => (
              <label className="text-sm" key={key}>
                {label}
                <input
                  className="input mt-1 w-full"
                  type={type}
                  value={form[key]}
                  required={
                    !["domain", "netbios"].includes(key) &&
                    (key !== "secret" || !editing)
                  }
                  onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                  autoComplete={key === "secret" ? "new-password" : "off"}
                />
              </label>
            ))}
            <div className="flex flex-col justify-center gap-2 text-sm">
              <label>
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(e) =>
                    setForm({ ...form, active: e.target.checked })
                  }
                />{" "}
                Service aktif
              </label>
            </div>
          </div>
          <label className="mt-4 block text-sm">
            Sertifikat CA PEM (opsional)
            <textarea
              className="input mt-1 w-full"
              rows={3}
              maxLength={32000}
              value={form.tlsCa}
              onChange={(e) => setForm({ ...form, tlsCa: e.target.value })}
            />
            <span className="mt-1 block text-xs text-slate-500">
              Kosongkan jika CA sudah dipercaya oleh sistem.
            </span>
          </label>
          <p className="mt-3 text-xs text-slate-500">
            LDAP menggunakan STARTTLS secara otomatis; LDAPS menggunakan TLS
            langsung.
          </p>
          <div className="mt-4 flex gap-2">
            <button className="btn-primary" disabled={busy}>
              Simpan
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => setForm(null)}
            >
              Batal
            </button>
          </div>
        </form>
      )}
      {selected && (
        <section className="card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-semibold">Direktori: {selected.name}</h2>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => openAction("ou")}
              >
                Tambah OU
              </button>
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => openAction("group")}
              >
                Tambah Grup
              </button>
              <button
                type="button"
                className="btn-primary"
                disabled={busy}
                onClick={() => openAction("user")}
              >
                Tambah Pengguna
              </button>
            </div>
          </div>
          <nav
            aria-label="Lokasi direktori"
            className="my-4 flex flex-wrap gap-2 text-sm"
          >
            <button
              className="btn-secondary"
              onClick={() => void browse(selected, [])}
            >
              Root
            </button>
            {path.map((item, index) => (
              <button
                className="btn-secondary"
                key={item.dn}
                onClick={() => void browse(selected, path.slice(0, index + 1))}
              >
                {item.name || item.dn}
              </button>
            ))}
          </nav>
          {busy && <p className="text-sm text-slate-500">Memuat direktori…</p>}
          <h3 className="font-medium">Organizational Units &amp; Container</h3>
          {ous.length ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {ous.map((ou) => (
                <button
                  className="btn-secondary"
                  key={ou.dn}
                  onClick={() => void browse(selected, [...path, ou])}
                >
                  {ou.name || ou.dn}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-500">
              Tidak ada OU pada lokasi ini.
            </p>
          )}
          {types.map((type) => (
            <div key={type} className="mt-5">
              <h3 className="font-medium">
                {labels[type]} ({entries[type]?.length || 0})
              </h3>
              {entries[type]?.length ? (
                <ul className="mt-2 divide-y">
                  {entries[type].map((entry) => (
                    <li
                      key={entry.dn}
                      className="flex flex-wrap justify-between gap-2 py-2 text-sm"
                    >
                      <span>
                        {entry.displayName || entry.name || entry.dn}
                        {entry.sAMAccountName && (
                          <span className="text-slate-500">
                            {" "}
                            · {entry.sAMAccountName}
                          </span>
                        )}
                        {entry.mail && (
                          <span className="text-slate-500">
                            {" "}
                            · {entry.mail}
                          </span>
                        )}
                      </span>
                      {type === "groups" && (
                        <button
                          className="text-blue-700 underline"
                          onClick={() => void showMembers(entry)}
                        >
                          Lihat member
                        </button>
                      )}
                      {type === "users" && (
                        <span className="flex flex-wrap gap-3">
                          <button
                            type="button"
                            disabled={busy}
                            className="text-blue-700 underline disabled:opacity-50"
                            onClick={() => openAction("password", entry)}
                          >
                            Reset password
                          </button>
                          <button
                            type="button"
                            disabled={
                              busy || entry.userAccountControl === undefined
                            }
                            className="text-blue-700 underline disabled:opacity-50"
                            onClick={() => void toggleUser(entry)}
                          >
                            {Number(
                              Array.isArray(entry.userAccountControl)
                                ? entry.userAccountControl[0]
                                : entry.userAccountControl,
                            ) & 2
                              ? "Aktifkan"
                              : "Nonaktifkan"}
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">Tidak ada data.</p>
              )}
            </div>
          ))}
          {members && (
            <div className="mt-5 rounded-lg border p-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-medium">Member: {groupName}</h3>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={busy}
                  onClick={() => openAction("member")}
                >
                  Tambah Member
                </button>
              </div>
              {members.length ? (
                <ul className="mt-2 space-y-1 text-sm">
                  {members.map((entry) => (
                    <li
                      key={entry.dn}
                      className="flex items-center justify-between gap-2"
                    >
                      <span>
                        {entry.displayName || entry.name || entry.dn}{" "}
                        {entry.sAMAccountName && `· ${entry.sAMAccountName}`}
                      </span>
                      <button
                        type="button"
                        disabled={busy}
                        className="text-rose-700 underline"
                        onClick={() => void removeMember(entry)}
                      >
                        Keluarkan
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2 text-sm text-slate-500">
                  Tidak ada member langsung.
                </p>
              )}
              <button
                className="mt-3 text-sm text-blue-700 underline"
                onClick={() => setMembers(null)}
              >
                Tutup
              </button>
            </div>
          )}
        </section>
      )}
      {action && selected && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/60 p-4">
          <form
            onSubmit={saveAction}
            role="dialog"
            aria-modal="true"
            aria-labelledby="directory-action-title"
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2 id="directory-action-title" className="text-lg font-bold">
              {
                {
                  ou: "Tambah OU",
                  group: "Tambah Grup",
                  user: "Tambah Pengguna",
                  password: "Reset Password",
                  member: "Tambah Member",
                }[action]
              }
            </h2>
            <p className="mt-1 break-all text-xs text-slate-500">
              {action === "password"
                ? actionTarget?.dn
                : action === "member"
                  ? group?.dn
                  : path.at(-1)?.dn || selected.config.baseDn}
            </p>
            {error && (
              <p
                role="alert"
                className="mt-3 rounded-lg bg-rose-50 p-3 text-sm text-rose-700"
              >
                {error}
              </p>
            )}
            <div className="mt-4 space-y-3">
              {(["ou", "group", "user"] as Action[]).includes(action) && (
                <label className="block text-sm">
                  {action === "user" ? "Nama lengkap" : "Nama"}
                  <input
                    className="input mt-1"
                    required
                    maxLength={
                      action === "user" ? 128 : action === "group" ? 20 : 64
                    }
                    value={actionForm.name}
                    onChange={(e) =>
                      setActionForm({ ...actionForm, name: e.target.value })
                    }
                  />
                </label>
              )}
              {action === "user" && (
                <>
                  <label className="block text-sm">
                    Username
                    <input
                      className="input mt-1"
                      required
                      maxLength={20}
                      pattern="[A-Za-z0-9._-]+"
                      value={actionForm.username}
                      onChange={(e) =>
                        setActionForm({
                          ...actionForm,
                          username: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="block text-sm">
                    Email (opsional)
                    <input
                      className="input mt-1"
                      type="email"
                      value={actionForm.email}
                      onChange={(e) =>
                        setActionForm({ ...actionForm, email: e.target.value })
                      }
                    />
                  </label>
                </>
              )}
              {(action === "user" || action === "password") && (
                <label className="block text-sm">
                  Password
                  <input
                    className="input mt-1"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={256}
                    value={actionForm.password}
                    onChange={(e) =>
                      setActionForm({ ...actionForm, password: e.target.value })
                    }
                  />
                </label>
              )}
              {action === "member" && (
                <label className="block text-sm">
                  DN pengguna, grup, atau komputer
                  <input
                    className="input mt-1"
                    required
                    maxLength={512}
                    list="directory-members"
                    value={actionForm.memberDn}
                    onChange={(e) =>
                      setActionForm({ ...actionForm, memberDn: e.target.value })
                    }
                  />
                  <datalist id="directory-members">
                    {types
                      .flatMap((type) => entries[type] || [])
                      .map((entry) => (
                        <option key={entry.dn} value={entry.dn}>
                          {entry.displayName ||
                            entry.name ||
                            entry.sAMAccountName}
                        </option>
                      ))}
                  </datalist>
                  <span className="mt-1 block text-xs text-slate-500">
                    Pilih dari lokasi saat ini atau masukkan DN dalam domain
                    yang sama.
                  </span>
                </label>
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                className="btn-secondary"
                disabled={busy}
                onClick={() => {
                  setAction(null);
                  setActionForm(actionBlank);
                }}
              >
                Batal
              </button>
              <button type="submit" className="btn-primary" disabled={busy}>
                {busy ? "Menyimpan…" : "Simpan"}
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
