import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';

// ── WMO weather-code helpers ──────────────────────────────────────────────────

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

function wmoIcon(code: number, isDay: boolean): string {
  if (code === 0) return isDay ? 'sun' : 'sun';
  if (code <= 2)  return 'cloud-sun';
  if (code === 3) return 'cloud';
  if (code <= 48) return 'fog';
  if (code <= 57) return 'drizzle';
  if (code <= 67) return 'rain';
  if (code <= 77) return 'snow';
  if (code <= 82) return 'rain';
  if (code <= 86) return 'snow';
  return 'storm';
}

// ── Icon renderer ─────────────────────────────────────────────────────────────

function WeatherIcon({ icon, isDay }: { icon: string; isDay: boolean }) {
  const sz = 40;
  switch (icon) {
    case 'sun':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 40 40">
          <Circle cx="20" cy="20" r="8" fill={isDay ? '#fbbf24' : 'rgba(255,255,255,0.5)'} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * 45) * (Math.PI / 180);
            return (
              <Line key={i}
                x1={20 + 12 * Math.cos(a)} y1={20 + 12 * Math.sin(a)}
                x2={20 + 16 * Math.cos(a)} y2={20 + 16 * Math.sin(a)}
                stroke={isDay ? '#fbbf24' : 'rgba(255,255,255,0.4)'}
                strokeWidth="1.5" strokeLinecap="round" />
            );
          })}
        </Svg>
      );
    case 'cloud-sun':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 40 40">
          <Circle cx="16" cy="16" r="6" fill="#fbbf24" />
          <Path d="M11 26a6 6 0 0 1 1-11.9A8 8 0 0 1 27 17.5 5.5 5.5 0 0 1 26 26H11z" fill="rgba(255,255,255,0.7)" />
        </Svg>
      );
    case 'fog':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 40 40">
          <Path d="M11 18a6 6 0 0 1 1-11.9A8 8 0 0 1 27 9.5 5.5 5.5 0 0 1 26 18H11z" fill="rgba(255,255,255,0.5)" />
          <Line x1="10" y1="24" x2="30" y2="24" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
          <Line x1="8"  y1="29" x2="32" y2="29" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
        </Svg>
      );
    case 'drizzle':
    case 'rain':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 40 40">
          <Path d="M11 18a6 6 0 0 1 1-11.9A8 8 0 0 1 27 9.5 5.5 5.5 0 0 1 26 18H11z" fill="rgba(255,255,255,0.7)" />
          {([13, 20, 27] as number[]).map((x, i) => (
            <Line key={i} x1={x} y1="23" x2={x - 2} y2="30" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
          ))}
        </Svg>
      );
    case 'snow':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 40 40">
          <Path d="M11 18a6 6 0 0 1 1-11.9A8 8 0 0 1 27 9.5 5.5 5.5 0 0 1 26 18H11z" fill="rgba(255,255,255,0.7)" />
          {([13, 20, 27] as number[]).map((x, i) => (
            <Circle key={i} cx={x} cy="27" r="1.6" fill="white" />
          ))}
        </Svg>
      );
    case 'storm':
      return (
        <Svg width={sz} height={sz} viewBox="0 0 40 40">
          <Path d="M11 16a6 6 0 0 1 1-11.9A8 8 0 0 1 27 7.5 5.5 5.5 0 0 1 26 16H11z" fill="rgba(255,255,255,0.6)" />
          <Path d="M21 18l-5 8h4l-3 7 8-10h-4l3-5z" fill="#fbbf24" />
        </Svg>
      );
    default:
      return (
        <Svg width={sz} height={sz} viewBox="0 0 40 40">
          <Path d="M11 20a6 6 0 0 1 1-11.9A8 8 0 0 1 27 11.5 5.5 5.5 0 0 1 26 20H11z" fill="rgba(255,255,255,0.6)" />
        </Svg>
      );
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface LiveWeather {
  label:      string;
  tempC:      number;
  feelsLikeC: number;
  condition:  string;
  icon:       string;
  windKph:    number;
  humidity:   number;
  isDay:      boolean;
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function WeatherWidget() {
  const [weather, setWeather] = useState<LiveWeather | null>(null);
  const [error,   setError]   = useState('');

  useEffect(() => {
    (async () => {
      try {
        // 1. IP geolocation — same source as ClockWidget, no permission needed
        const geoRes = await fetch('https://ipapi.co/json/');
        if (!geoRes.ok) throw new Error(`geo ${geoRes.status}`);
        const geo = await geoRes.json();

        // Guard: ipapi returns {error:true} when rate-limited
        const lat = typeof geo.latitude  === 'number' ? geo.latitude  : parseFloat(geo.latitude);
        const lon = typeof geo.longitude === 'number' ? geo.longitude : parseFloat(geo.longitude);
        if (!isFinite(lat) || !isFinite(lon)) throw new Error('location unavailable');

        const label = [geo.city, geo.country_name].filter(Boolean).join(', ') || 'Your location';

        // 2. Live weather from Open-Meteo (free, no API key)
        const wxUrl =
          `https://api.open-meteo.com/v1/forecast` +
          `?latitude=${lat}&longitude=${lon}` +
          `&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m` +
          `&wind_speed_unit=kmh`;
        const wxRes = await fetch(wxUrl);
        if (!wxRes.ok) throw new Error(`weather ${wxRes.status}`);
        const wxData = await wxRes.json();
        const cur    = wxData.current;
        if (!cur) throw new Error('no current weather data');

        setWeather({
          label,
          tempC:      Math.round(cur.temperature_2m),
          feelsLikeC: Math.round(cur.apparent_temperature),
          condition:  wmoCondition(cur.weather_code),
          icon:       wmoIcon(cur.weather_code, cur.is_day === 1),
          windKph:    Math.round(cur.wind_speed_10m),
          humidity:   cur.relative_humidity_2m,
          isDay:      cur.is_day === 1,
        });
      } catch {
        // Silent failure — widget simply stays in loading state rather than
        // surfacing a raw error message inside the chat UI
        setError('Weather unavailable');
      }
    })();
  }, []);

  if (error) {
    return (
      <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
        <Text style={styles.sub}>{error}</Text>
      </View>
    );
  }

  if (!weather) {
    return (
      <View style={[styles.card, { flexDirection: 'row', alignItems: 'center', gap: 10 }]}>
        <ActivityIndicator size="small" color="rgba(255,255,255,0.5)" />
        <Text style={styles.sub}>Getting your weather…</Text>
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
  info:  { flex: 1, minWidth: 0 },
  temp:  { fontSize: 28, fontWeight: '700', color: 'white', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  label: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 },
  sub:   { fontSize: 11, color: 'rgba(255,255,255,0.3)',  marginTop: 2 },
});
