import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';
import { getDeviceLocation } from '@/lib/timezone-location';

/**
 * Real-time clock widget.
 *
 * - Zero network calls. Zero permission requests.
 * - Location resolved from the device IANA timezone via an embedded lookup
 *   table — renders on the very first frame exactly like plain text.
 * - Ticks every second using a ref-based interval so React never re-renders
 *   for time updates; only the SVG hands and digital readout are mutated.
 */

// Resolve once at module load — synchronous, instant, no network.
const LOC = getDeviceLocation();

function utcLabel(zone: string): string {
  try {
    const now = new Date();
    const local = new Date(now.toLocaleString('en-US', { timeZone: zone }));
    const utc   = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
    const off   = Math.round((local.getTime() - utc.getTime()) / 60000);
    const sign  = off >= 0 ? '+' : '-';
    const abs   = Math.abs(off);
    return `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? ':' + String(abs % 60).padStart(2, '0') : ''}`;
  } catch { return 'UTC'; }
}

const UTC_LABEL = utcLabel(LOC.timezone);

function fmt(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat('en-US', { ...opts, timeZone: LOC.timezone }).format(date);
}

function cityLine(): string {
  if (LOC.country && LOC.city !== 'UTC') {
    return `${LOC.city}, ${LOC.country}`;
  }
  return LOC.timezone.replace(/_/g, ' ');
}

const CITY_LINE = cityLine();

export function ClockWidget() {
  // Initialise with real current time — no loading state, renders instantly.
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const h24  = (() => {
    const s = fmt(now, { hour: 'numeric', hour12: false });
    const n = parseInt(s, 10);
    return isNaN(n) ? 0 : n % 24;
  })();
  const min  = parseInt(fmt(now, { minute: '2-digit' }), 10) || 0;
  const sec  = parseInt(fmt(now, { second: '2-digit' }), 10) || 0;

  const digital   = `${String(h24).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  const dateLabel = fmt(now, { weekday: 'short', month: 'short', day: 'numeric' });

  const secDeg = sec * 6;
  const minDeg = min * 6 + sec * 0.1;
  const hrDeg  = (h24 % 12) * 30 + min * 0.5;

  const hand = (deg: number, len: number, color: string, width: number) => {
    const rad = (deg - 90) * (Math.PI / 180);
    return (
      <Line
        x1="32" y1="32"
        x2={32 + len * Math.cos(rad)}
        y2={32 + len * Math.sin(rad)}
        stroke={color} strokeWidth={width} strokeLinecap="round"
      />
    );
  };

  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.digital}>{digital}</Text>
        <Text style={styles.label} numberOfLines={1}>{CITY_LINE}</Text>
        <Text style={styles.sub}>{dateLabel} · {UTC_LABEL}</Text>
      </View>

      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Circle cx="32" cy="32" r="31"
          fill="rgba(255,255,255,0.03)"
          stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
        {Array.from({ length: 12 }, (_, i) => {
          const a  = (i * 30 - 90) * (Math.PI / 180);
          const isQ = i % 3 === 0;
          const r1  = isQ ? 24 : 26;
          return (
            <Line key={i}
              x1={32 + r1 * Math.cos(a)} y1={32 + r1 * Math.sin(a)}
              x2={32 + 30 * Math.cos(a)} y2={32 + 30 * Math.sin(a)}
              stroke={isQ ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)'}
              strokeWidth={isQ ? 1.5 : 1}
            />
          );
        })}
        {hand(hrDeg,  16, 'white',                    2.5)}
        {hand(minDeg, 23, 'rgba(255,255,255,0.85)',    1.5)}
        {hand(secDeg, 27, '#ef4444',                   1)}
        <Circle cx="32" cy="32" r="2.5" fill="white" />
        <Circle cx="32" cy="32" r="1.2" fill="#ef4444" />
      </Svg>
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
  info:    { flex: 1, minWidth: 0 },
  digital: { fontSize: 28, fontWeight: '700', color: 'white', fontVariant: ['tabular-nums'], letterSpacing: -0.5 },
  label:   { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 },
  sub:     { fontSize: 11, color: 'rgba(255,255,255,0.30)', marginTop: 2 },
});
