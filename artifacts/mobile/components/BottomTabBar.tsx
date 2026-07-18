import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export type Tab = 'chat' | 'search' | 'lab' | 'browser';

const TABS: {
  key: Tab;
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  activeIcon: React.ComponentProps<typeof Ionicons>['name'];
}[] = [
  { key: 'chat',    label: 'Chat',    icon: 'chatbubble-outline', activeIcon: 'chatbubble' },
  { key: 'search',  label: 'Search',  icon: 'search-outline',     activeIcon: 'search' },
  { key: 'lab',     label: 'Lab',     icon: 'flask-outline',      activeIcon: 'flask' },
  { key: 'browser', label: 'Browser', icon: 'globe-outline',      activeIcon: 'globe' },
];

interface Props {
  activeTab: Tab;
  onTabPress: (tab: Tab) => void;
}

export function BottomTabBar({ activeTab, onTabPress }: Props) {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          paddingBottom: insets.bottom,
        },
      ]}
    >
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onTabPress(tab.key)}
            style={styles.tab}
          >
            {isActive && (
              <View
                style={[styles.indicator, { backgroundColor: colors.foreground }]}
              />
            )}
            <Ionicons
              name={isActive ? tab.activeIcon : tab.icon}
              size={22}
              color={isActive ? colors.foreground : colors.mutedForeground}
            />
            <Text
              style={[
                styles.label,
                { color: isActive ? colors.foreground : colors.mutedForeground },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 6,
    gap: 3,
  },
  indicator: {
    position: 'absolute',
    top: 0,
    left: '15%',
    right: '15%',
    height: 2,
    borderRadius: 1,
  },
  label: {
    fontSize: 10,
    fontFamily: 'Inter_500Medium',
  },
});
