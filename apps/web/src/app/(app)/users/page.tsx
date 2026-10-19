"use client";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError } from "@/lib/api";
import { Empty, PageHeader, StatusBadge } from "@/components/page";
type Group = {
  id: number;
  code: string;
  name: string;
  description: string | null;
  permissions: string[];
  active: boolean;
  _count: { users: number };
};
type Permission = { code: string; module: string; description: string };
type User = {
  id: number;
  username: string;
  fullname: string;
  email: string | null;
  division: string | null;
  role: "admin" | "user";
  gaRole: "none" | "staff" | "supervisor";
  permissionGroup: Pick<Group, "id" | "name" | "permissions"> | null;
};
type Form = {
  username: string;
  fullname: string;
  email: string;
  division: string;
  role: "admin" | "user";
  gaRole: "none" | "staff" | "supervisor";
  password: string;
  permissionGroupId: string;
};
const blank: Form = {
  username: "",
  fullname: "",
  email: "",
  division: "",
  role: "user",
  gaRole: "none",
  password: "",
  permissionGroupId: "",
};
export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [catalog, setCatalog] = useState<Permission[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<User | null | undefined>(undefined);
  const [form, setForm] = useState<Form>(blank);
  const [groupEditor, setGroupEditor] = useState<Group | null | undefined>(
    undefined,
  );
  const [groupForm, setGroupForm] = useState({
    name: "",
    description: "",
    permissions: [] as string[],
  });
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [accounts, accessGroups, permissions] = await Promise.all([
        api<User[]>("/users?page=1&perPage=100"),
        api<Group[]>("/users/permission-groups"),
        api<Permission[]>("/users/permission-groups/catalog"),
      ]);
      setUsers(accounts);
      setGroups(accessGroups);
      setCatalog(permissions);
      setError("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal memuat pengguna.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  function open(user: User | null) {
    setError("");
    setEditing(user);
    setForm(
      user
        ? {
            username: user.username,
            fullname: user.fullname,
            email: user.email || "",
            division: user.division || "",
            role: user.role,
            gaRole: user.gaRole,
            password: "",
            permissionGroupId: user.permissionGroup
              ? String(user.permissionGroup.id)
              : "",
          }
        : blank,
    );
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const payload: Record<string, string | number | null> = {
        ...form,
        permissionGroupId: form.permissionGroupId
          ? Number(form.permissionGroupId)
          : null,
      };
      delete payload.permissionGroupId;
      payload.permissionGroupId = form.permissionGroupId
        ? Number(form.permissionGroupId)
        : null;
      if (editing) delete payload.username;
      if (!payload.password) delete payload.password;
      if (!payload.email) {
        if (editing) payload.email = null;
        else delete payload.email;
      }
      await api(`/users${editing ? `/${editing.id}` : ""}`, {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      setEditing(undefined);
      await load();
      setNotice("Pengguna tersimpan.");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Gagal menyimpan pengguna.");
    } finally {
      setBusy(false);
    }
  }
  function openGroup(group: Group | null) {
    setGroupEditor(group);
    setGroupForm(
      group
        ? {
            name: group.name,
            description: group.description || "",
            permissions: group.permissions,
          }
        : { name: "", description: "", permissions: [] },
    );
  }
  async function saveGroup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        `/users/permission-groups${groupEditor ? `/${groupEditor.id}` : ""}`,
        {
          method: groupEditor ? "PATCH" : "POST",
          body: JSON.stringify(groupForm),
        },
      );
      setGroupEditor(undefined);
      await load();
      setNotice("Grup permission tersimpan.");
    } catch (e) {
      setError(
        e instanceof ApiError ? e.message : "Gagal menyimpan grup permission.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="User Management"
        description="Kelola akun, role, dan grup permission pengguna."
        actions={
          <div className="flex gap-2">
            <button className="btn-secondary" onClick={() => openGroup(null)}>
              Grup Permission
            </button>
            <button className="btn-primary" onClick={() => open(null)}>
              Tambah User
            </button>
          </div>
        }
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
      <section className="card overflow-hidden">
        <div className="border-b p-4 text-sm text-slate-600">
          Akun tanpa grup tidak mendapat akses ke modul yang dilindungi.
          Administrator memiliki akses penuh; role GA dan izin denah tetap
          berlaku.
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[850px] text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                {[
                  "NIK",
                  "Nama",
                  "Divisi",
                  "Role",
                  "Grup Permission",
                  "GA",
                  "Aksi",
                ].map((item) => (
                  <th key={item} className="px-4 py-3">
                    {item}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((user) => (
                <tr key={user.id}>
                  <td className="px-4 py-3">{user.username}</td>
                  <td className="px-4 py-3">{user.fullname}</td>
                  <td className="px-4 py-3">{user.division || "—"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge value={user.role} />
                  </td>
                  <td className="px-4 py-3">
                    {user.permissionGroup?.name ||
                      (user.role === "admin"
                        ? "Administrator"
                        : "Tanpa akses grup")}
                  </td>
                  <td className="px-4 py-3">
                    {user.gaRole === "none" ? (
                      "—"
                    ) : (
                      <StatusBadge value={user.gaRole} />
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      className="btn-secondary"
                      onClick={() => open(user)}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {loading ? (
            <Empty text="Memuat pengguna…" />
          ) : (
            !users.length && <Empty />
          )}
        </div>
      </section>
      {editing !== undefined && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            role="dialog"
            aria-modal="true"
            onSubmit={save}
            className="w-full max-w-xl rounded-2xl bg-white p-5"
          >
            <h2 className="mb-4 text-lg font-bold">
              {editing ? "Edit" : "Tambah"} User
            </h2>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                ["username", "NIK", "text"],
                ["fullname", "Nama Lengkap", "text"],
                ["email", "Email", "email"],
                ["division", "Divisi", "text"],
                [
                  "password",
                  editing ? "Password Baru" : "Password",
                  "password",
                ],
              ].map(([key, label, type]) => (
                <label key={key}>
                  <span className="label">{label}</span>
                  <input
                    className="input"
                    type={type}
                    required={
                      ["username", "fullname"].includes(key) ||
                      (key === "password" && !editing)
                    }
                    disabled={key === "username" && !!editing}
                    value={form[key as keyof Form]}
                    onChange={(e) =>
                      setForm({ ...form, [key]: e.target.value })
                    }
                  />
                </label>
              ))}
              <label>
                <span className="label">Role</span>
                <select
                  className="input"
                  value={form.role}
                  onChange={(e) =>
                    setForm({ ...form, role: e.target.value as Form["role"] })
                  }
                >
                  <option value="user">User</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
              <label>
                <span className="label">Grup Permission</span>
                <select
                  className="input"
                  value={form.permissionGroupId}
                  onChange={(e) =>
                    setForm({ ...form, permissionGroupId: e.target.value })
                  }
                >
                  <option value="">Tanpa grup permission</option>
                  {groups
                    .filter((group) => group.active)
                    .map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setEditing(undefined)}
              >
                Batal
              </button>
              <button className="btn-primary" disabled={busy}>
                Simpan
              </button>
            </div>
          </form>
        </div>
      )}
      {groupEditor !== undefined && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4">
          <form
            role="dialog"
            aria-modal="true"
            onSubmit={saveGroup}
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-5"
          >
            <h2 className="text-lg font-bold">
              {groupEditor ? "Edit" : "Tambah"} Grup Permission
            </h2>
            {!groupEditor && groups.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {groups.map((group) => (
                  <button
                    key={group.id}
                    type="button"
                    className="btn-secondary"
                    onClick={() => openGroup(group)}
                  >
                    {group.name} · {group._count.users} user
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4">
              <label>
                <span className="label">Nama Grup</span>
                <input
                  className="input"
                  required
                  value={groupForm.name}
                  onChange={(e) =>
                    setGroupForm({ ...groupForm, name: e.target.value })
                  }
                />
              </label>
            </div>
            <label className="mt-4 block">
              <span className="label">Keterangan</span>
              <input
                className="input"
                value={groupForm.description}
                onChange={(e) =>
                  setGroupForm({ ...groupForm, description: e.target.value })
                }
              />
            </label>
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {catalog.map((permission) => (
                <label
                  key={permission.code}
                  className="flex gap-3 rounded-xl border p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={groupForm.permissions.includes(permission.code)}
                    onChange={(e) =>
                      setGroupForm({
                        ...groupForm,
                        permissions: e.target.checked
                          ? [...groupForm.permissions, permission.code]
                          : groupForm.permissions.filter(
                              (item) => item !== permission.code,
                            ),
                      })
                    }
                  />
                  <span>
                    <b>{permission.module}</b>
                    <br />
                    <span className="text-slate-500">
                      {permission.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2 border-t pt-4">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setGroupEditor(undefined)}
              >
                Batal
              </button>
              <button className="btn-primary" disabled={busy}>
                Simpan Grup
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
