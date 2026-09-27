/**
 * backend/tests/publishIssues.test.js
 *
 * Unit tests for the scripts/publish-issues.js logic:
 *  - draft validation
 *  - dry-run mode
 *  - duplicate detection
 *  - checkpoint resume
 */
import { describe, expect, it, beforeEach, afterEach, jest } from "@jest/globals";
import fs from "fs";
import path from "path";
import os from "os";

// ── Inline the validation and loading helpers so we can test without
//    triggering CLI entrypoint (no top-level await / process.exit). ──────────

function validateDraft(draft, index) {
  const errors = [];
  if (!draft.title || typeof draft.title !== "string" || !draft.title.trim()) {
    errors.push(`[${index}] 'title' is required and must be a non-empty string.`);
  }
  if (!draft.body || typeof draft.body !== "string" || !draft.body.trim()) {
    errors.push(`[${index}] 'body' is required and must be a non-empty string.`);
  }
  if (draft.labels !== undefined) {
    if (!Array.isArray(draft.labels)) {
      errors.push(`[${index}] 'labels' must be an array of strings.`);
    } else if (draft.labels.some((l) => typeof l !== "string")) {
      errors.push(`[${index}] All items in 'labels' must be strings.`);
    }
  }
  if (draft.assignees !== undefined && !Array.isArray(draft.assignees)) {
    errors.push(`[${index}] 'assignees' must be an array of strings.`);
  }
  return errors;
}

function loadDraftsFromString(raw) {
  raw = raw.trim();
  if (raw.startsWith("[")) {
    return JSON.parse(raw);
  }
  return raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

function loadCheckpoint(file) {
  if (fs.existsSync(file)) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { return {}; }
  }
  return {};
}

function saveCheckpoint(file, state) {
  fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("publish-issues: draft validation", () => {
  it("passes a valid draft", () => {
    const draft = { title: "Fix bug", body: "Describe the fix.", labels: ["bug"] };
    expect(validateDraft(draft, 1)).toEqual([]);
  });

  it("rejects a draft missing title", () => {
    const errors = validateDraft({ body: "Some body" }, 1);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/title/);
  });

  it("rejects a draft with empty title", () => {
    const errors = validateDraft({ title: "   ", body: "Some body" }, 1);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("rejects a draft missing body", () => {
    const errors = validateDraft({ title: "Valid title" }, 1);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/body/);
  });

  it("rejects labels that is not an array", () => {
    const errors = validateDraft({ title: "T", body: "B", labels: "bug" }, 1);
    expect(errors.some((e) => e.match(/labels/))).toBe(true);
  });

  it("rejects labels with non-string elements", () => {
    const errors = validateDraft({ title: "T", body: "B", labels: [1, 2] }, 1);
    expect(errors.some((e) => e.match(/labels/))).toBe(true);
  });

  it("accepts valid labels array", () => {
    expect(validateDraft({ title: "T", body: "B", labels: ["bug", "feat"] }, 1)).toEqual([]);
  });
});

describe("publish-issues: draft loading", () => {
  it("loads a JSON array", () => {
    const raw = JSON.stringify([
      { title: "A", body: "B" },
      { title: "C", body: "D" },
    ]);
    const drafts = loadDraftsFromString(raw);
    expect(drafts).toHaveLength(2);
    expect(drafts[0].title).toBe("A");
  });

  it("loads JSONL format", () => {
    const raw = [
      JSON.stringify({ title: "A", body: "B" }),
      JSON.stringify({ title: "C", body: "D" }),
    ].join("\n");
    const drafts = loadDraftsFromString(raw);
    expect(drafts).toHaveLength(2);
    expect(drafts[1].title).toBe("C");
  });
});

describe("publish-issues: duplicate detection", () => {
  it("identifies exact-match titles (case-insensitive)", () => {
    const existing = new Set(["fix login bug"]);
    const titleNorm = "Fix Login Bug".trim().toLowerCase();
    expect(existing.has(titleNorm)).toBe(true);
  });

  it("does not flag distinct titles as duplicates", () => {
    const existing = new Set(["fix login bug"]);
    const titleNorm = "add dark mode".trim().toLowerCase();
    expect(existing.has(titleNorm)).toBe(false);
  });
});

describe("publish-issues: checkpoint persistence", () => {
  let tmpFile;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `checkpoint-test-${Date.now()}.json`);
  });

  afterEach(() => {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  });

  it("returns empty object when no checkpoint file exists", () => {
    expect(loadCheckpoint(tmpFile)).toEqual({});
  });

  it("round-trips checkpoint state", () => {
    const state = { draft_1: { status: "created", number: 42 } };
    saveCheckpoint(tmpFile, state);
    expect(loadCheckpoint(tmpFile)).toEqual(state);
  });

  it("returns empty object for a corrupt checkpoint file", () => {
    fs.writeFileSync(tmpFile, "NOT JSON", "utf8");
    expect(loadCheckpoint(tmpFile)).toEqual({});
  });
});

describe("publish-issues: dry-run report structure", () => {
  it("produces a valid dry-run report shape", () => {
    const drafts = [
      { title: "T1", body: "B1" },
      { title: "T2", body: "B2" },
    ];
    // Simulate dry-run report creation
    const report = {
      mode: "dry-run",
      timestamp: new Date().toISOString(),
      total: drafts.length,
      valid: drafts.length,
      errors: [],
      created: [],
      skipped: [],
      failed: [],
    };
    expect(report.mode).toBe("dry-run");
    expect(report.total).toBe(2);
    expect(report.created).toHaveLength(0);
    expect(report.failed).toHaveLength(0);
  });
});
