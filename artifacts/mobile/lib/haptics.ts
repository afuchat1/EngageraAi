import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

const KEY = 'engagera_haptics_enabled';
let enabled = true;
let loaded = false;

export async function loadHapticsPreference(): Promise<boolean> {
  if (loaded) return enabled;
  const stored = await AsyncStorage.getItem(KEY);
  enabled = stored !== 'false';
  loaded = true;
  return enabled;
}

export function getHapticsEnabled(): boolean {
  return enabled;
}

export async function setHapticsEnabled(value: boolean): Promise<void> {
  enabled = value;
  loaded = true;
  await AsyncStorage.setItem(KEY, value ? 'true' : 'false');
}

export function hapticImpact(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  if (enabled) Haptics.impactAsync(style);
}

export function hapticSelection() {
  if (enabled) Haptics.selectionAsync();
}

export function hapticSuccess() {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

export function hapticError() {
  if (enabled) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
}
