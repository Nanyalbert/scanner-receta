import assert from "node:assert/strict";
import worker, { sanitizeResult } from "../worker/handler.mjs";

const origin = "https://nanyalbert.github.io";
const env = { ALLOWED_ORIGIN: origin, OPENAI_API_KEY: "test-only", APP_ACCESS_TOKEN: "local-test", OPENAI_MODEL: "gpt-5.4" };
const image = "data:image/jpeg;base64,AAAA";
const request = (code, from = origin) => new Request("https://example.workers.dev/", {
  method: "POST", headers: { origin: from, "x-access-code": code, "content-type": "application/json" },
  body: JSON.stringify({ image }),
});

assert.equal((await worker.fetch(request("local-test", "https://other.example"), env)).status, 403);
assert.equal((await worker.fetch(request("wrong"), env)).status, 401);
assert.equal(sanitizeResult({ type: "both", far: { od: { sphere: "30/10/26", cylinder: "", axis: "" }, oi: {} }, near: {}, add: "" }), null);

const originalFetch = globalThis.fetch;
let sent;
try {
  globalThis.fetch = async (_url, init) => {
    sent = JSON.parse(init.body);
    const eye = (sphere, axis) => ({ sphere, cylinder: "+0.25", axis });
    const result = { type: "both", far: { od: eye("+1.50", "10"), oi: eye("+1.50", "170") },
      near: { od: eye("+3.50", "10"), oi: eye("+3.50", "170") }, add: "", uncertain: [], notes: "" };
    return new Response(JSON.stringify({ output: [{ content: [{ type: "output_text", text: JSON.stringify(result) }] }] }), { status: 200 });
  };
  const response = await worker.fetch(request("local-test"), env);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.near.oi.axis, "170");
  assert.equal(result.add, "");
  assert.equal(sent.store, false);
  assert.equal(sent.input[0].content[1].image_url, image);
} finally { globalThis.fetch = originalFetch; }
