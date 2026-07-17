import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line } from 'react-native-svg';

/**
 * Real-time clock widget.
 * Silently detects the user's timezone via IP geolocation (no permission prompt).
 * Falls back to the device's own timezone if the lookup fails.
 */
export function ClockWidget() {
  const [now, setNow] = useState(() => new Date());
  const [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone);
  const [cityLabel, setCityLabel] = useState('');

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Silently resolve location via IP — no permission needed
  useEffect(() => {
    fetch('https://ipapi.co/json/')
      .then((r) => r.json())
      .then((d) => {
        if (d.timezone) setZone(d.timezone);
        const label = [d.city, d.country_name].filter(Boolean).join(', ');
        if (label) setCityLabel(label);
      })
      .catch(() => {/* keep device defaults */});
  }, []);

  const fmt = (opts: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat('en-US', { ...opts, timeZone: zone }).format(now);

  const hours24 = (() => {
    const h = parseInt(fmt({ hour: 'numeric', hour12: false }), 10);
    return isNaN(h) ? 0 : h % 24;
  })();
  const minutes = parseInt(fmt({ minute: '2-digit' }), 10) || 0;
  const seconds = parseInt(fmt({ second: '2-digit' }), 10) || 0;

  const digital   = `${String(hours24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  const dateLabel = fmt({ weekday: 'short', month: 'short', day: 'numeric' });

  const utcOffsetMin = (() => {
    try {
      const diff =
        (new Date(now.toLocaleString('en-US', { timeZone: zone })).getTime() -
         new Date(now.toLocaleString('en-US', { timeZone: 'UTC'  })).getTime()) / 60000;
      return Math.round(diff);
    } catch { return 0; }
  })();
  const sign     = utcOffsetMin >= 0 ? '+' : '-';
  const abs      = Math.abs(utcOffsetMin);
  const utcLabel = `UTC${sign}${Math.floor(abs / 60)}${abs % 60 ? ':' + String(abs % 60).padStart(2, '0') : ''}`;

  const secDeg = seconds * 6;
  const minDeg = minutes * 6 + seconds * 0.1;
  const hrDeg  = (hours24 % 12) * 30 + minutes * 0.5;

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
        <Text style={styles.label} numberOfLines={1}>
          {cityLabel || zone.replace(/_/g, ' ')}
        </Text>
        <Text style={styles.sub}>{dateLabel} · {utcLabel}</Text>
      </View>

      <Svg width={64} height={64} viewBox="0 0 64 64">
        <Circle cx="32" cy="32" r="31"
          fill="rgba(255,255,255,0.03)"
          stroke="rgba(255,255,255,0.12)" strokeWidth={1} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i * 30 - 90) * (Math.PI / 180);
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
        {hand(hrDeg,  16, 'white', 2.5)}
        {hand(minDeg, 23, 'rgba(255,255,255,0.85)', 1.5)}
        {hand(secDeg, 27, '#ef4444', 1)}
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
  info: { flex: 1, minWidth: 0 },
  digital: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  label: { fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 6 },
  sub:   { fontSize: 11, color: 'rgba(255,255,255,0.3)',  marginTop: 2 },
});
