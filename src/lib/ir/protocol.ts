/** ElkSmart / Ocrustar USB IR framing, plus the TV and AC waveforms it carries. */

export type DongleKind = "d226" | "d552";

export function mangleByte(value: number): number {
  const v = value & 0xff;
  let reversed = 0;
  for (let i = 0; i < 8; i++) reversed = (reversed << 1) | ((v >> i) & 1);
  return (~reversed) & 0xff;
}

function leb128(value: number): number[] {
  const v = Math.max(0, Math.round(value));
  if (v <= 2032) return [v <= 1 ? v : Math.round(v / 16) & 0xff];
  const out: number[] = [];
  let raw = v;
  for (;;) {
    let byte = raw & 0x7f;
    raw >>= 7;
    if (raw) byte |= 0x80;
    if (byte === 0xff) byte = 0xfe;
    out.push(byte);
    if (!raw) break;
  }
  return out;
}

/** WAVZip: two most common mark/space pairs, then a 0x00 / 0x01 dictionary. */
export function compressPulses(timings: number[]): number[] {
  const pairs: [number, number][] = [];
  for (let i = 0; i < timings.length; i += 2) {
    pairs.push([Math.max(0, timings[i] ?? 0), Math.max(0, timings[i + 1] ?? 10000)]);
  }
  if (!pairs.length) return [];

  const counts = new Map<string, { pair: [number, number]; n: number; i: number }>();
  pairs.forEach((pair, i) => {
    const k = `${pair[0]},${pair[1]}`;
    const hit = counts.get(k);
    if (hit) hit.n += 1;
    else counts.set(k, { pair, n: 1, i });
  });
  const ranked = [...counts.values()].sort((a, b) => b.n - a.n || a.i - b.i);
  const first = ranked[0]?.pair ?? pairs[0]!;
  const second = ranked[1]?.pair ?? first;
  const [pair0, pair1] = [first, second].sort((a, b) => a[0] + a[1] - (b[0] + b[1])) as [
    [number, number],
    [number, number],
  ];

  const out: number[] = [];
  out.push(...leb128(pair1[0]), ...leb128(pair1[1]), ...leb128(pair0[0]), ...leb128(pair0[1]), 0xff, 0xff, 0xff);
  for (const pair of pairs) {
    if (pair[0] === pair0[0] && pair[1] === pair0[1]) out.push(0x00);
    else if (pair[0] === pair1[0] && pair[1] === pair1[1]) out.push(0x01);
    else out.push(...leb128(pair[0]), ...leb128(pair[1]));
  }
  return out;
}

class HeapNode {
  weight: number;
  constructor(weight: number) {
    this.weight = weight;
  }
}
class Leaf extends HeapNode {
  symbol: number;
  constructor(weight: number, symbol: number) {
    super(weight);
    this.symbol = symbol;
  }
}
class Branch extends HeapNode {
  left: HeapNode;
  right: HeapNode;
  constructor(left: HeapNode, right: HeapNode) {
    super(left.weight + right.weight);
    this.left = left;
    this.right = right;
  }
}

/** OpenJDK PriorityQueue tie-break: equal weights keep insertion order. */
class JavaPriorityQueue {
  private q: HeapNode[] = [];
  offer(item: HeapNode) {
    this.q.push(item);
    this.siftUp(this.q.length - 1, item);
  }
  poll(): HeapNode | undefined {
    if (!this.q.length) return undefined;
    const result = this.q[0]!;
    const last = this.q.pop()!;
    if (this.q.length) this.siftDown(0, last);
    return result;
  }
  get length() {
    return this.q.length;
  }
  private siftUp(k: number, x: HeapNode) {
    while (k > 0) {
      const parent = (k - 1) >> 1;
      const e = this.q[parent]!;
      if (x.weight >= e.weight) break;
      this.q[k] = e;
      k = parent;
    }
    this.q[k] = x;
  }
  private siftDown(k: number, x: HeapNode) {
    const half = this.q.length >> 1;
    while (k < half) {
      let child = (k << 1) + 1;
      let c = this.q[child]!;
      const right = child + 1;
      if (right < this.q.length && c.weight > this.q[right]!.weight) {
        child = right;
        c = this.q[child]!;
      }
      if (x.weight <= c.weight) break;
      this.q[k] = c;
      k = child;
    }
    this.q[k] = x;
  }
}

export function huffmanEncode(data: number[]): number[] {
  if (!data.length) return [];
  const freq = new Array<number>(256).fill(0);
  for (const b of data) freq[b & 0xff] = (freq[b & 0xff] ?? 0) + 1;

  const pq = new JavaPriorityQueue();
  for (let i = 0; i < 256; i++) if ((freq[i] ?? 0) > 0) pq.offer(new Leaf(freq[i] ?? 0, i));
  if (!pq.length) return data;
  while (pq.length > 1) {
    const left = pq.poll()!;
    const right = pq.poll()!;
    pq.offer(new Branch(left, right));
  }

  const codes: { sym: number; weight: number; bits: string }[] = [];
  const walk = (node: HeapNode, path: string) => {
    if (node instanceof Leaf) codes.push({ sym: node.symbol, weight: node.weight, bits: path || "0" });
    else if (node instanceof Branch) {
      walk(node.left, path + "0");
      walk(node.right, path + "1");
    }
  };
  walk(pq.poll()!, "");
  codes.sort((a, b) => a.sym - b.sym);
  const map = new Map(codes.map((c) => [c.sym, c.bits]));

  const out: number[] = [(codes.length >> 8) & 0xff, codes.length & 0xff];
  for (const c of codes) out.push(c.sym & 0xff, (c.weight >> 8) & 0xff, c.weight & 0xff);

  let bits = "";
  for (const b of data) bits += map.get(b & 0xff) ?? "0";
  const pad = (8 - (bits.length % 8)) % 8;
  if (pad) bits += "0".repeat(pad);
  out.push(pad & 0xff);
  for (let i = 0; i < bits.length; i += 8) out.push(Number.parseInt(bits.slice(i, i + 8), 2));
  return out;
}

function frameChecksum(frame: number[]): number {
  let s = 0;
  for (let i = 0; i < 62; i++) s += frame[i] ?? 0;
  return mangleByte((s & 0xf0) | ((s >> 8) & 0x0f));
}

/** Full dongle message: header + optional Huffman + 62-byte frames with checksum. */
export function encodeIr(freqHz: number, timings: number[], kind: DongleKind): Uint8Array[] {
  const compressed = compressPulses(timings);
  const payload = kind === "d226" ? huffmanEncode(compressed) : compressed;
  const f = (freqHz + 0x7ffff) >>> 0;
  const message = [
    0xff, 0xff, 0xff, 0xff,
    mangleByte((f >> 8) & 0xff),
    mangleByte((f >> 16) & 0xff),
    mangleByte(f & 0xff),
    mangleByte((payload.length >> 8) & 0xff),
    mangleByte(payload.length & 0xff),
    ...payload,
  ];
  const frames: Uint8Array[] = [];
  for (let offset = 0; offset < message.length; ) {
    const size = Math.min(62, message.length - offset);
    if (size === 62) {
      const buf = message.slice(offset, offset + 62);
      buf.push(frameChecksum(buf));
      frames.push(Uint8Array.from(buf));
    } else {
      frames.push(Uint8Array.from(message.slice(offset, offset + size)));
    }
    offset += size;
  }
  return frames;
}

export function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0").toUpperCase()).join(" ");
}

function pushLsb(pulses: number[], value: number, bits: number, mark: number, one: number, zero: number) {
  for (let i = 0; i < bits; i++) {
    pulses.push(mark);
    pulses.push((value >>> i) & 1 ? one : zero);
  }
}

/** Samsung NECx2 / SAMSUNG32. Address 0x07, command, both LSB-first. */
export function samsungPulses(address: number, cmd: number): number[] {
  const bytes = [address & 0xff, address & 0xff, cmd & 0xff, (~cmd) & 0xff];
  const pulses = [4500, 4500];
  for (const byte of bytes) pushLsb(pulses, byte, 8, 560, 1690, 560);
  pulses.push(560, 40000);
  return pulses;
}

/** Standard NEC. LG TVs use address 0x04. */
export function necPulses(address: number, cmd: number): number[] {
  const bytes = [address & 0xff, (~address) & 0xff, cmd & 0xff, (~cmd) & 0xff];
  const pulses = [9000, 4500];
  for (const byte of bytes) pushLsb(pulses, byte, 8, 560, 1690, 560);
  pulses.push(560, 40000);
  return pulses;
}

const COOLIX_TEMP = [0b0000, 0b0001, 0b0011, 0b0010, 0b0110, 0b0111, 0b0101, 0b0100, 0b1100, 0b1101, 0b1001, 0b1000, 0b1010, 0b1011];

export type AcMode = "cool" | "dry" | "fan" | "auto" | "heat";
export type AcFan = "auto" | "low" | "med" | "high";

/** Order MODE and FAN cycle through (live v35). */
export const AC_MODE_ORDER: AcMode[] = ["cool", "dry", "fan", "heat", "auto"];
export const AC_FAN_ORDER: AcFan[] = ["auto", "low", "med", "high"];

export type AcState = {
  power: boolean;
  mode: AcMode;
  temp: number;
  fan: AcFan;
  /** Vane swing on/off (shown on the LCD; GoodWeather sends it as a state bit). */
  swing?: boolean;
};

const COOLIX_OFF = 0xb27be0;
const COOLIX_SWING = 0xb26be0;

function coolixWord(state: AcState): number {
  if (!state.power) return COOLIX_OFF;
  let modeBits = { cool: 0, dry: 1, auto: 2, heat: 3, fan: 1 }[state.mode];
  const temp = Math.min(30, Math.max(17, state.temp));
  let tempBits = COOLIX_TEMP[temp - 17] ?? 0b1100;
  let fanBits = state.fan === "low" ? 0b100 : state.fan === "med" ? 0b010 : state.fan === "high" ? 0b001 : 0b101;
  if (state.mode === "auto" || state.mode === "dry") fanBits = 0;
  if (state.mode === "fan") {
    modeBits = 1;
    tempBits = 0b1110;
    fanBits = 0b101;
  }
  return (
    ((modeBits & 0b11) << 2) |
    ((tempBits & 0xf) << 4) |
    (0b11111 << 8) |
    ((fanBits & 0b111) << 13) |
    (0b010 << 16) |
    (0xb << 20)
  );
}

function coolixFrame(word: number): number[] {
  const pulses: number[] = [];
  for (let copy = 0; copy < 2; copy++) {
    pulses.push(4692, 4416);
    for (const shift of [16, 8, 0]) {
      const segment = (word >> shift) & 0xff;
      pushLsb(pulses, segment, 8, 552, 1656, 552);
      pushLsb(pulses, segment ^ 0xff, 8, 552, 1656, 552);
    }
    pulses.push(552, copy === 0 ? 5244 : 40000);
  }
  return pulses;
}

export function coolixPulses(state: AcState, swing = false): number[] {
  return coolixFrame(swing ? COOLIX_SWING : coolixWord(state));
}

function sumNibbles(value: number, count: number): number {
  let sum = 0;
  for (let i = 0; i < count; i++) sum += (value >>> (i * 4)) & 0xf;
  return sum & 0xf;
}

/** 28-bit LG AC. Power-off uses the known discrete off code. */
export function lgAcWord(state: AcState): number {
  if (!state.power) return 0x88c0051;
  const mode = { cool: 0, dry: 1, fan: 2, auto: 3, heat: 4 }[state.mode];
  const fan = { low: 1, med: 2, high: 4, auto: 5 }[state.fan];
  const temp = Math.min(30, Math.max(16, state.temp)) - 15;
  const packed =
    ((fan & 0xf) << 4) |
    ((temp & 0xf) << 8) |
    ((mode & 0b111) << 12) |
    (0x88 << 20);
  const checksumSource = (packed >>> 4) & 0xffff;
  return (packed & ~0xf) | sumNibbles(checksumSource, 4);
}

const LG_SWING = 0x8810001;

function lgBits(word: number, variant: "lg" | "lg2"): number[] {
  const pulses: number[] = variant === "lg2" ? [3200, 9900] : [8500, 4250];
  const mark = variant === "lg2" ? 480 : 550;
  const one = 1600;
  const zero = 550;
  pushLsb(pulses, word, 28, mark, one, zero);
  pulses.push(mark, 40000);
  return pulses;
}

export function lgAcPulses(state: AcState, variant: "lg" | "lg2", swing = false): number[] {
  return lgBits(swing ? LG_SWING : lgAcWord(state), variant);
}

/**
 * GoodWeather / Homeco 48-bit AC protocol (as documented by IRremoteESP8266 ir_Goodweather).
 * Six bytes LSB-first, each followed by its bitwise inverse. Byte 5 is the fixed 0xD5 signature.
 * Byte 2 low nibble names the button that was pressed; the rest is the full AC state.
 */
export type GoodweatherCommand = "power" | "mode" | "temp+" | "temp-" | "swing" | "fan";

const GW_COMMAND: Record<GoodweatherCommand, number> = { power: 0x0, mode: 0x1, "temp+": 0x2, "temp-": 0x3, swing: 0x4, fan: 0x5 };

export function goodweatherBytes(state: AcState, command: GoodweatherCommand): number[] {
  const mode = { auto: 0, cool: 1, dry: 2, fan: 3, heat: 4 }[state.mode];
  const fan = { auto: 0, high: 1, med: 2, low: 3 }[state.fan];
  const temp = Math.min(31, Math.max(16, state.temp)) - 16;
  const swing = state.swing ? 0 : 2; // 0 = fast swing, 2 = off
  const bytes = [0x00, 0x00, GW_COMMAND[command] & 0x0f, 0x00, 0x00, 0xd5];
  bytes[3] = (state.power ? 1 << 1 : 0) | ((swing & 0b11) << 2) | ((fan & 0b11) << 5);
  bytes[4] = (temp & 0x0f) | ((mode & 0b111) << 5);
  return bytes;
}

export function goodweatherPulses(state: AcState, command: GoodweatherCommand): number[] {
  const HDR = 6820;
  const MARK = 580;
  const ONE = 580;
  const ZERO = 1860;
  const pulses = [HDR, HDR];
  for (const byte of goodweatherBytes(state, command)) {
    pushLsb(pulses, byte, 8, MARK, ONE, ZERO);
    pushLsb(pulses, (~byte) & 0xff, 8, MARK, ONE, ZERO);
  }
  pulses.push(MARK, HDR, MARK, 40000);
  return pulses;
}

/** Learn-mode bytes from the dongle: 0xFF accumulates, everything else is a 16µs tick. */
export function decodeLearned(raw: Uint8Array): number[] {
  const timings: number[] = [];
  let carry = 0;
  for (const b of raw) {
    if (b === 0xff) carry += 0xff0;
    else {
      timings.push(b * 16 + carry);
      carry = 0;
    }
  }
  return timings;
}

export function hexByte(n: number): string {
  return (n & 0xff).toString(16).toUpperCase().padStart(2, "0");
}
