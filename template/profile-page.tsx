"use client";

// Template halaman profil pengguna.

import { useEffect, useRef, useState } from "react";
import { ImageUp, KeyRound, Loader2, Trash2 } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button, Field, Input } from "@/components/ui/primitives";
import { LoadingSkeleton } from "@/components/ui/states";
import { ConfirmDialog, useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toast";
import { useMe } from "@/hooks/use-auth";
import {
  useChangeMyPassword,
  useRemoveMyAvatar,
  useUploadMyAvatar,
} from "@/hooks/use-profile";
import { ApiError } from "@/types/api";
import { initials } from "@/lib/format";
import { toAbsoluteUploadUrl } from "@/lib/env";

const MAX_BYTES = 2 * 1024 * 1024;

export default function ProfilePage() {
  const toast = useToast();
  const confirm = useConfirm();
  const { data: user, isLoading } = useMe();

  return (
    <PageContainer
      title="Profil Saya"
      description="Informasi akun, foto profil, dan keamanan password Anda."
    >
      {isLoading || !user ? (
        <LoadingSkeleton rows={6} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[380px_minmax(0,1fr)]">
          <IdentityCard
            user={user}
            toast={toast}
            confirm={confirm}
          />
          <div className="space-y-4">
            <AccountInfoCard user={user} />
            <PasswordCard toast={toast} />
          </div>
        </div>
      )}

      <ConfirmDialog
        {...(confirm.confirmProps as React.ComponentProps<typeof ConfirmDialog>)}
      />
    </PageContainer>
  );
}

type ToastApi = ReturnType<typeof useToast>;
type ConfirmApi = ReturnType<typeof useConfirm>;

function IdentityCard({
  user,
  toast,
  confirm,
}: {
  user: NonNullable<ReturnType<typeof useMe>["data"]>;
  toast: ToastApi;
  confirm: ConfirmApi;
}) {
  const upload = useUploadMyAvatar();
  const remove = useRemoveMyAvatar();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  const [photoFailed, setPhotoFailed] = useState(false);
  const currentPhoto = preview ?? (user.avatar_url ? toAbsoluteUploadUrl(user.avatar_url) : null);
  // Beberapa avatar lama hasil migrasi belum ke-sync ke storage baru — kalau
  // gagal dimuat, tampilkan inisial alih-alih ikon gambar rusak.
  useEffect(() => setPhotoFailed(false), [currentPhoto]);
  const showPhoto = currentPhoto && !photoFailed;

  const pick = (f: File | null) => {
    if (!f) return;
    if (f.size > MAX_BYTES) {
      toast.warning("Ukuran terlalu besar", "Maksimal 2 MB.");
      return;
    }
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const save = async () => {
    if (!file) return;
    const fd = new FormData();
    fd.append("avatar", file);
    try {
      await upload.mutateAsync(fd);
      toast.success("Foto profil diperbarui");
      setFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (e) {
      toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
    }
  };

  const askRemove = () => {
    confirm.ask({
      title: "Hapus foto profil?",
      description: "Foto akan dihapus dan diganti inisial nama.",
      tone: "danger",
      confirmLabel: "Hapus",
      onConfirm: async () => {
        try {
          await remove.mutateAsync();
          toast.success("Foto profil dihapus");
          setFile(null);
          setPreview(null);
          confirm.close();
        } catch (e) {
          toast.error("Gagal", e instanceof ApiError ? e.message : undefined);
        }
      },
    });
  };

  return (
    <aside className="card h-fit p-5">
      <div className="flex items-center gap-4">
        <div className="grid h-[72px] w-[72px] shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-100 ring-1 ring-slate-200">
          {showPhoto ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={currentPhoto}
              alt={user.fullname}
              className="h-full w-full object-cover"
              onError={() => setPhotoFailed(true)}
            />
          ) : (
            <span className="text-xl font-semibold text-brand-700">
              {initials(user.fullname)}
            </span>
          )}
        </div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-slate-900">{user.fullname}</p>
          <p className="mt-0.5 text-sm text-slate-500">{user.username}</p>
        </div>
      </div>

      <div className="mt-5 border-t border-slate-200 pt-5">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400">
          Ganti Foto Profil
        </p>
        <div className="space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => fileRef.current?.click()}
            >
              <ImageUp className="h-4 w-4" />
              Pilih Foto
            </Button>
            {file ? (
              <Button onClick={save} loading={upload.isPending}>
                Simpan Foto
              </Button>
            ) : null}
            {user.avatar_url && !file ? (
              <Button
                variant="ghost"
                className="text-rose-600"
                onClick={askRemove}
                loading={remove.isPending}
              >
                <Trash2 className="h-4 w-4" />
                Hapus
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-slate-400">JPG / PNG / WEBP / GIF, maks 2 MB.</p>
        </div>
      </div>
    </aside>
  );
}

function AccountInfoCard({ user }: { user: NonNullable<ReturnType<typeof useMe>["data"]> }) {
  const readonlyClass = "bg-slate-50 text-slate-700";
  return (
    <section className="card p-5">
      <h2 className="border-b border-slate-200 pb-3 text-base font-semibold text-slate-900">
        Informasi Akun
      </h2>
      <div className="grid gap-x-5 gap-y-4 pt-4 sm:grid-cols-2">
        <Field label="Nama Lengkap">
          <Input value={user.fullname} readOnly className={readonlyClass} />
        </Field>
        <Field label="Kode Karyawan / NIK">
          <Input value={user.username} readOnly className={readonlyClass} />
        </Field>
        <Field label="Email">
          <Input value={user.email ?? "-"} readOnly className={readonlyClass} />
        </Field>
        <Field label="Nomor HP">
          <Input value={user.phone ?? "-"} readOnly className={readonlyClass} />
        </Field>
        <Field label="Divisi">
          <Input value={user.division ?? "-"} readOnly className={readonlyClass} />
        </Field>
        <Field label="Company">
          <Input value={user.company ?? "-"} readOnly className={readonlyClass} />
        </Field>
      </div>
    </section>
  );
}

function PasswordCard({ toast }: { toast: ToastApi }) {
  const change = useChangeMyPassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  const err =
    next && next.length < 6
      ? "Minimal 6 karakter."
      : confirmPass && next !== confirmPass
        ? "Konfirmasi tidak cocok."
        : "";

  const canSubmit =
    current.length > 0 && next.length >= 6 && next === confirmPass && !change.isPending;

  const submit = async () => {
    if (!canSubmit) return;
    try {
      await change.mutateAsync({
        current_password: current,
        new_password: next,
        confirm_password: confirmPass,
      });
      toast.success("Password diperbarui", "Gunakan password baru saat login berikutnya.");
      setCurrent("");
      setNext("");
      setConfirmPass("");
    } catch (e) {
      toast.error(
        "Gagal mengganti password",
        e instanceof ApiError ? e.message : "Terjadi kesalahan.",
      );
    }
  };

  return (
    <section className="card p-5">
      <div className="flex items-center gap-2">
        <KeyRound className="h-4 w-4 text-slate-500" />
        <h2 className="text-sm font-semibold text-slate-900">Ganti Password</h2>
      </div>

      <form
        className="mt-4 space-y-4 border-t border-slate-200 pt-4"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Field label="Password Saat Ini" required>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password Baru" required hint="Minimal 6 karakter.">
            <Input
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </Field>
          <Field label="Konfirmasi Password Baru" required error={err || undefined}>
            <Input
              type="password"
              autoComplete="new-password"
              value={confirmPass}
              onChange={(e) => setConfirmPass(e.target.value)}
            />
          </Field>
        </div>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button type="submit" disabled={!canSubmit}>
            {change.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Simpan Password
          </Button>
        </div>
      </form>
    </section>
  );
}
