import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";

const require = createRequire(new URL("../../extension/package.json", import.meta.url));
const { build } = require("esbuild");
const compiled = await build({
  entryPoints: [fileURLToPath(new URL("../src/hooks/useProfile.ts", import.meta.url))],
  bundle: true, write: false, platform: "node", format: "cjs", external: ["react"],
  define: { "import.meta.env.VITE_API_BASE": "undefined" },
});
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; };
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });
const profile = (phone, updatedAt) => ({ basic: { phone }, sections: {}, answers: [], settings: { fillSensitive: false }, updatedAt });

// Drive the hook's callbacks and effects without a DOM, using the real API request code.
function mount(fetch) {
  const state = [], effects = [], listeners = new Map(), timers = new Set();
  let index = 0;
  const react = {
    useState(initial) { const slot = index++; state[slot] = initial; return [initial, value => { state[slot] = value; }]; },
    useRef: current => ({ current }),
    useCallback: callback => callback,
    useEffect: callback => { effects.push(callback); },
  };
  const module = { exports: {} };
  const window = {
    setTimeout(callback, delay) { const timer = setTimeout(callback, delay); timers.add(timer); return timer; },
    clearTimeout(timer) { clearTimeout(timer); timers.delete(timer); },
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name),
  };
  const document = {
    visibilityState: "visible",
    addEventListener: (name, callback) => listeners.set(`document:${name}`, callback),
    removeEventListener: name => listeners.delete(`document:${name}`),
  };
  runInNewContext(compiled.outputFiles[0].text, { module, exports: module.exports, require: name => {
    assert.equal(name, "react"); return react;
  }, window, document, fetch, Headers, Response, FormData, AbortController, DOMException, Blob });
  const hook = module.exports.useProfile(true);
  const cleanup = effects.map(callback => callback());
  return { hook, state, focus: () => listeners.get("focus")?.(), fire: (name, event) => listeners.get(name)?.(event), dispose() {
    cleanup.forEach(callback => callback?.()); timers.forEach(clearTimeout);
  } };
}

test("a delayed focus refresh never replaces edits made during its request", async () => {
  const refresh = deferred();
  let gets = 0;
  const app = mount(async (_url, init = {}) => {
    if (init.method === "PUT") return response({ profile: profile("222", "revision-b") });
    return ++gets === 1 ? response({ profile: profile("111", "revision-a") }) : refresh.promise;
  });
  try {
    await tick();
    app.focus();
    app.hook.update(current => ({ ...current, basic: { ...current.basic, phone: "222" } }));
    refresh.resolve(response({ profile: profile("111", "revision-a") }));
    await tick();
    assert.equal(app.state[0].basic.phone, "222");
    await app.hook.retrySave();
    assert.equal(app.state[0].updatedAt, "revision-b");
  } finally { app.dispose(); }
});

test("edits made during a save are sent next with the newly returned revision", async () => {
  const firstSave = deferred(), secondSave = deferred(), writes = [];
  const app = mount(async (_url, init = {}) => {
    if (init.method !== "PUT") return response({ profile: profile("111", "revision-a") });
    writes.push(JSON.parse(init.body));
    return writes.length === 1 ? firstSave.promise : secondSave.promise;
  });
  try {
    await tick();
    app.hook.update(current => ({ ...current, basic: { ...current.basic, phone: "222" } }));
    const saving = app.hook.retrySave();
    app.hook.update(current => ({ ...current, basic: { ...current.basic, phone: "333" } }));
    firstSave.resolve(response({ profile: profile("222", "revision-b") }));
    await saving;
    assert.equal(writes.length, 2);
    assert.equal(writes[0].expectedUpdatedAt, "revision-a");
    assert.equal(writes[1].expectedUpdatedAt, "revision-b");
    assert.equal(writes[1].profile.basic.phone, "333");
    secondSave.resolve(response({ profile: profile("333", "revision-c") }));
    await tick();
    assert.equal(app.state[0].basic.phone, "333");
    assert.equal(app.state[0].updatedAt, "revision-c");
    assert.equal(app.state[2], "saved");
  } finally { app.dispose(); }
});

test("a revision conflict merges data saved elsewhere with the local edits and saves again", async () => {
  const writes = [];
  let gets = 0;
  const app = mount(async (_url, init = {}) => {
    if (init.method === "PUT") {
      writes.push(JSON.parse(init.body));
      return writes.length === 1 ? response({ detail: "资料已在其他页面更新" }, 409) : response({ profile: { ...writes[1].profile, updatedAt: "revision-c" } });
    }
    // The second read happens after the conflict: the extension has added an email meanwhile.
    return ++gets === 1 ? response({ profile: profile("111", "revision-a") }) : response({ profile: { ...profile("111", "revision-b"), basic: { phone: "111", email: "a@b.com" } } });
  });
  try {
    await tick();
    app.hook.update(current => ({ ...current, basic: { ...current.basic, phone: "222" } }));
    await app.hook.retrySave();
    assert.equal(writes.length, 2);
    assert.equal(writes[1].expectedUpdatedAt, "revision-b");
    assert.deepEqual(writes[1].profile.basic, { phone: "222", email: "a@b.com" });
    assert.equal(app.state[2], "saved");
    assert.equal(app.state[0].updatedAt, "revision-c");
  } finally { app.dispose(); }
});

test("a repeated conflict keeps the edits, shows the conflict and recovers on retry", async () => {
  let puts = 0;
  const app = mount(async (_url, init = {}) => {
    if (init.method === "PUT") return ++puts <= 2 ? response({ detail: "资料已在其他页面更新" }, 409) : response({ profile: { ...JSON.parse(init.body).profile, updatedAt: "revision-d" } });
    return response({ profile: profile("111", `revision-${puts}`) });
  });
  try {
    await tick();
    app.hook.update(current => ({ ...current, basic: { ...current.basic, phone: "222" } }));
    await app.hook.retrySave();
    assert.equal(app.state[2], "conflict");
    assert.equal(app.state[0].basic.phone, "222");
    await app.hook.retrySave();
    assert.equal(app.state[2], "saved");
    assert.equal(app.state[0].basic.phone, "222");
    assert.equal(app.state[0].updatedAt, "revision-d");
  } finally { app.dispose(); }
});

test("closing the tab with pending edits saves them; a profile too large for keepalive asks before leaving", async () => {
  const writes = [];
  const app = mount(async (_url, init = {}) => {
    if (init.method === "PUT") { writes.push(init); return response({ profile: { ...JSON.parse(init.body).profile, updatedAt: "revision-b" } }); }
    return response({ profile: profile("111", "revision-a") });
  });
  try {
    await tick();
    app.hook.update(current => ({ ...current, basic: { ...current.basic, phone: "222" } }));
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    app.fire("beforeunload", event);
    assert.equal(event.prevented, true, "unsaved edits ask before leaving");
    app.fire("pagehide");
    assert.ok(writes.some(init => init.keepalive), "a small profile is sent with keepalive");

    app.hook.update(current => ({ ...current, basic: { ...current.basic, selfEvaluation: "长".repeat(30000) } }));
    const before = writes.filter(init => init.keepalive).length;
    app.fire("pagehide");
    assert.equal(writes.filter(init => init.keepalive).length, before, "no keepalive request over the browser's 64 KB limit");
  } finally { app.dispose(); }
});
