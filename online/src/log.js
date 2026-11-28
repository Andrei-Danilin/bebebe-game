// SPEC-013 AC 8: the one way the server logs. An event name and numbers only — never an IP, a name, a token, a room code or any
// text a client sent (RR-56; the log spy of tests/online/server.test.mjs checks the output). Fields that are not numbers are dropped.
export function log(event, fields = {}) {
  const out = { ev: event };
  for (const [k, v] of Object.entries(fields)) if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
  console.log(JSON.stringify(out));
}
