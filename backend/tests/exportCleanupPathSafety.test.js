import { afterAll, beforeEach, describe, expect, it, jest } from "@jest/globals";
import fs from "fs";
import os from "os";
import path from "path";

const dbDelete = jest.fn().mockResolvedValue(1);
jest.unstable_mockModule("../config/database.js", () => ({
  default: jest.fn(() => ({ where: jest.fn().mockReturnThis(), delete: dbDelete })),
}));
jest.unstable_mockModule("../utils/logger.js", () => ({
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn() },
}));

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "export-cleanup-"));
const root = path.join(sandbox, "exports");
const outside = path.join(sandbox, "outside");
process.env.EXPORT_STORAGE_PATH = root;

const { resolveOwnedExportFile } = await import("../utils/exportStorage.js");
const { default: ExportCleanupService } = await import("../services/ExportCleanupService.js");

const write = (file, contents = "data") => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, contents);
  return file;
};

describe("export cleanup path safety", () => {
  let victim;

  beforeEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    victim = write(path.join(outside, "victim.csv"), "keep me");
    dbDelete.mockClear();
  });

  afterAll(() => fs.rmSync(sandbox, { recursive: true, force: true }));

  const cleanup = (filePath) => ExportCleanupService.cleanupSingleExport({ id: 1, file_path: filePath });

  const expectRejected = async (filePath) => {
    const result = await cleanup(filePath);
    expect(result).toEqual({ success: false, outcome: "failed", errorCode: "UNSAFE_PATH" });
    expect(dbDelete).not.toHaveBeenCalled();
    expect(fs.readFileSync(victim, "utf8")).toBe("keep me");
  };

  it("deletes a regular export file inside the root", async () => {
    const file = write(path.join(root, "transactions-1-123.csv"));
    await expect(cleanup(file)).resolves.toEqual({ success: true, outcome: "deleted" });
    expect(fs.existsSync(file)).toBe(false);
    expect(dbDelete).toHaveBeenCalled();
  });

  it("treats an already-removed export as missing", async () => {
    await expect(cleanup(path.join(root, "gone.csv"))).resolves.toEqual({ success: true, outcome: "missing" });
  });

  it("rejects absolute paths outside the root", () => expectRejected(victim));

  it("rejects ../ traversal out of the root", () =>
    expectRejected(path.join(root, "..", "outside", "victim.csv")));

  it("rejects relative traversal resolved against the root", () =>
    expectRejected("../outside/victim.csv"));

  it("rejects a symlink inside the root that points outside", async () => {
    const link = path.join(root, "transactions-link.csv");
    fs.symlinkSync(victim, link);
    await expectRejected(link);
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
  });

  it("rejects files reached through a symlinked directory", async () => {
    fs.symlinkSync(outside, path.join(root, "nested"));
    await expectRejected(path.join(root, "nested", "victim.csv"));
  });

  it("rejects directories and non-export files inside the root", async () => {
    fs.mkdirSync(path.join(root, "dir.csv"));
    write(path.join(root, ".env"));
    await expectRejected(path.join(root, "dir.csv"));
    await expectRejected(path.join(root, ".env"));
    expect(fs.existsSync(path.join(root, ".env"))).toBe(true);
  });

  it("rejects the root itself and empty or null-byte paths", async () => {
    await expectRejected(root);
    await expectRejected("");
    await expectRejected(`${path.join(root, "a.csv")}\0.txt`);
  });

  it("accepts stored paths that use a symlinked export root", () => {
    const aliasRoot = path.join(sandbox, "exports-alias");
    fs.rmSync(aliasRoot, { force: true });
    fs.symlinkSync(root, aliasRoot);
    const file = write(path.join(root, "transactions-2-456.pdf"));

    expect(resolveOwnedExportFile(path.join(aliasRoot, "transactions-2-456.pdf"), aliasRoot)).toBe(
      fs.realpathSync(file),
    );
  });
});
