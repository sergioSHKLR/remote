import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeIr, goodweatherBytes, goodweatherPulses, necPulses } from "../src/lib/ir/protocol.ts";
import { genreOf, slotAt } from "../src/lib/guide/guide.ts";

const ac = { power: true, mode: "cool" as const, temp: 23, fan: "auto" as const, swing: false };

test("GoodWeather frame: signature byte and state bits", () => {
  const bytes = goodweatherBytes(ac, "temp+");
  assert.equal(bytes[5], 0xd5);
  assert.equal(bytes[2], 0x02);
  assert.equal(bytes[3], 0b0000_1010); // power on, swing off (2)
  assert.equal(bytes[4], (23 - 16) | (1 << 5));
  const pulses = goodweatherPulses(ac, "power");
  assert.equal(pulses.length, 2 + 6 * 16 * 2 + 4);
  assert.deepEqual(pulses.slice(0, 2), [6820, 6820]);
});

test("NEC LG power encodes into dongle frames", () => {
  const frames = encodeIr(38000, necPulses(0x04, 0x08), "d552");
  assert.ok(frames.length >= 1);
  assert.deepEqual([...frames[0]!.slice(0, 4)], [0xff, 0xff, 0xff, 0xff]);
});

test("Guide genres match what live v35 showed on Nov 17", () => {
  assert.equal(genreOf("Hoje em Dia", "News", "record").label, "Jornal");
  assert.equal(genreOf("Bora Brasil", undefined, "band").label, "Série");
  assert.equal(genreOf("Jogo Aberto", undefined, "band").label, "Esporte");
  assert.equal(genreOf("Manual de Sobrevivência para o Século 21", "Entertainment", "canal-futura").label, "Variedades");
  assert.equal(genreOf("Sou Carimbó", "Temporada 1 Episódio 2 - Grupos de Carimbó", "canal-futura").label, "Série");
  assert.equal(genreOf("Ninhos em Movimento", "Documentary", "tv-brasil").label, "Doc");
  assert.equal(genreOf("Chaves", "Sitcom", "sbt-nacional").label, "Humor");
  assert.equal(genreOf("Mais Você", "Talk", "rede-globo").label, "Variedades");
});

test("slotAt picks the airing program and the next one", () => {
  const list = [
    { start: 0, end: 10, title: "a" },
    { start: 10, end: 20, title: "b" },
    { start: 20, end: 30, title: "c" },
  ];
  assert.equal(slotAt(list, 12, 0).shown?.title, "b");
  assert.equal(slotAt(list, 12, 0).after?.title, "c");
  assert.equal(slotAt(list, 12, 1).shown?.title, "c");
  assert.equal(slotAt(list, 40, 0).shown, null);
});
