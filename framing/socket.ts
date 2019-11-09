import { encodeFrame, Frame as OutgoingFrame, Method as OutgoingMethod } from "./frame_encoder.ts";
import {
  decodeFrame,
  Frame as IncomingFrame,
  Method as IncomingMethod,
  decodeHeader
} from "./frame_decoder.ts";

const { dial } = Deno;

export { OutgoingFrame, IncomingFrame, IncomingMethod, OutgoingMethod };

export interface ConnectOptions {
  hostname: string;
  port: number;
}

export interface AmqpSocket {
  start(): Promise<void>;
  close(): void;
  write(frame: OutgoingFrame): Promise<void>;
  use(middleware: FrameMiddleware): () => void;
}

export interface FrameContext {
  frame: IncomingFrame;
  write(frame: OutgoingFrame): Promise<void>;
}

export interface Next {
  (): Promise<void> | void;
}

export type FrameMiddleware = (
  context: FrameContext,
  next?: Next
) => Promise<void> | void;

async function invokeMiddlewares(
  context: FrameContext,
  middlewares: FrameMiddleware[]
) {
  for (const middleware of middlewares) {
    await new Promise(resolve => middleware(context, resolve));
  }
}

export async function connect(options: ConnectOptions): Promise<AmqpSocket> {
  const middlewares: FrameMiddleware[] = [];

  let open = true;

  const conn = await dial({
    hostname: options.hostname,
    port: options.port,
    transport: "tcp"
  });

  async function readBytes(length: number): Promise<Uint8Array | null> {
    if (!open) {
      return null;
    }

    const chunk = new Uint8Array(length);
    const n: number | null = await conn.read(chunk).catch(error => {
      // Detecting if the socket is closed, in that case, this error is expected.
      // TODO(lenkan): Should be able to detect this before initiating the read
      if (!open) {
        return null;
      }

      throw error;
    });

    if (n === null) {
      return null;
    }

    if (n === length) {
      return chunk;
    }

    // TODO: Handle this
    throw new Error(
      `Unable to read desired length from connection ${JSON.stringify({
        n,
        length
      })}`
    );
  }

  async function* read(): AsyncIterableIterator<IncomingFrame> {
    while (true) {
      const prefix = await readBytes(7);
      if (prefix === null) {
        return null;
      }
      const header = decodeHeader(prefix);
      const payload = await readBytes(header.size + 1); // size + frame end
      yield decodeFrame(header, payload.slice(0, header.size));
    }
  }

  async function write(frame: OutgoingFrame) {
    if (!open) {
      throw new Error(
        `Tried to write ${JSON.stringify(frame)} on closed connection`
      );
    }
    const data = encodeFrame(frame);
    await conn.write(data);
  }

  function use(middleware: FrameMiddleware): () => void {
    middlewares.push(middleware);
    return () => {
      const index = middlewares.indexOf(middleware);
      if (index !== -1) {
        middlewares.splice(index, 1);
      }
    };
  }

  async function start() {
    await conn.write(new Uint8Array([65, 77, 81, 80, 0, 0, 9, 1]));
    startReceiving().catch(error => {
      console.error("Fatal error", error);
    });
  }

  async function startReceiving() {
    for await (const frame of read()) {
      if (frame === null) {
        return;
      }
      const context: FrameContext = { frame, write };
      invokeMiddlewares(context, [...middlewares]);
    }
  }

  function close() {
    conn.close();
    open = false;
  }

  return { start, close, use, write };
}