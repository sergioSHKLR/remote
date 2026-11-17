/**
 * Guide tab: Itajaí open-air lineup, live listings, and genre colors.
 * Channel list, genre rules and storage key are ported from the live remir.grok.me v35 bundle.
 *
 * The live app fetched listings through a grok.me server function. This copy calls the same
 * public source (GradeTV, https://gradetv.net/api/programacao/{slug}, CORS open) from the browser.
 */

export type GuideChannel = {
  id: string;
  name: string;
  /** Number typed on the TV remote, e.g. "10.1". */
  number: string;
  /** GradeTV schedule slug. Missing = no live grid. */
  feed?: string;
  /** Physical RF channel, shown in small type. */
  rf?: string;
};

export type Listing = { start: number; end: number; title: string; cat?: string };

export const FEEDS: Record<string, string> = {
  globo: "rede-globo",
  record: "record",
  band: "band",
  futura: "canal-futura",
  brasil: "tv-brasil",
  news: "record-news",
  sbt: "sbt-nacional",
};

export const RF: Record<string, string> = {
  globo: "UHF 33",
  globo2: "UHF 35",
  record: "UHF 28",
  inova: "UHF 28",
  band: "UHF 32",
  futura: "UHF 14",
  brasil: "UHF 22",
  news: "UHF 31",
  sbt: "UHF 23",
  verdade: "UHF 47",
};

export const DEFAULT_CHANNELS: GuideChannel[] = [
  { id: "record", name: "NDTV HD", number: "10.1", feed: FEEDS.record },
  { id: "band", name: "TVBV HD", number: "13.1", feed: FEEDS.band },
  { id: "futura", name: "Univali TV", number: "18.1", feed: FEEDS.futura },
  { id: "brasil", name: "TVBE HD", number: "21.1", feed: FEEDS.brasil },
  { id: "news", name: "Record News", number: "27.1", feed: FEEDS.news },
  { id: "sbt", name: "SCC SBT HD", number: "45.1", feed: FEEDS.sbt },
  { id: "verdade", name: "TV Verdade HD", number: "47.1" },
  { id: "globo2", name: "NSCTV HD", number: "49.1", feed: FEEDS.globo },
];

const STORE = "remir.guide.v6";

/** Re-attach feed and RF from the known tables (same as live). */
function normalize(channel: GuideChannel): GuideChannel {
  const feed = FEEDS[channel.id];
  const rf = RF[channel.id];
  return { ...channel, ...(feed ? { feed } : {}), ...(rf ? { rf } : {}) };
}

function isChannel(value: unknown): value is GuideChannel {
  if (!value || typeof value !== "object") return false;
  const c = value as GuideChannel;
  return typeof c.id === "string" && typeof c.name === "string" && typeof c.number === "string";
}

export function loadChannels(): GuideChannel[] {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return DEFAULT_CHANNELS.map((c) => ({ ...c }));
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return DEFAULT_CHANNELS.map((c) => ({ ...c }));
    const list = parsed.filter(isChannel).map(normalize);
    return list.length ? list : DEFAULT_CHANNELS.map((c) => ({ ...c }));
  } catch {
    return DEFAULT_CHANNELS.map((c) => ({ ...c }));
  }
}

export function saveChannels(channels: GuideChannel[]) {
  localStorage.setItem(STORE, JSON.stringify(channels.map(normalize)));
}

/** The program `step` slots after the one airing at `now` (step 0 = on now). */
export function slotAt(listing: Listing[] | undefined, now: number, step: number): { shown: Listing | null; after: Listing | null } {
  if (!listing?.length || step < 0) return { shown: null, after: null };
  const first = listing.findIndex((p) => p.end > now);
  if (first < 0) return { shown: null, after: null };
  return { shown: listing[first + step] ?? null, after: listing[first + step + 1] ?? null };
}

const clock = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
export function hhmm(t: number): string {
  return clock.format(t);
}

type RawProgram = { inicio: string; fim: string; titulo: string; categoria?: string };
type RawSchedule = { canal?: { logo_url?: string }; guia?: { programas?: RawProgram[] } };

/** Replaces the live server function: today's grid and logo for each GradeTV slug. */
export async function fetchListings(slugs: string[]): Promise<{ listings: Record<string, Listing[]>; logos: Record<string, string> }> {
  const listings: Record<string, Listing[]> = {};
  const logos: Record<string, string> = {};
  let failures = 0;
  await Promise.all(
    slugs.map(async (slug) => {
      try {
        const res = await fetch(`https://gradetv.net/api/programacao/${encodeURIComponent(slug)}`);
        if (!res.ok) throw new Error(String(res.status));
        const body = (await res.json()) as RawSchedule;
        if (body.canal?.logo_url) logos[slug] = body.canal.logo_url;
        listings[slug] = (body.guia?.programas ?? [])
          .map((p) => ({ start: Date.parse(p.inicio), end: Date.parse(p.fim), title: p.titulo, cat: p.categoria }))
          .filter((p) => Number.isFinite(p.start) && Number.isFinite(p.end) && !!p.title)
          .sort((a, b) => a.start - b.start);
      } catch {
        failures += 1;
      }
    }),
  );
  if (slugs.length && failures === slugs.length) throw new Error("Live grid unavailable.");
  return { listings, logos };
}

// ---- Genres (verbatim rules from live v35) ----

export type Genre = "news" | "sport" | "br" | "tr" | "dub" | "comedy" | "kids" | "faith" | "talk" | "doc" | "drama" | "reality";

export const GENRE_LABEL: Record<Genre, string> = {
  news: "Jornal",
  sport: "Esporte",
  br: "Novela BR",
  tr: "Novela TR",
  dub: "Dublada",
  comedy: "Humor",
  kids: "Infantil",
  faith: "Fé",
  talk: "Variedades",
  doc: "Doc",
  drama: "Série",
  reality: "Reality",
};

const NOVELAS_BR = [
  "roque santeiro", "avenida brasil", "la na minha terra", "por voce", "quem ama cuida", "a nobreza do amor",
  "no rancho fundo", "terra e paixao", "travessia", "pantanal", "renascer", "vale tudo", "o clone",
  "senhora do destino", "a favorita", "belissima",
];
const NOVELAS_TR = [
  "iludida", "a traicao", "guerra das rosas", "forca de mulher", "ezel", "fatmagul", "a forca do destino", "hercai",
  "terra amarga", "amor proibido", "uma questao de honra", "dinheiro sujo", "kara sevda", "sadakatsiz", "aldatmak",
  "minha vida",
];
const NOVELAS_DUB = [
  "marisol", "marimar", "o que a vida me roubou", "amor valente", "a usurpadora", "maria do bairro", "rubi",
  "a madrasta", "a feia mais bela", "carinha de anjo", "carrossel", "chiquititas", "cumplices de um resgate",
  "poliana", "sortilegio", "triunfo do amor", "abismo de paixao", "a que nao podia amar", "a historia de joana",
  "domenica montero", "coracao indomavel",
];

function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function inList(title: string, list: string[]): boolean {
  return list.some((name) => title === name || (name.length > 4 && title.includes(name)));
}

function novelaKind(title: string, feed?: string): Genre {
  const t = fold(title);
  if (inList(t, NOVELAS_BR)) return "br";
  if (t === "mae" || inList(t, NOVELAS_TR)) return "tr";
  if (inList(t, NOVELAS_DUB)) return "dub";
  if (feed === "rede-globo") return "br";
  if (feed === "record" || feed === "band") return "tr";
  return "dub";
}

function fromCategory(cat: string): Genre | null {
  const c = fold(cat);
  if (!c || c.startsWith("temporada")) return null;
  if (c.startsWith("soap")) return "br";
  if (c.includes("news")) return "news";
  if (c.includes("sport") || c.includes("soccer")) return "sport";
  if (c.includes("comedy") || c.includes("sitcom")) return "comedy";
  if (c.includes("child") || c.includes("adventure")) return "kids";
  if (c.includes("relig")) return "faith";
  if (["talk", "variety", "interview", "entertain", "music"].some((w) => c.includes(w))) return "talk";
  if (["doc", "educ", "histor", "travel", "environment", "art", "community"].some((w) => c.includes(w))) return "doc";
  if (c.includes("reality")) return "reality";
  if (c.includes("drama") || c.includes("western")) return "drama";
  return null;
}

function fromTitle(title: string): Genre | null {
  const t = fold(title);
  if (/jornal|noticia|reporter|balanco|alerta|hora 1|bom dia|cidades|encontro com/.test(t)) return "news";
  if (/esporte|futebol|jogo aberto|donos da bola|galvao/.test(t)) return "sport";
  if (/^a fazenda\b|reality/.test(t)) return "reality";
  if (/\b(jesus|reis)\b|palavra amiga|prosperidade|show da fe|igreja/.test(t)) return "faith";
  if (/mundo bita|pipo e fifi|infantil/.test(t)) return "kids";
  return null;
}

export function genreOf(title: string, cat?: string, feed?: string): { id: Genre; label: string } {
  const id: Genre =
    fold(cat ?? "").startsWith("soap") || /\bnovela\b/.test(fold(title))
      ? novelaKind(title, feed)
      : (fromCategory(cat ?? "") ?? fromTitle(title) ?? "drama");
  return { id, label: GENRE_LABEL[id] };
}
