import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import type { WeatherInfo } from '@/lib/chat';

function WeatherIcon({ icon, isDay }: { icon: string; isDay: boolean }) {
  const size = 40;
  switch (icon) {
    case 'sun':
      return (
        <Svg width={size} height={size} viewBox="0 0 40 40">
          <Circle cx="20" cy="20" r="8" fill={isDay ? '#fbbf24' : 'rgba(255,255,255,0.5)'} />
          {Array.from({ length: 8 }, (_, i) => {
            const a = (i * 45) * (Math.PI / 180);
            const stroke = isDay ? '#fbbf24' : 'rgba(255,255,255,0.4)';
            return (
              <Line
                key={i}
                x1={20 + 12 * Math.cos(a)}
                y1={20 + 12 * Math.sin(a)}
                x2={20 + 16 * Math.cos(a)}
                y2={20 + 16 * Math.sin(a)}
                stroke={stroke}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            );
          })}
        </Svg>
      );
    case 'cloud-sun':
      return (
        <Svg width={size} height={size} viewBox="0 0 40 40">
          <Circle cx="16" cy="16" r="6" fill="#fbbf24" />
          <Path d="M11 26a6 6 0 0 1 1-11.9A8 8 0 0 1 27 17.5 5.5 5.5 0 0 1 26 26H11z" fill="rgba(255,255,255,0.7)" />
        </Svg>
      );
    case 'fog':
      return (
        <Svg width={size} height={size} viewBox="0 0 40 40">
          <Path d="M11 18a6 6 0 0 1 1-11.9A8 8 0 0 1 27 9.5 5.5 5.5 0 0 1 26 18H11z" fill="rgba(255,255,255,0.5)" />
          <Line x1="10" y1="24" x2="30" y2="24" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
          <Line x1="8" y1="29" x2="32" y2="29" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" />
        </Svg>
      );
    case 'drizzle':
    case 'rain':
      return (
        <Svg width={size} height={size} viewBox="0 0 40 40">
          <Path d="M11 18a6 6 0 0 1 1-11.9A8 8 0 0 1 27 9.5 5.5 5.5 0 0 1 26 18H11z" fill="rgba(255,255,255,0.7)" />
          {([13, 20, 27] as number[]).map((x, i) => (
            <Line key={i} x1={x} y1="23" x2={x - 2} y2="30" stroke="#60a5fa" strokeWidth="2" strokeLinecap="round" />
          ))}
        </Svg>
      );
    case 'snow':
      return (
        <Svg width={size} height={size} viewBox="0 0 40 40">
          <Path d="M11 18a6 6 0 0 1 1-11.9A8 8 0 0 1 27 9.5 5.5 5.5 0 0 1 26 18H11z" fill="rgba(255,255,255,0.7)" />
          {([13, 20, 27] as number[]).map((x, i) => (
            <Circle key={i} cx={x} cy="27" r="1.6" fill="white" />
          ))}
        </Svg>
      );
    case 'storm':
      return (
        <Svg width={size} height={size} viewBox="0 0 40 40">
          <Path d="M11 16a6 6 0 0 1 1-11.9A8 8 0 0 1 27 7.5 5.5 5.5 0 0 1 26 16H11z" fill="rgba(255,255,255,0.6)" />
          <Path d="M21 18l-5 8h4l-3 7 8-10h-4l3-5z" fill="#fbbf24" />
        </Svg>
      );
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 40 40">
          <Path d="M11 20a6 6 0 0 1 1-11.9A8 8 0 0 1 27 11.5 5.5 5.5 0 0 1 26 20H11z" fill="rgba(255,255,255,0.6)" />
        </Svg>
      );
  }
}

export function WeatherWidget({ weatherInfo }: { weatherInfo: WeatherInfo }) {
  return (
    <View style={styles.card}>
      <View style={styles.info}>
        <Text style={styles.temp}>{weatherInfo.tempC}°C</Text>
        <Text style={styles.label} numberOfLines={1}>{weatherInfo.label}</Text>
        <Text style={styles.sub}>{weatherInfo.condition} · Feels {weatherInfo.feelsLikeC}°C</Text>
        <Text style={styles.sub}>Humidity {weatherInfo.humidity}% · Wind {weatherInfo.windKph} km/h</Text>
      </View>
      <WeatherIcon icon={weatherInfo.icon} isDay={weatherInfo.isDay} />
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
  info: {
    flex: 1,
    minWidth: 0,
  },
  temp: {
    fontSize: 28,
    fontWeight: '700',
    color: 'white',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.5,
  },
  label: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 6,
  },
  sub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.3)',
    marginTop: 2,
  },
});
