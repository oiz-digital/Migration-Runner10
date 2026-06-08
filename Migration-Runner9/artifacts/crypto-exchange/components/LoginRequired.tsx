import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';

export function LoginRequired({ feature }: { feature: string }) {
  const colors = useColors();
  const router = useRouter();
  const s = styles(colors);
  return (
    <SafeAreaView style={s.container}>
      <View style={s.box}>
        <View style={s.iconWrap}>
          <Feather name="lock" size={36} color={colors.primary} />
        </View>
        <Text style={s.title}>Login Required</Text>
        <Text style={s.subtitle}>Sign in to access {feature}. New users get ₹100 trading bonus on signup.</Text>
        <TouchableOpacity style={[s.btn, { backgroundColor: colors.primary }]} onPress={() => router.push('/(auth)/login')}>
          <Text style={[s.btnText, { color: '#000' }]}>Login</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.btn, s.btnSecondary, { borderColor: colors.border }]} onPress={() => router.push('/(auth)/signup')}>
          <Text style={[s.btnText, { color: colors.foreground }]}>Create Account</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', padding: 24 },
  box: { width: '100%', maxWidth: 360, alignItems: 'center', backgroundColor: c.card, borderRadius: 18, padding: 28, borderWidth: 1, borderColor: c.border },
  iconWrap: { width: 72, height: 72, borderRadius: 36, backgroundColor: c.primary + '22', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', color: c.foreground, marginBottom: 6 },
  subtitle: { fontSize: 13, fontFamily: 'Inter_400Regular', color: c.mutedForeground, textAlign: 'center', lineHeight: 19, marginBottom: 24 },
  btn: { width: '100%', paddingVertical: 14, borderRadius: 12, alignItems: 'center', marginBottom: 10 },
  btnSecondary: { backgroundColor: 'transparent', borderWidth: 1 },
  btnText: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});
