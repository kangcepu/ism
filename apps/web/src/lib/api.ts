const API = process.env.NEXT_PUBLIC_API_URL || "/api/v1";
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
export function csrfToken() { if (typeof window === "undefined") return ""; return document.cookie.split("; ").find((row) => row.startsWith("ism_csrf="))?.split("=")[1] || sessionStorage.getItem("csrf") || ""; }
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...init, credentials: "include", headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(init.method && !["GET", "HEAD"].includes(init.method) ? { "x-csrf-token": csrfToken() } : {}), ...init.headers } });
  } catch {
    throw new ApiError("Tidak dapat terhubung ke server. Pastikan API berjalan.", 0);
  }
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new ApiError(json?.error?.details?.join(", ") || json?.error?.message || "Permintaan gagal.", response.status);
  if (!json || !("data" in json)) throw new ApiError("Respons server tidak valid.", response.status);
  return json.data as T;
}
export { API };
