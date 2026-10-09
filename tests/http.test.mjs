import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../server.mjs";
test("isolated product API, local server boundaries and request limits", async (t) => {
  const server = createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await (await fetch(base)).text();
  assert.ok(page.includes("NetSuite Global Search+"));
  for (const other of ["graph-view", "investigate-view"])
    assert.ok(!page.includes(other));
  const post = (body, headers = {}) =>
    fetch(base + "/api", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  assert.equal(
    (
      await post({
        action: "search",
        plan: { types: ["purchaseorder"], query: "Cedar" },
      })
    ).status,
    200,
  );
  for (const action of ["graph", "investigate", "approve_simulation"])
    assert.equal(
      (
        await post({
          action,
          key: "salesorder:201",
          plan: { types: ["salesorder"] },
        })
      ).status,
      400,
    );
  assert.equal(
    (await post({ action: "meta" }, { Origin: "https://attacker.invalid" }))
      .status,
    403,
  );
  assert.equal((await post({ action: "constructor" })).status, 400);
  assert.equal((await post("broken json")).status, 400);
  assert.equal((await post("x".repeat(70000))).status, 413);
  assert.equal((await fetch(base + "/.git/config")).status, 404);
});
