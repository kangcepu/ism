import { BadGatewayException, BadRequestException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

export async function ollamaConfig(db: PrismaService, requireModel = true) {
  const settings = await db.appSetting.findMany({
    where: { group: "ollama", key: { in: ["base_url", "model"] } },
  });
  const values = Object.fromEntries(
    settings.map((item) => [item.key, item.value]),
  );
  if (!values.base_url || (requireModel && !values.model))
    throw new BadRequestException(
      "Konfigurasikan URL dan model Ollama di Settings terlebih dahulu.",
    );
  let base: URL;
  try {
    base = new URL(values.base_url);
  } catch {
    throw new BadRequestException("URL Ollama tidak valid.");
  }
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password ||
    base.search ||
    base.hash
  )
    throw new BadRequestException("URL Ollama tidak valid.");
  return {
    base: base.toString().replace(/\/$/, ""),
    model: values.model || "",
  };
}
export async function ollamaRequest(
  base: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 15000,
) {
  try {
    const response = await fetch(`${base}${path}`, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      if (response.status === 404 && path === "/api/chat")
        throw new BadGatewayException(
          "Model Ollama tidak ditemukan. Periksa model default di Settings.",
        );
      throw new BadGatewayException(
        `Server Ollama menolak permintaan (HTTP ${response.status}).`,
      );
    }
    return (await response.json()) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof BadGatewayException) throw error;
    if (
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError")
    )
      throw new BadGatewayException(
        "Ollama belum selesai dalam batas waktu. Coba model yang lebih ringan atau periksa server.",
      );
    throw new BadGatewayException(
      "Ollama tidak dapat dihubungi atau gagal memproses permintaan.",
    );
  }
}
export async function ollamaChat(
  base: string,
  model: string,
  system: string,
  prompt: string,
  json = false,
) {
  const result = await ollamaRequest(
    base,
    "/api/chat",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        stream: false,
        think: false,
        ...(json ? { format: "json" } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    },
    600000,
  );
  const message = result.message as { content?: unknown } | undefined;
  if (typeof message?.content !== "string" || !message.content.trim())
    throw new BadGatewayException("Respons Ollama tidak valid.");
  return message.content;
}
