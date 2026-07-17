import React, { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { getDeviceLocation } from '@/lib/timezone-location';

/**
 * Weather widget — shows live conditions for the user's current location.
 *
 * Speed strategy (renders like plain text):
 *   1. Module boots → AsyncStorage read fires immediately (background).
 *   2. useState initialiser returns the in-memory cache if it was already
 *      populated (same session / second render in session).
 *   3. useEffect: await the AsyncStorage promise (usually <5 ms for local
 *      storage), set state from cache → widget is visible instantly.
 *   4. Silently fetch fresh data from Open-Meteo in background; update
 *      state + cache when it arrives. No spinner, no loading text.
 *
 * Location strategy (no permissions, no network):
 *   - Device IANA timezone → embedded lookup table → city + lat/lon.
 *   - Covers every inhabited timezone on Earth.
 *   - Open-Meteo is free, keyless, and requires only lat/lon.
 */

// ── WMO weather-code helpers ─────────────────────────────────────────────────

function wmoCondition(code: number): string {
  if (code === 0)  return 'Clear sky';
  if (code <= 2)   return 'Mainly clear';
  if (code === 3)  return 'Overcast';
  if (code <= 48)  return 'Foggy';
  if (code <= 57)  return 'Drizzle';
  if (code <= 67)  return 'Rain';
  if (code <= 77)  return 'Snow';
  if (code <= 82)  return 'Rain showers';
  if (code <= 86)  return 'Snow showers';
  return 'Thunderstorm';
}

type IconKey = 'sun' | 'moon' | 'cloud-sun' | 'cloud-moon' | 'cloud' | 'fog' | 'rain' | 'snow' | 'storm';

function wmoIcon(code: number, isDay: boolean): IconKey {
  if (code === 0) return isDay ? 'sun' : 'moon';
  if (code <= 2)  return isDay ? 'cloud-sun' : 'cloud-moon';
  if (code === 3) return 'cloud';
  if (code <= 48) return 'fog';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'rain';
  if (code <= 86) return 'snow';
  return 'storm';
}

// ── SVG icons ─────────────────────────────────────────────────────────────────

function WeatherIcon({ icon, isDay }: { icon: IconKey; isDay: boolean }) {
  const sz = 44;
  const sunColor  = '#fbbf24';
  const moonColor = 'rgba(255,255,255,0.75)';
  const starColor = moonColor;
  const cloudFill = 'rgba(255,255,255,0.72)';
  const rainColor = '#60a5fa';

  switch (icon) {
    case 'sun':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 44 44">
          <Circle cx="22" cy="22" r="9" fill={sunColor} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * 45) * (Math.PI / 180);
            return <Line key={i} x1={22 + 13 * Math.cos(a)} y1={22 + 13 * Math.sin(a)}
                                  x2={22 + 18 * Math.cos(a)} y2={22 + 18 * Math.sin(a)}
                                  stroke={sunColor} strokeWidth="2" strokeLinecap="round" />;
          })}
        </Svg>
      );
    case 'moon':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 44 44">
          <Path d="M28 22a10 10 0 1 1-10-10 8 8 0 0 0 10 10z" fill={moonColor} />
          <Circle cx="34" cy="10" r="1.4" fill={starColor} />
          <Circle cx="30" cy="6"  r="1"   fill={starColor} />
          <Circle cx="36" cy="16" r="1"   fill={starColor} />
        </Svg>
      );
    case 'cloud-sun':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 44 44">
          <Circle cx="18" cy="15" r="7" fill={sunColor} />
          {Array.from({ length: 6 }, (_, i) => {
            const a = (i * 60) * (Math.PI / 180);
            return <Line key={i} x1={18 + 10 * Math.cos(a)} y1={15 + 10 * Math.sin(a)}
                                  x2={18 + 13 * Math.cos(a)} y2={15 + 13 * Math.sin(a)}
                                  stroke={sunColor} strokeWidth="1.5" strokeLinecap="round" />;
          })}
          <Path d="M10 32a7 7 0 0 1 .5-14A9 9 0 0 1 28 21a6 6 0 0 1-.5 11H10z" fill={cloudFill} />
        </Svg>
      );
    case 'cloud-moon':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 44 44">
          <Path d="M26 14a7 7 0 1 1-7-7 5.5 5.5 0 0 0 7 7z" fill={moonColor} />
          <Path d="M10 32a7 7 0 0 1 .5-14A9 9 0 0 1 28 21a6 6 0 0 1-.5 11H10z" fill={cloudFill} />
        </Svg>
      );
    case 'cloud':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 44 44">
          <Path d="M8 30a8 8 0 0 1 1-16A10 10 0 0 1 30 17a7 7 0 0 1-1 13H8z" fill={cloudFill} />
        </Svg>
      );
    case 'fog':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 44 44">
          <Path d="M8 22a8 8 0 0 1 1-16A10 10 0 0 1 30 9a7 7 0 0 1-1 13H8z" fill="rgba(255,255,255,0.45)" />
          <Line x1="8"  y1="28" x2="36" y2="28" stroke="rgba(255,255,255,0.35)" strokeWidth="2.5" strokeLinecap="round" />
          <Line x1="12" y1="34" x2="32" y2="34" stroke="rgba(255,255,255,0.25)" strokeWidth="2"   strokeLinecap="round" />
        </Svg>
      );
    case 'rain':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 44 44">
          <Path d="M8 24a8 8 0 0 1 1-16A10 10 0 0 1 30 11a7 7 0 0 1-1 13H8z" fill={cloudFill} />
          {([11, 19, 27] as number[]).map((x, i) => (
            <Line key={i} x1={x} y1="28" x2={x - 3} y2="36"
              stroke={rainColor} strokeWidth="2.2" strokeLinecap="round" />
          ))}
        </Svg>
      );
    case 'snow':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 44 44">
          <Path d="M8 24a8 8 0 0 1 1-16A10 10 0 0 1 30 11a7 7 0 0 1-1 13H8z" fill={cloudFill} />
          {([11, 19, 27] as number[]).map((x, i) => (
            <Circle key={i} cx={x} cy="32" r="2.2" fill="white" />
          ))}
        </Svg>
      );
    case 'storm':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 44 44">
          <Path d="M8 22a8 8 0 0 1 1-16A10 10 0 0 1 30 9a7 7 0 0 1-1 13H8z" fill="rgba(255,255,255,0.5)" />
          <Path d="M22 22l-6 9h5l-4 9 10-13h-6l4-5z" fill="#fbbf24" />
        </Svg>
      );
  }
}

// ── Cache (module-level, persists for the app session) ───────────────────────

interface LiveWeather {
  label:      string;
  tempC:      number;
  feelsLikeC: number;
  condition:  string;
  icon:       IconKey;
  windKph:    number;
  humidity:   number;
  isDay:      boolean;
}

const CACHE_KEY = 'wx_v3';
const CACHE_TTL = 20 * 60 * 1000; // 20 min — refresh in background after this

// In-memory slot filled from AsyncStorage on first module import.
// useState(() => _mem) means components that mount later in the same session
// already have data and render in one pass — no flicker.
let _mem: LiveWeather | null = null;

const _ready = AsyncStorage.getItem(CACHE_KEY).then((raw) => {
  if (!raw) return;
  try {
    const { data, at } = JSON.parse(raw) as { data: LiveWeather; at: number };
    if (Date.now() - at < CACHE_TTL * 3) _mem = data; // keep up to 1 h for instant display
  } catch {}
});

async function persist(data: LiveWeather) {
  _mem = data;
  await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ data, at: Date.now() }));
}

// ── Fetch from Open-Meteo (free, keyless) ────────────────────────────────────

const LOC = getDeviceLocation();

async function fetchFresh(): Promise<LiveWeather | null> {
  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${LOC.lat}&longitude=${LOC.lon}` +
      `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m` +
      `&wind_speed_unit=kmh`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const d   = await res.json();
    const cur = d?.current;
    if (!cur) return null;
    const isDay = cur.is_day === 1;
    return {
      label:      LOC.city + (LOC.country ? `, ${LOC.country}` : ''),
      tempC:      Math.round(cur.temperature_2m),
      feelsLikeC: Math.round(cur.apparent_temperature),
      condition:  wmoCondition(cur.weather_code),
      icon:       wmoIcon(cur.weather_code, isDay),
      windKph:    Math.round(cur.wind_speed_10m),
      humidity:   cur.relative_humidity_2m,
      isDay,
    };
  } catch { return null; }
}

// ── Widget ────────────────────────────────────────────────────────────────────

export function WeatherWidget() {
  // Reads _mem synchronously — if the module-level cache was already populated
  // (same session, or a fast AsyncStorage read before first mount), the widget
  // renders on frame 1 with no loading state whatsoever.
  const [weather, setWeather] = useState<LiveWeather | null>(() => _mem);

  useEffect(() => {
    let live = true;
    (async () => {
      // 1. Await the initial AsyncStorage read (usually resolves in <5 ms).
      //    If it populated _mem and we don't have data yet, show it.
      await _ready;
      if (live && !weather && _mem) setWeather(_mem);

      // 2. Fetch fresh weather silently in the background.
      const fresh = await fetchFresh();
      if (live && fresh) {
        setWeather(fresh);
        persist(fresh);
      }
    })();
    return () => { live = false; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // No cache and no fresh data yet — show a minimal placeholder that
  // occupies the same space so there is no layout shift when data arrives.
  if (!weather) {
    return (
      <View style={[styles.card, styles.placeholder]}>
        <View style={styles.tempPlaceholder} />
        <View style={styles.linePlaceholder} />
        <View style={[styles.linePlaceholder, { width: '60%' }]} />
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.temp}>{weather.tempC}°C</Text>
        <Text style={styles.label} numberOfLines={1}>{weather.label}</Text>
        <Text style={styles.sub}>{weather.condition} · Feels {weather.feelsLikeC}°C</Text>
        <Text style={styles.sub}>Humidity {weather.humidity}% · Wind {weather.windKph} km/h</Text>
      </View>
      <WeatherIcon icon={weather.icon} isDay={weather.isDay} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.09)',
    backgroundColor: 'rgba(255,255,255,0.03)',
    maxWidth: 290,
    alignSelf: 'flex-start',
  },
  placeholder: { flexDirection: 'column', gap: 8, alignItems: 'flex-start' },
  tempPlaceholder: { width: 70, height: 28, borderRadius: 6, backgroundColor: 'rgba(255,255,255,0.07)' },
  linePlaceholder: { width: '80%', height: 11, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.05)' },
  info:  { flex: 1, minWidth: 0 },
  temp:  { fontSize: 28, fontWeight: '700', color: 'white', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  label: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 },
  sub:   { fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 2 },
});
