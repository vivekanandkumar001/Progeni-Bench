const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  createHistory,
  deletePages,
  duplicatePages,
  insertPages,
  movePages
} = require("../pdf-page-manager.js");

const pages = ["a", "b", "c", "d"].map(id => ({ id }));

test("inserts entries at a validated position without mutating the original", () => {
  const inserted = { id: "x" };
  assert.deepEqual(insertPages(pages, [inserted], 2).map(page => page.id), ["a", "b", "x", "c", "d"]);
  assert.deepEqual(pages.map(page => page.id), ["a", "b", "c", "d"]);
  assert.throws(() => insertPages(pages, [], 5), RangeError);
});

test("deletes selected pages and prevents an empty document", () => {
  assert.deepEqual(deletePages(pages, ["a", "c"]).map(page => page.id), ["b", "d"]);
  assert.throws(() => deletePages(pages, pages.map(page => page.id)), /at least one page/);
  assert.throws(() => deletePages(pages, []), /Select at least one page/);
});

test("duplicates multiple pages in their visible order with new identities", () => {
  const identifiedPages = pages.map(page => ({ ...page, sourceId: page.id }));
  const result = duplicatePages(identifiedPages, ["c", "a"], 2);
  assert.deepEqual(result.slice(2, 4).map(page => page.sourceId), ["a", "c"]);
  assert.notEqual(result[2].id, identifiedPages[0].id);
  assert.notEqual(result[3].id, identifiedPages[2].id);
});

test("moves one or more pages relative to a target and preserves moving order", () => {
  assert.deepEqual(movePages(pages, new Set(["b"]), 3).map(page => page.id), ["a", "c", "b", "d"]);
  assert.deepEqual(movePages(pages, new Set(["a", "c"]), 3).map(page => page.id), ["b", "a", "c", "d"]);
  assert.deepEqual(movePages(pages, new Set(["b"]), 1).map(page => page.id), ["a", "b", "c", "d"]);
  assert.throws(() => movePages(pages, new Set(["b"]), 4), RangeError);
});

test("history supports undo, redo, branching, reset, and bounded entries", () => {
  const history = createHistory(pages, 3);
  history.push(pages.slice(1));
  history.push(pages.slice(0, 2));
  assert.equal(history.canUndo, true);
  assert.deepEqual(history.undo().map(page => page.id), ["b", "c", "d"]);
  assert.equal(history.canRedo, true);
  assert.deepEqual(history.redo().map(page => page.id), ["a", "b"]);
  history.undo();
  history.push([{ id: "branch" }]);
  assert.equal(history.canRedo, false);
  history.push([{ id: "last" }]);
  assert.deepEqual(history.undo().map(page => page.id), ["branch"]);
  history.reset(pages);
  assert.equal(history.canUndo, false);
  assert.equal(history.undo(), null);
});

test("history tracks secondary PDF dependencies across undo and redo states", () => {
  const sourcePage = { id: "source-page", sourceId: "secondary" };
  const history = createHistory(pages);
  assert.equal(history.referencesSource("secondary"), false);
  history.push([...pages, sourcePage]);
  history.undo();
  assert.equal(history.referencesSource("secondary"), true);
  history.reset(pages);
  assert.equal(history.referencesSource("secondary"), false);
});
