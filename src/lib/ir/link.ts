/**
 * WebUSB link to the Hrebos / ElkSmart IR dongle (vendor 0x045C).
 * Ported from the live remir.grok.me v35 bundle (routes-C1j-SoCt.js).
 */
import { decodeLearned } from "@/lib/ir/protocol";

export type DongleReport = {
  pid: number;
  name: string;
  kind: "d226" | "d552" | "unknown";
  mark: string;
};

export type ElkLink = {
  report: DongleReport;
  /** Writes one packet, after draining stale replies. Calls are serialized. */
  write(data: Uint8Array): Promise<void>;
  /** Next IN packet, or null on timeout. */
  read(ms: number): Promise<Uint8Array | null>;
  close(): Promise<void>;
};

const VENDOR = 0x045c;

function copyOf(view: DataView): Uint8Array {
  const out = new Uint8Array(view.byteLength);
  out.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
  return out;
}

function hex(data: Uint8Array): string {
  return [...data].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, ms));
}

/** Finds the FC FC FC FC xx yy hello inside a reply. */
function findHello(data: Uint8Array): Uint8Array | null {
  const last = Math.min(data.length - 6, 8);
  for (let i = 0; i <= last; i++) {
    if (data[i] === 0xfc && data[i + 1] === 0xfc && data[i + 2] === 0xfc && data[i + 3] === 0xfc) return data.slice(i, i + 6);
  }
  return null;
}

async function openDevice(device: USBDevice): Promise<ElkLink> {
  if (!device.opened) await device.open();
  if (!device.configuration) await device.selectConfiguration(1);
  const interfaces = device.configuration?.interfaces ?? [];
  if (!interfaces.length) throw new Error("The dongle has no USB interface.");

  let ifaceNumber = interfaces[0]!.interfaceNumber;
  let epOut = 1;
  let epIn = 1;
  let claimed = false;
  let assumed = true;
  for (const candidate of interfaces) {
    try {
      await device.claimInterface(candidate.interfaceNumber);
    } catch {
      continue;
    }
    claimed = true;
    ifaceNumber = candidate.interfaceNumber;
    const iface = device.configuration?.interfaces.find((i) => i.interfaceNumber === candidate.interfaceNumber) ?? candidate;
    const alts = iface.alternate ? [iface.alternate, ...(iface.alternates ?? [])] : [...(iface.alternates ?? [])];
    let foundIn = 0;
    let foundOut = 0;
    for (const alt of alts) {
      for (const ep of alt.endpoints ?? []) {
        if (ep.type !== "bulk" && ep.type !== "interrupt") continue;
        if (ep.direction === "in" && !foundIn) foundIn = ep.endpointNumber;
        if (ep.direction === "out" && !foundOut) foundOut = ep.endpointNumber;
      }
      if (foundIn && foundOut) break;
    }
    if (foundIn && foundOut) {
      epIn = foundIn;
      epOut = foundOut;
      assumed = false;
      break;
    }
    epIn = foundIn || 1;
    epOut = foundOut || 1;
    break;
  }
  if (!claimed) throw new Error("Android is holding the dongle. Close the other IR app, then connect again.");
  try {
    await device.clearHalt("in", epIn);
  } catch {
    /* not halted */
  }
  try {
    await device.clearHalt("out", epOut);
  } catch {
    /* not halted */
  }

  const queue: Uint8Array[] = [];
  let wake: (() => void) | null = null;
  let pending: Promise<USBInTransferResult> | null = null;
  let closed = false;
  let chain: Promise<void> = Promise.resolve();

  const serial = <T,>(job: () => Promise<T>): Promise<T> => {
    const run = chain.then(job, job);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const pump = () => {
    if (closed || pending) return;
    const transfer = device.transferIn(epIn, 64);
    pending = transfer;
    transfer.then(
      (result) => {
        if (pending === transfer) pending = null;
        if (!closed && result.data && result.data.byteLength > 0) queue.push(copyOf(result.data));
        wake?.();
      },
      () => {
        if (pending === transfer) pending = null;
        wake?.();
      },
    );
  };

  const readRaw = (ms: number) =>
    new Promise<Uint8Array | null>((resolve) => {
      if (closed) {
        resolve(null);
        return;
      }
      if (queue.length) {
        resolve(queue.shift() ?? null);
        return;
      }
      pump();
      const timer = window.setTimeout(() => {
        if (wake === done) wake = null;
        resolve(queue.shift() ?? null);
      }, ms);
      const done = () => {
        window.clearTimeout(timer);
        wake = null;
        resolve(queue.shift() ?? null);
      };
      wake = done;
      if (queue.length) done();
    });

  /** Cancels a dangling IN transfer by reopening the device (WebUSB cannot abort one). */
  const resetIn = async () => {
    const dangling = pending;
    queue.length = 0;
    if (!dangling) return;
    closed = true;
    wake?.();
    wake = null;
    try {
      await device.close();
    } catch {
      /* already closed */
    }
    await Promise.race([
      dangling.then(
        () => undefined,
        () => undefined,
      ),
      sleep(300),
    ]);
    pending = null;
    queue.length = 0;
    await sleep(40);
    await device.open();
    if (!device.configuration) await device.selectConfiguration(1);
    await device.claimInterface(ifaceNumber);
    closed = false;
  };

  const writeRaw = async (data: Uint8Array) => {
    if (closed) throw new Error("Dongle is closed.");
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);
    const result = await device.transferOut(epOut, copy);
    if (result.status !== "ok" || result.bytesWritten !== copy.byteLength) {
      throw new Error(`USB write failed (${result.status}, ${result.bytesWritten}/${copy.byteLength}).`);
    }
  };

  const handshake = async () => {
    let hello: Uint8Array | null = null;
    for (let attempt = 0; attempt < 3 && !hello; attempt++) {
      if (pending) await resetIn();
      await writeRaw(new Uint8Array([0xfc, 0xfc, 0xfc, 0xfc]));
      for (let i = 0; i < 5 && !hello; i++) {
        const reply = await readRaw(200);
        if (reply) hello = findHello(reply);
      }
    }
    if (!hello) throw new Error("The dongle did not answer. Unplug it, then tap Connect.");
    await writeRaw(new Uint8Array([0xfa, 0xfa, 0xfa, 0xfa]));
    await sleep(50);
    const hi = hello[4] ?? 0;
    const lo = hello[5] ?? 0;
    let kind: DongleReport["kind"] = "unknown";
    if (hi === 0x02 && lo === 0xaa) kind = "d226";
    else if (hi === 0x70 && lo === 0x01) kind = "d552";
    return { hello, kind };
  };

  /** Before each write: drop stale replies; if an IN transfer is stuck, reopen and re-handshake. */
  const drain = async () => {
    if (!pending && !queue.length) return;
    if (pending) await resetIn();
    else queue.length = 0;
    await handshake();
  };

  try {
    const { hello, kind } = await handshake();
    const endpoints = assumed ? `assumed IN${epIn} OUT${epOut}` : `IN${epIn} OUT${epOut}`;
    return {
      report: {
        pid: device.productId,
        name: device.productName || "USB IR",
        kind,
        mark: `${hex(hello)} · ${endpoints}`,
      },
      write: (data) =>
        serial(async () => {
          await drain();
          await writeRaw(data);
        }),
      read: (ms) => serial(() => readRaw(ms)),
      async close() {
        closed = true;
        wake?.();
        wake = null;
        try {
          await device.releaseInterface(ifaceNumber);
        } catch {
          /* gone */
        }
        try {
          await device.close();
        } catch {
          /* gone */
        }
      },
    };
  } catch (error) {
    closed = true;
    try {
      await device.releaseInterface(ifaceNumber);
    } catch {
      /* gone */
    }
    try {
      await device.close();
    } catch {
      /* gone */
    }
    throw error;
  }
}

export async function connectDongle(): Promise<ElkLink> {
  if (!("usb" in navigator)) {
    throw new Error("This browser has no WebUSB. Use Chrome, then publish the app so it is served over HTTPS.");
  }
  const device = await navigator.usb.requestDevice({ filters: [{ vendorId: VENDOR }] });
  return openDevice(device);
}

/** Reopen a dongle the user already allowed. No picker. Null if none is granted. */
export async function reconnectDongle(): Promise<ElkLink | null> {
  if (!("usb" in navigator)) return null;
  const usb = navigator.usb as USB & { getDevices?: () => Promise<USBDevice[]> };
  if (!usb.getDevices) return null;
  const device = (await usb.getDevices()).find((item) => item.vendorId === VENDOR);
  return device ? openDevice(device) : null;
}

export async function learnSignal(link: ElkLink, ms = 12000): Promise<number[]> {
  await link.write(new Uint8Array([0xfe, 0xfe, 0xfe, 0xfe]));
  const deadline = Date.now() + ms;
  const chunks: number[] = [];
  while (Date.now() < deadline) {
    const pkt = await link.read(400);
    if (pkt) {
      chunks.push(...pkt);
      if (chunks.length > 8) break;
    }
  }
  await link.write(new Uint8Array([0xfd, 0xfd, 0xfd, 0xfd]));
  let raw = Uint8Array.from(chunks);
  if (raw.length >= 4 && raw[0] === 0xfe && raw[1] === 0xfe && raw[2] === 0xfe && raw[3] === 0xfe) {
    raw = raw.subarray(raw.length >= 6 ? 6 : 4);
  }
  const pulses = decodeLearned(raw);
  if (pulses.length < 4) throw new Error("Nothing learned. Point the original remote at the dongle and press a key.");
  return pulses;
}
