require("reflect-metadata");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const temporary = require("node:fs").mkdtempSync(
  path.join(os.tmpdir(), "ism-floor-test-"),
);
const previousRoot = process.env.UPLOAD_ROOT;
process.env.UPLOAD_ROOT = temporary;
const {
  FloorBackgroundsController,
  svgMetadata,
} = require("../dist/src/modules/platform/floor-backgrounds.controller");

const svg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 800 400"><path d="M0 0 L2 2"/></svg>',
);

afterAll(async () => {
  if (previousRoot === undefined) delete process.env.UPLOAD_ROOT;
  else process.env.UPLOAD_ROOT = previousRoot;
  await fs.rm(temporary, { recursive: true, force: true });
});

test("SVG validation checks its XML root, viewBox, and entity declarations", () => {
  expect(svgMetadata(svg)).toEqual({ width: 800, height: 400 });
  for (const invalid of [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 4"/>',
    '<svg xmlns="http://www.w3.org/2000/svg"><path/></svg>',
    '<html><svg viewBox="0 0 4 4"/></html>',
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><path></svg>',
    '<!DOCTYPE svg [<!ENTITY x "bad">]><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"/>',
  ])
    expect(() => svgMetadata(Buffer.from(invalid))).toThrow();
});

test("vector-only backgrounds keep their proportions and invalid uploads preserve existing data", async () => {
  const controller = new FloorBackgroundsController();
  const uploaded = await controller.upload(42, {
    originalname: "floor.svg",
    buffer: svg,
  });
  expect(uploaded).toMatchObject({
    page: 42,
    width: 800,
    height: 400,
    format: "svg",
    hasPng: false,
  });
  expect(await controller.list()).toEqual([
    expect.objectContaining({
      page: 42,
      width: 800,
      height: 400,
      format: "svg",
      hasPng: false,
    }),
  ]);
  await expect(
    controller.upload(42, {
      originalname: "bad.svg",
      buffer: Buffer.from("not svg"),
    }),
  ).rejects.toThrow();
  expect(
    await fs.readFile(path.join(temporary, "floor-map-assets", "page-42.svg")),
  ).toEqual(svg);
});
