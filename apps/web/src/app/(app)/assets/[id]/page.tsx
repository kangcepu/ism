"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Pencil, Trash2, Upload } from "lucide-react";
import { API, api, ApiError } from "@/lib/api";
import { Empty, PageHeader, StatusBadge } from "@/components/page";
import { EmployeePicker } from "@/components/employee-picker";

type Option = { id: number; name: string };
type CustomField = {
  fieldName: string;
  fieldLabel: string;
  fieldType: string;
  isRequired: boolean;
};
type Photo = { id: number; originalName: string };
type History = {
  id: number;
  eventType: string;
  statusFrom: string | null;
  statusTo: string | null;
  note: string | null;
  createdAt: string;
  assigneeSnapshot: { name?: string } | null;
};
type Asset = {
  id: number;
  code: string;
  name: string;
  categoryId: number;
  locationId: number;
  category: Option & { itemType: string };
  location: Option;
  status: string;
  condition: string | null;
  serialNumber: string | null;
  macAddress: string | null;
  description: string | null;
  purchaseDate: string | null;
  price: string | number | null;
  assigneeName: string | null;
  assigneeCode: string | null;
  assigneeCompany: string | null;
  assignedAt: string | null;
  assignmentNote: string | null;
  expectedReturnAt: string | null;
  customData: { fieldName: string; value: string | null }[];
  photos: Photo[];
};
type User = { id: number; username: string; fullname: string };
type Form = {
  name: string;
  categoryId: string;
  locationId: string;
  serialNumber: string;
  macAddress: string;
  description: string;
  purchaseDate: string;
  price: string;
  condition: string;
  customData: Record<string, string>;
};
const date = (value: string | null) =>
  value ? new Date(value).toLocaleString("id-ID") : "—";
const message = (e: unknown) =>
  e instanceof ApiError ? e.message : "Permintaan gagal. Coba lagi.";

export default function AssetDetailPage() {
  const id = String(useParams().id);
  const router = useRouter();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [history, setHistory] = useState<History[]>([]);
  const [categories, setCategories] = useState<Option[]>([]);
  const [locations, setLocations] = useState<Option[]>([]);
  const [fields, setFields] = useState<CustomField[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [assignment, setAssignment] = useState({
    source: "local",
    userId: "",
    assigneeName: "",
    assigneeCode: "",
    company: "",
    note: "",
    expectedReturnAt: "",
  });
  const [status, setStatus] = useState("");
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [dialog, setDialog] = useState<"edit" | "assign" | "status" | null>(
    null,
  );

  const load = useCallback(async () => {
    try {
      const [
        current,
        events,
        categoryOptions,
        locationOptions,
        customFields,
        assignees,
      ] = await Promise.all([
        api<Asset>(`/assets/${id}`),
        api<History[]>(`/assets/${id}/history`),
        api<Option[]>("/categories"),
        api<Option[]>("/locations"),
        api<CustomField[]>("/custom-fields"),
        api<{ users: User[] }>("/users/assignees"),
      ]);
      setAsset(current);
      setHistory(events);
      setCategories(categoryOptions);
      setLocations(locationOptions);
      setFields(customFields);
      setUsers(assignees.users);
      setError("");
    } catch (e) {
      setError(message(e));
    } finally {
      setLoading(false);
    }
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  function edit() {
    if (!asset) return;
    setForm({
      name: asset.name,
      categoryId: String(asset.categoryId),
      locationId: String(asset.locationId),
      serialNumber: asset.serialNumber || "",
      macAddress: asset.macAddress || "",
      description: asset.description || "",
      purchaseDate: asset.purchaseDate?.slice(0, 10) || "",
      price: asset.price == null ? "" : String(asset.price),
      condition: asset.condition || "",
      customData: Object.fromEntries(
        asset.customData.map((row) => [row.fieldName, row.value || ""]),
      ),
    });
    setDialog("edit");
  }
  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setDialog(null);
      await load();
      setNotice(success);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    const payload = {
      ...form,
      categoryId: Number(form.categoryId),
      locationId: Number(form.locationId),
      price: form.price ? Number(form.price) : null,
      condition: form.condition || null,
      purchaseDate: form.purchaseDate || null,
    };
    await perform(
      () =>
        api(`/assets/${id}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        }),
      "Perubahan aset tersimpan.",
    );
  }
  async function assign(e: React.FormEvent) {
    e.preventDefault();
    const {
      source,
      userId,
      assigneeName,
      assigneeCode,
      company,
      note,
      expectedReturnAt,
    } = assignment;
    const payload =
      source === "local"
        ? {
            source,
            userId: Number(userId),
            note,
            ...(expectedReturnAt ? { expectedReturnAt } : {}),
          }
        : {
            source,
            assigneeName,
            assigneeCode,
            company,
            note,
            ...(expectedReturnAt ? { expectedReturnAt } : {}),
          };
    await perform(
      () =>
        api(`/assets/${id}/assignments`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      "Assignment berhasil disimpan.",
    );
  }
  async function changeStatus(e: React.FormEvent) {
    e.preventDefault();
    await perform(
      () =>
        api(`/assets/${id}/status-transitions`, {
          method: "POST",
          body: JSON.stringify({ status, reason }),
        }),
      "Status aset diperbarui.",
    );
  }
  async function upload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const body = new FormData();
    body.append("photo", file);
    await perform(
      () => api(`/assets/${id}/photos`, { method: "POST", body }),
      "Foto berhasil ditambahkan.",
    );
  }
  async function removeAsset() {
    if (
      !window.confirm(
        "Hapus aset ini? Aset akan dihapus dari daftar inventaris.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api(`/assets/${id}`, { method: "DELETE" });
      router.push("/assets");
    } catch (e) {
      setError(message(e));
      setBusy(false);
    }
  }
  if (loading) return <Empty text="Memuat detail aset…" />;
  if (!asset)
    return (
      <>
        <PageHeader title="Detail Aset" description="Informasi aset." />
        <p role="alert" className="text-sm text-rose-700">
          {error || "Aset tidak ditemukan."}
        </p>
        <Link href="/assets" className="mt-4 inline-block text-blue-600">
          Kembali ke aset
        </Link>
      </>
    );
  return (
    <>
      <Link
        href="/assets"
        className="mb-4 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-blue-600"
      >
        <ArrowLeft className="h-4 w-4" />
        Kembali ke aset
      </Link>
      <PageHeader
        title={`${asset.code} · ${asset.name}`}
        description="Detail inventaris, penugasan, foto, dan riwayat aset."
        actions={
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={edit}>
              <Pencil className="h-4 w-4" />
              Edit
            </button>
            <button
              disabled={busy}
              className="btn-secondary text-rose-700"
              onClick={removeAsset}
            >
              <Trash2 className="h-4 w-4" />
              Hapus
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
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-semibold">Informasi Aset</h2>
            <StatusBadge value={asset.status} />
          </div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[
              [
                "Kategori",
                `${asset.category.name} · ${asset.category.itemType}`,
              ],
              ["Lokasi", asset.location.name],
              ["Kondisi", asset.condition],
              ["Serial Number", asset.serialNumber],
              ["MAC Address", asset.macAddress],
              ["Tanggal Pembelian", asset.purchaseDate?.slice(0, 10)],
              [
                "Harga",
                asset.price == null
                  ? null
                  : Number(asset.price).toLocaleString("id-ID"),
              ],
              ["Deskripsi", asset.description],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="label">{label}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
            {fields.map((field) => (
              <div key={field.fieldName}>
                <dt className="label">{field.fieldLabel}</dt>
                <dd>
                  {asset.customData.find(
                    (value) => value.fieldName === field.fieldName,
                  )?.value || "—"}
                </dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="card p-5">
          <h2 className="mb-4 font-semibold">Assignment & Status</h2>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            {[
              ["Penerima", asset.assigneeName],
              ["Kode", asset.assigneeCode],
              ["Company", asset.assigneeCompany],
              ["Tanggal Assignment", date(asset.assignedAt)],
              ["Perkiraan Kembali", date(asset.expectedReturnAt)],
              ["Catatan", asset.assignmentNote],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="label">{label}</dt>
                <dd>{value || "—"}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              disabled={busy}
              className="btn-primary"
              onClick={() => setDialog("assign")}
            >
              {asset.assigneeName ? "Transfer / Assign" : "Assign"}
            </button>
            {asset.assigneeName && (
              <button
                disabled={busy}
                className="btn-secondary"
                onClick={() => {
                  if (window.confirm("Check-in aset ini?"))
                    void perform(
                      () =>
                        api(`/assets/${id}/check-in`, {
                          method: "POST",
                          body: "{}",
                        }),
                      "Aset berhasil di-check-in.",
                    );
                }}
              >
                Check-in
              </button>
            )}
            <button
              className="btn-secondary"
              onClick={() => {
                setStatus(asset.status);
                setReason("");
                setDialog("status");
              }}
            >
              Ubah Status
            </button>
          </div>
        </section>
      </div>
      <section className="card mt-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Foto Aset</h2>
            <p className="mt-1 text-xs text-slate-500">
              JPG, PNG, WEBP, atau GIF; maksimal 12 MB.
            </p>
          </div>
          <label className="btn-secondary cursor-pointer">
            <Upload className="h-4 w-4" />
            Tambah Foto
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              disabled={busy}
              onChange={upload}
            />
          </label>
        </div>
        {asset.photos.length ? (
          <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {asset.photos.map((photo) => (
              <figure
                key={photo.id}
                className="overflow-hidden rounded-xl border border-slate-200"
              >
                <a
                  href={`${API}/asset-photos/${photo.id}/file`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <img
                    src={`${API}/asset-photos/${photo.id}/file`}
                    alt={photo.originalName}
                    className="h-36 w-full object-cover"
                  />
                </a>
                <figcaption className="flex items-center gap-1 p-2">
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {photo.originalName}
                  </span>
                  <button
                    disabled={busy}
                    aria-label={`Hapus ${photo.originalName}`}
                    className="p-2 text-rose-700"
                    onClick={() => {
                      if (window.confirm("Hapus foto ini?"))
                        void perform(
                          () =>
                            api(`/asset-photos/${photo.id}`, {
                              method: "DELETE",
                            }),
                          "Foto dihapus.",
                        );
                    }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Belum ada foto.</p>
        )}
      </section>
      <section className="card mt-5 p-5">
        <h2 className="font-semibold">Riwayat Aset</h2>
        {history.length ? (
          <ol className="mt-4 divide-y">
            {history.map((event) => (
              <li key={event.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b>{event.eventType.replaceAll("_", " ")}</b>
                  <time className="text-xs text-slate-500">
                    {date(event.createdAt)}
                  </time>
                </div>
                <p className="mt-1 text-slate-600">
                  {[
                    event.statusFrom && event.statusTo
                      ? `${event.statusFrom} → ${event.statusTo}`
                      : event.statusTo,
                    event.assigneeSnapshot?.name,
                    event.note,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-4 text-sm text-slate-500">Belum ada riwayat.</p>
        )}
      </section>
      {dialog && (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="asset-dialog-title"
            className="my-auto w-full max-w-2xl rounded-2xl bg-white p-5 shadow-2xl"
          >
            <h2 id="asset-dialog-title" className="mb-4 text-lg font-bold">
              {dialog === "edit"
                ? "Edit Aset"
                : dialog === "assign"
                  ? "Assignment Aset"
                  : "Ubah Status"}
            </h2>
            {error && (
              <p role="alert" className="mb-4 text-sm text-rose-700">
                {error}
              </p>
            )}
            {dialog === "edit" && form && (
              <form onSubmit={save}>
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ["name", "Nama", "text"],
                    ["serialNumber", "Serial Number", "text"],
                    ["macAddress", "MAC Address", "text"],
                    ["purchaseDate", "Tanggal Pembelian", "date"],
                    ["price", "Harga", "number"],
                    ["description", "Deskripsi", "text"],
                  ].map(([key, label, type]) => (
                    <label key={key}>
                      <span className="label">{label}</span>
                      <input
                        className="input"
                        type={type}
                        min={type === "number" ? "0" : undefined}
                        step={type === "number" ? "0.01" : undefined}
                        required={key === "name"}
                        value={String(
                          form[key as keyof Omit<Form, "customData">],
                        )}
                        onChange={(e) =>
                          setForm({ ...form, [key]: e.target.value })
                        }
                      />
                    </label>
                  ))}
                  {[
                    ["categoryId", "Kategori", categories],
                    ["locationId", "Lokasi", locations],
                  ].map(([key, label, options]) => (
                    <label key={String(key)}>
                      <span className="label">{String(label)}</span>
                      <select
                        required
                        className="input"
                        value={String(form[key as "categoryId" | "locationId"])}
                        onChange={(e) =>
                          setForm({ ...form, [String(key)]: e.target.value })
                        }
                      >
                        {(options as Option[]).map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                  <label>
                    <span className="label">Kondisi</span>
                    <select
                      className="input"
                      value={form.condition}
                      onChange={(e) =>
                        setForm({ ...form, condition: e.target.value })
                      }
                    >
                      <option value="">—</option>
                      {["new", "good", "fair", "poor", "broken"].map(
                        (value) => (
                          <option key={value}>{value}</option>
                        ),
                      )}
                    </select>
                  </label>
                  {fields.map((field) => (
                    <label key={field.fieldName}>
                      <span className="label">{field.fieldLabel}</span>
                      <input
                        className="input"
                        required={field.isRequired}
                        value={form.customData[field.fieldName] || ""}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            customData: {
                              ...form.customData,
                              [field.fieldName]: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </div>
                <DialogActions busy={busy} close={() => setDialog(null)} />
              </form>
            )}
            {dialog === "assign" && (
              <form onSubmit={assign}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label>
                    <span className="label">Sumber Penerima</span>
                    <select
                      className="input"
                      value={assignment.source}
                      onChange={(e) =>
                        setAssignment({ ...assignment, source: e.target.value })
                      }
                    >
                      <option value="local">Pengguna Lokal</option>
                      <option value="hr">Karyawan HR</option>
                    </select>
                  </label>
                  {assignment.source === "local" ? (
                    <label>
                      <span className="label">Pengguna</span>
                      <select
                        required
                        className="input"
                        value={assignment.userId}
                        onChange={(e) =>
                          setAssignment({
                            ...assignment,
                            userId: e.target.value,
                          })
                        }
                      >
                        <option value="">Pilih pengguna</option>
                        {users.map((user) => (
                          <option key={user.id} value={user.id}>
                            {user.fullname} · {user.username}
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : (
                    <EmployeePicker
                      value={assignment}
                      onChange={(employee) =>
                        setAssignment({ ...assignment, ...employee })
                      }
                    />
                  )}
                  <label>
                    <span className="label">Perkiraan Kembali</span>
                    <input
                      type="date"
                      className="input"
                      value={assignment.expectedReturnAt}
                      onChange={(e) =>
                        setAssignment({
                          ...assignment,
                          expectedReturnAt: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="label">Catatan</span>
                    <input
                      className="input"
                      value={assignment.note}
                      onChange={(e) =>
                        setAssignment({ ...assignment, note: e.target.value })
                      }
                    />
                  </label>
                </div>
                <DialogActions busy={busy} close={() => setDialog(null)} />
              </form>
            )}
            {dialog === "status" && (
              <form onSubmit={changeStatus}>
                <div className="space-y-4">
                  <label className="block">
                    <span className="label">Status</span>
                    <select
                      required
                      className="input"
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                    >
                      {[
                        "available",
                        "in_use",
                        "maintenance",
                        "retired",
                        "disposed",
                      ].map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="label">Alasan / Catatan</span>
                    <input
                      className="input"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </label>
                </div>
                <DialogActions busy={busy} close={() => setDialog(null)} />
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function DialogActions({ busy, close }: { busy: boolean; close(): void }) {
  return (
    <div className="mt-5 flex justify-end gap-2 border-t pt-4">
      <button type="button" className="btn-secondary" onClick={close}>
        Batal
      </button>
      <button disabled={busy} className="btn-primary">
        {busy ? "Menyimpan…" : "Simpan"}
      </button>
    </div>
  );
}
