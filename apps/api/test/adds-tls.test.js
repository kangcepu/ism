require("reflect-metadata");
const tls = require("node:tls");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const {
  AddsController,
} = require("../dist/src/modules/platform/adds.controller");

const ber = (tag, body) => {
  const length =
    body.length < 128
      ? Buffer.from([body.length])
      : Buffer.from([0x81, body.length]);
  return Buffer.concat([Buffer.from([tag]), length, body]);
};
const str = (value) => ber(0x04, Buffer.from(value));
const message = (id, op) =>
  ber(0x30, Buffer.concat([ber(0x02, Buffer.from([id])), op]));
const result = (id, tag) =>
  message(
    id,
    ber(tag, Buffer.concat([ber(0x0a, Buffer.from([0])), str(""), str("")])),
  );

test("real LDAPS handshake verifies an internal CA and performs bind and base search", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ism-ldap-tls-"));
  let server;
  try {
    const key = path.join(dir, "key.pem");
    const cert = path.join(dir, "cert.pem");
    execFileSync(
      "openssl",
      [
        "req",
        "-x509",
        "-newkey",
        "rsa:2048",
        "-nodes",
        "-keyout",
        key,
        "-out",
        cert,
        "-days",
        "1",
        "-subj",
        "/CN=127.0.0.1",
        "-addext",
        "subjectAltName=IP:127.0.0.1",
      ],
      { stdio: "ignore" },
    );
    const certificate = fs.readFileSync(cert, "utf8");
    const operations = [];
    server = tls.createServer(
      { key: fs.readFileSync(key), cert: certificate },
      (socket) => {
        let pending = Buffer.alloc(0);
        socket.on("error", () => {});
        socket.on("data", (chunk) => {
          pending = Buffer.concat([pending, chunk]);
          while (pending.length >= 2) {
            const lenBytes = pending[1] & 0x80 ? pending[1] & 0x7f : 0;
            if (pending.length < 2 + lenBytes) return;
            const length = lenBytes
              ? pending.readUIntBE(2, lenBytes)
              : pending[1];
            const total = 2 + lenBytes + length;
            if (pending.length < total) return;
            const packet = pending.subarray(0, total);
            pending = pending.subarray(total);
            const idAt = 2 + lenBytes;
            const id = packet[idAt + 2];
            const op = packet[idAt + 3];
            operations.push(op);
            if (op === 0x60) socket.write(result(id, 0x61));
            if (op === 0x63) {
              const entry = ber(
                0x64,
                Buffer.concat([
                  str("DC=example,DC=com"),
                  ber(0x30, Buffer.alloc(0)),
                ]),
              );
              socket.write(
                Buffer.concat([message(id, entry), result(id, 0x65)]),
              );
            }
            if (op === 0x42) socket.end();
          }
        });
      },
    );
    server.on("tlsClientError", () => {});
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const config = {
      url: `ldaps://127.0.0.1:${server.address().port}`,
      baseDn: "DC=example,DC=com",
      bindDn: "admin@example.com",
      tlsCa: certificate,
    };
    const service = { active: true, secret: "encrypted", config };
    const db = { integrationResource: { findFirst: async () => service } };
    const api = new AddsController(db, { decrypt: () => "password" });
    await expect(api.test(1)).resolves.toEqual({ tested: true });
    expect(operations).toEqual(expect.arrayContaining([0x60, 0x63]));
    service.config = { ...config, tlsCa: "" };
    await expect(api.test(1)).rejects.toMatchObject({ status: 502 });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
}, 20000);
