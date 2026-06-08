import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

interface HeaderProps {
  title: string;
  subtitle?: string;
  rightIcon?: keyof typeof Feather.glyphMap;
  onRightPress?: () => void;
}

export function Header({ title, subtitle, rightIcon, onRightPress }: HeaderProps) {
  const router = useRouter();
  const colors = useColors();
  const topPad = Platform.OS === 'web' ? 80 : 12;

  return (
    <View style={[styles.header, { backgroundColor: colors.background, borderBottomColor: colors.borderSubtle, paddingTop: topPad }]}>
      <TouchableOpacity onPress={() => router.back()} style={styles.iconBtn}>
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </TouchableOpacity>
      <View style={styles.titleContainer}>
        <Text style={[styles.title, { color: colors.foreground }]}>{title}</Text>
        {subtitle && <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>{subtitle}</Text>}
      </View>
      {rightIcon ? (
        <TouchableOpacity onPress={onRightPress} style={styles.iconBtn}>
          <Feather name={rightIcon} size={20} color={colors.foreground} />
        </TouchableOpacity>
      ) : <View style={styles.iconBtn} />}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  iconBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  titleContainer: { flex: 1, alignItems: 'center' },
  title: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  subtitle: { fontSize: 11, marginTop: 2, fontFamily: 'Inter_400Regular' },
});
