const net = require("node:net");
const {
  classifyProbe,
  runMonitoringProbe,
} = require("../dist/src/modules/operations/monitoring-probe");

test("classifies ping and service results without calling a blocked ping an offline host", () => {
  expect(classifyProbe(true, [22]).status).toBe("online");
  expect(classifyProbe(true, []).status).toBe("online");
  expect(classifyProbe(false, [22]).status).toBe("degraded");
  expect(classifyProbe(false, []).status).toBe("offline");
  expect(classifyProbe(null, []).status).toBe("unknown");
  expect(classifyProbe(null, [22]).status).toBe("degraded");
});

test("probes loopback and records configured open service ports", async () => {
  const server = net.createServer((socket) => socket.end());
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  try {
    const port = server.address().port;
    const result = await runMonitoringProbe("127.0.0.1", "server", [port], 500);
    expect(result.openPorts).toContain(port);
    expect(["online", "degraded"]).toContain(result.status);
    expect(result.checkedAt).toBeInstanceOf(Date);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("rejects unsafe host arguments before launching ping or opening a socket", async () => {
  await expect(
    runMonitoringProbe("--help", "server", [], 500),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    runMonitoringProbe("localhost; touch /tmp/bad", "server", [], 500),
  ).rejects.toMatchObject({ status: 400 });
});
