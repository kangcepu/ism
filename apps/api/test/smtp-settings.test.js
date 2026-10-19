require("reflect-metadata");
const nodemailer = require("nodemailer");
const {
  SettingsController,
} = require("../dist/src/modules/platform/settings.controller");

afterEach(() => jest.restoreAllMocks());

test("admin initiated SMTP test uses encrypted config and sends only to that admin", async () => {
  const sendMail = jest.fn().mockResolvedValue({});
  const close = jest.fn();
  const transport = jest
    .spyOn(nodemailer, "createTransport")
    .mockReturnValue({ sendMail, close });
  const settings = [
    ["host", "smtp.example"],
    ["port", "587"],
    ["username", "mail-user"],
    ["encryption", "tls"],
    ["from_email", "sender@example.com"],
    ["from_name", "ISM"],
  ].map(([key, value]) => ({ key, value, isSecret: false }));
  settings.push({
    key: "password",
    isSecret: true,
    encryptedValue: "encrypted",
  });
  const db = {
    appSetting: { findMany: jest.fn().mockResolvedValue(settings) },
    user: {
      findUnique: jest
        .fn()
        .mockResolvedValue({ email: "admin@example.com", deletedAt: null }),
    },
  };
  const controller = new SettingsController(db, { decrypt: () => "password" });
  const result = await controller.email({ id: 3 });
  expect(result).toEqual({ sent: true, recipient: "admin@example.com" });
  expect(transport.mock.calls[0][0]).toMatchObject({
    host: "smtp.example",
    port: 587,
    requireTLS: true,
    secure: false,
    auth: { user: "mail-user", pass: "password" },
  });
  expect(sendMail.mock.calls[0][0].to).toBe("admin@example.com");
  expect(close).toHaveBeenCalled();
  expect(JSON.stringify(result)).not.toContain("password");
});

test("SMTP failures do not expose server or authentication details", async () => {
  jest.spyOn(nodemailer, "createTransport").mockReturnValue({
    sendMail: jest.fn().mockRejectedValue(new Error("secret server response")),
    close: jest.fn(),
  });
  const settings = [
    ["host", "smtp.example"],
    ["port", "465"],
    ["encryption", "ssl"],
    ["from_email", "sender@example.com"],
  ].map(([key, value]) => ({ key, value }));
  const controller = new SettingsController(
    {
      appSetting: { findMany: async () => settings },
      user: { findUnique: async () => ({ email: "admin@example.com" }) },
    },
    {},
  );
  await expect(controller.email({ id: 1 })).rejects.toThrow(
    "Email uji gagal dikirim",
  );
});

test("SMTP test completes a real session against a local test server", async () => {
  const net = require("node:net");
  const delivered = [];
  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    socket.write("220 localhost test SMTP\r\n");
    let pending = "";
    let message = null;
    socket.on("data", (chunk) => {
      pending += chunk;
      let end;
      while ((end = pending.indexOf("\r\n")) >= 0) {
        const line = pending.slice(0, end);
        pending = pending.slice(end + 2);
        if (message !== null) {
          if (line === ".") {
            delivered.push(message);
            message = null;
            socket.write("250 queued\r\n");
          } else message += `${line}\n`;
        } else if (/^EHLO|^HELO/i.test(line)) socket.write("250 localhost\r\n");
        else if (/^MAIL FROM|^RCPT TO/i.test(line)) socket.write("250 OK\r\n");
        else if (/^DATA/i.test(line)) {
          message = "";
          socket.write("354 continue\r\n");
        } else if (/^QUIT/i.test(line)) {
          socket.write("221 bye\r\n");
          socket.end();
        } else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const settings = [
      ["host", "127.0.0.1"],
      ["port", String(server.address().port)],
      ["encryption", "none"],
      ["from_email", "sender@example.com"],
    ].map(([key, value]) => ({ key, value }));
    const controller = new SettingsController(
      {
        appSetting: { findMany: async () => settings },
        user: { findUnique: async () => ({ email: "admin@example.com" }) },
      },
      {},
    );
    await expect(controller.email({ id: 1 })).resolves.toMatchObject({
      sent: true,
    });
    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toContain("Subject: ISM - Tes SMTP");
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}, 20000);
