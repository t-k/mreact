import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

/**
 * Handles an HTTP upgrade request on the app-router Node server.
 */
export type HttpUpgradeHandler = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;
