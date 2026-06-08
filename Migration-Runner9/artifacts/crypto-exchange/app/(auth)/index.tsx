import { useRouter } from 'expo-router';
import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';

export default function AuthIndex() {
  const router = useRouter();
  const colors = useColors();
  const { authBootstrapped } = useApp();

  useEffect(() => {
    if (!authBootstrapped) return;
    // Always land in tabs — guest browse mode (Binance-style)
    router.replace('/(tabs)');
  }, [authBootstrapped]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}
