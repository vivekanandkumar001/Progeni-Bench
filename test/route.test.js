const test = require('node:test');
const assert = require('node:assert/strict');

function matchRoute(pathname, hash) {
  let p = (pathname || hash || "/").replace(/\/+$/, "") || "/";
  if (p === "/" || p === "") return { view: "home" };
  if (p === "/about") return { view: "about", kind: "about" };
  if (p === "/privacy") return { view: "about", kind: "privacy" };
  if (p === "/terms") return { view: "about", kind: "terms" };
  if (p === "/contact") return { view: "about", kind: "contact" };
  if (p.startsWith("/tools/")) {
    const tid = p.split("/")[2];
    if (tid) return { view: "tool", id: tid };
  }
  return { view: "home" };
}

test('route() correctly normalizes paths, trailing slashes, and resolves views', () => {
  assert.deepEqual(matchRoute("/about"), { view: "about", kind: "about" });
  assert.deepEqual(matchRoute("/about/"), { view: "about", kind: "about" });
  assert.deepEqual(matchRoute("/contact"), { view: "about", kind: "contact" });
  assert.deepEqual(matchRoute("/contact/"), { view: "about", kind: "contact" });
  assert.deepEqual(matchRoute("/privacy"), { view: "about", kind: "privacy" });
  assert.deepEqual(matchRoute("/privacy/"), { view: "about", kind: "privacy" });
  assert.deepEqual(matchRoute("/terms/"), { view: "about", kind: "terms" });
  assert.deepEqual(matchRoute("/tools/sticker-sheet"), { view: "tool", id: "sticker-sheet" });
  assert.deepEqual(matchRoute("/tools/sticker-sheet/"), { view: "tool", id: "sticker-sheet" });
  assert.deepEqual(matchRoute("/unknown/route"), { view: "home" });
  assert.deepEqual(matchRoute("/", ""), { view: "home" });
});
