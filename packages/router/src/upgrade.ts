import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

export type HttpUpgradeHandler = (
  request: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) => void;
