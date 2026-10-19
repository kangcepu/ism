const {
  CctvLiveService,
} = require("../dist/src/modules/cctv/cctv-live.controller");

function service(server = "http://192.168.1.20:81") {
  const marker = {
    id: "cam1",
    name: "Door",
    blueIrisCameraId: "front",
    blueIrisServer: server,
    blueIrisUser: "user",
    blueIrisPass: "enc:v1:encrypted",
  };
  const db = {
    floorMapState: {
      findUnique: jest.fn().mockResolvedValue({ state: { markers: [marker] } }),
    },
    cctvCamera: {
      findMany: jest
        .fn()
        .mockResolvedValue([
          {
            id: 1,
            sourceMarkerId: "floor-map:cam1",
            name: "Door",
            address: null,
          },
        ]),
    },
  };
  return new CctvLiveService(db, { decrypt: () => "password" });
}

afterEach(() => jest.restoreAllMocks());

test("live status is sourced from Blue Iris and polling is shared", async () => {
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: async () =>
        JSON.stringify({
          result: "success",
          data: [{ shortName: "front", fps: 12, recording: true }],
        }),
    });
  const live = service();
  const [first, second] = await Promise.all([live.current(), live.current()]);
  expect(first[0]).toMatchObject({
    cameraId: 1,
    status: "online",
    recording: true,
    fps: 12,
  });
  expect(second).toEqual(first);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(first)).not.toContain("password");
});

test("unreachable or disallowed server does not make up an offline or recording status", async () => {
  const fetchMock = jest
    .spyOn(global, "fetch")
    .mockRejectedValue(new Error("unreachable"));
  expect((await service().current())[0]).toMatchObject({
    status: "unknown",
    recording: null,
  });
  fetchMock.mockClear();
  expect((await service("http://127.0.0.1:8001").current())[0]).toMatchObject({
    status: "unknown",
    recording: null,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});
