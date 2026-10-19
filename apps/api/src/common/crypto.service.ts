import { Injectable } from "@nestjs/common";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

@Injectable()
export class CryptoService {
  hash(value: string) { return createHash("sha256").update(value).digest("hex"); }
  token(bytes = 32) { return randomBytes(bytes).toString("base64url"); }
  encrypt(value: string) {
    const key = createHash("sha256").update(process.env.ENCRYPTION_KEY || "development-only-key").digest();
    const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
  }
  decrypt(value: string) {
    const raw = Buffer.from(value, "base64"); const key = createHash("sha256").update(process.env.ENCRYPTION_KEY || "development-only-key").digest();
    const decipher = createDecipheriv("aes-256-gcm", key, raw.subarray(0, 12)); decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  }
}
