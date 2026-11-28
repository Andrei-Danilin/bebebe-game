// SPEC-013 AC 2: a WebSocket that only says why it refuses (an unknown or malformed code, a client over its limit), then closes. It is a plain
// accepted socket, not a hibernating one: closing a hibernating socket inside the upgrade request left the client waiting ten seconds for the
// close handshake (wrangler dev 4.169).
import { errorMsg } from "./protocol.js";

export function refusedSocket(code) {
  const { 0: client, 1: server } = new WebSocketPair();
  server.accept();
  server.send(JSON.stringify(errorMsg(code)));
  server.close(1008, code);
  return new Response(null, { status: 101, webSocket: client });
}
