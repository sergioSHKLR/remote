/**
 * Weather for the card under the AC remote.
 * The live app read this from a grok.me server function whose source is not in the client bundle.
 * This copy asks Open-Meteo (free, no key, CORS open) for Itajaí's current conditions.
 */
export type WxKind = "clear" | "fair" | "partly" | "cloudy" | "fog" | "rain" | "heavy" | "showers" | "thunder" | "snow" | "sleet";
export type Weather = { kind: WxKind; temp: number; label: string };

const ITAJAI = { lat: -26.9078, lon: -48.6619 };

function fromWmo(code: number, isDay: boolean): { kind: WxKind; label: string } {
  if (code === 0) return { kind: "clear", label: isDay ? "Sunny" : "Clear" };
  if (code === 1) return { kind: "fair", label: "Mostly clear" };
  if (code === 2) return { kind: "partly", label: "Partly cloudy" };
  if (code === 3) return { kind: "cloudy", label: "Cloudy" };
  if (code === 45 || code === 48) return { kind: "fog", label: "Fog" };
  if (code >= 51 && code <= 57) return { kind: "rain", label: "Drizzle" };
  if (code === 61 || code === 63) return { kind: "rain", label: "Rain" };
  if (code === 65) return { kind: "heavy", label: "Heavy rain" };
  if (code === 66 || code === 67) return { kind: "sleet", label: "Freezing rain" };
  if (code >= 71 && code <= 77) return { kind: "snow", label: "Snow" };
  if (code >= 80 && code <= 82) return { kind: "showers", label: "Showers" };
  if (code === 85 || code === 86) return { kind: "snow", label: "Snow showers" };
  if (code >= 95) return { kind: "thunder", label: "Thunderstorm" };
  return { kind: "cloudy", label: "Cloudy" };
}

export async function fetchWeather(): Promise<Weather> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${ITAJAI.lat}&longitude=${ITAJAI.lon}&current=temperature_2m,weather_code,is_day&timezone=America%2FSao_Paulo`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Weather ${res.status}`);
  const body = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number; is_day?: number } };
  const cur = body.current;
  if (!cur || typeof cur.temperature_2m !== "number") throw new Error("No weather");
  return { ...fromWmo(cur.weather_code ?? 3, cur.is_day !== 0), temp: Math.round(cur.temperature_2m) };
}
