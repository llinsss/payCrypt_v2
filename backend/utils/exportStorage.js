import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Only files the export pipeline produces may be removed by cleanup.
const EXPORT_FILE_EXTENSIONS = new Set([".csv", ".pdf"]);

export class UnsafeExportPathError extends Error {
  constructor(reason) {
    super(`Unsafe export path: ${reason}`);
    this.name = "UnsafeExportPathError";
    this.code = "UNSAFE_PATH";
  }
}

export function getExportStoragePath() {
  const base = process.env.EXPORT_STORAGE_PATH || path.join(__dirname, "../storage/exports");
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return base;
}

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

/**
 * Resolves a stored export path to a canonical path that is safe to delete:
 * a regular export file (not a symlink) located inside the export root, with
 * the root and all parent directories canonicalized so symlinked directories
 * or `..` segments cannot escape it. Returns null when the file is already
 * gone and throws UnsafeExportPathError for anything else.
 */
export function resolveOwnedExportFile(filePath, root = getExportStoragePath()) {
  if (typeof filePath !== "string" || filePath.trim() === "" || filePath.includes("\0")) {
    throw new UnsafeExportPathError("invalid path");
  }

  const rootPath = path.resolve(root);
  const realRoot = fs.realpathSync(rootPath);
  const target = path.resolve(rootPath, filePath);

  // Stored paths may use the configured (possibly symlinked) root or its canonical form.
  if (!isInside(rootPath, target) && !isInside(realRoot, target)) {
    throw new UnsafeExportPathError("outside export root");
  }
  if (!EXPORT_FILE_EXTENSIONS.has(path.extname(target).toLowerCase())) {
    throw new UnsafeExportPathError("not an export file");
  }

  let stats;
  try {
    stats = fs.lstatSync(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  if (stats.isSymbolicLink()) throw new UnsafeExportPathError("symbolic link");
  if (!stats.isFile()) throw new UnsafeExportPathError("not a regular file");

  const realTarget = fs.realpathSync(target);
  if (!isInside(realRoot, realTarget)) {
    throw new UnsafeExportPathError("resolves outside export root");
  }
  return realTarget;
}
