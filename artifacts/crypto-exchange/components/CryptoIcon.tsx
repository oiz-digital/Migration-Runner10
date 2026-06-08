import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useColors } from '@/hooks/useColors';

const COIN_COLORS: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  BNB: '#F3BA2F',
  SOL: '#9945FF',
  XRP: '#346AA9',
  ADA: '#0033AD',
  DOGE: '#C2A633',
  MATIC: '#8247E5',
  AVAX: '#E84142',
  DOT: '#E6007A',
  LINK: '#2A5ADA',
  UNI: '#FF007A',
  SHIB: '#FFA409',
  LTC: '#BEBEBE',
  ATOM: '#2E3148',
  USDT: '#26A17B',
  USDC: '#2775CA',
  INR: '#FF9933',
};

interface CryptoIconProps {
  symbol: string;
  size?: number;
}

export function CryptoIcon({ symbol, size = 36 }: CryptoIconProps) {
  const colors = useColors();
  const bgColor = COIN_COLORS[symbol] || colors.primary;
  const initials = symbol.slice(0, 3);

  return (
    <View style={[styles.container, { width: size, height: size, borderRadius: size / 2, backgroundColor: bgColor }]}>
      <Text style={[styles.text, { fontSize: size * 0.32 }]}>{initials}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontFamily: 'Inter_700Bold',
  },
});
