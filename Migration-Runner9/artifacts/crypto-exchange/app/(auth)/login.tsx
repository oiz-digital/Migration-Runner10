import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  SafeAreaView, KeyboardAvoidingView, Platform, ScrollView, Alert
} from 'react-native';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

export default function LoginScreen() {
  const router = useRouter();
  const colors = useColors();
  const { loginWithApi } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const showError = (msg: string) => {
    setErrorMsg(msg);
    if (Platform.OS !== 'web') Alert.alert('Login Failed', msg);
  };

  const handleLogin = async () => {
    setErrorMsg('');
    if (!email || !password) { showError('Please fill all fields'); return; }
    setLoading(true);
    try {
      await loginWithApi(email.trim(), password);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError(e?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const s = styles(colors);

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <View style={s.header}>
            <Text style={s.logo}>CryptoX</Text>
            <Text style={s.tagline}>India's Premier Crypto Exchange</Text>
          </View>

          <View style={s.card}>
            <Text style={s.title}>Welcome Back</Text>
            <Text style={s.subtitle}>Sign in to continue trading</Text>

            <View style={s.inputGroup}>
              <Text style={s.label}>Email / Phone / UID</Text>
              <View style={s.inputRow}>
                <MaterialIcons name="email" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={s.input}
                  value={email}
                  onChangeText={setEmail}
                  placeholder="Enter email or phone"
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
              </View>
            </View>

            <View style={s.inputGroup}>
              <Text style={s.label}>Password</Text>
              <View style={s.inputRow}>
                <MaterialIcons name="lock" size={18} color={colors.mutedForeground} />
                <TextInput
                  style={s.input}
                  value={password}
                  onChangeText={setPassword}
                  placeholder="Enter password"
                  placeholderTextColor={colors.mutedForeground}
                  secureTextEntry={!showPass}
                />
                <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                  <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
                </TouchableOpacity>
              </View>
            </View>

            <TouchableOpacity style={s.forgot}>
              <Text style={s.forgotText}>Forgot Password?</Text>
            </TouchableOpacity>

            {errorMsg ? (
              <View style={{ backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginBottom: 12 }}>
                <Text style={{ color: '#b91c1c', fontSize: 13, fontFamily: 'Inter_500Medium' }}>{errorMsg}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[s.btn, loading && { opacity: 0.7 }]}
              onPress={handleLogin}
              disabled={loading}
            >
              <Text style={s.btnText}>{loading ? 'Signing In...' : 'Sign In'}</Text>
            </TouchableOpacity>

            <View style={s.divider}>
              <View style={s.line} />
              <Text style={s.orText}>OR</Text>
              <View style={s.line} />
            </View>

            <TouchableOpacity style={s.googleBtn}>
              <MaterialIcons name="g-mobiledata" size={24} color={colors.foreground} />
              <Text style={s.googleText}>Continue with Google</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={s.signupLink} onPress={() => router.push('/(auth)/signup')}>
            <Text style={s.signupText}>
              Don't have an account? <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Sign Up</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, padding: 20, paddingTop: Platform.OS === 'web' ? 80 : 20, paddingBottom: Platform.OS === 'web' ? 60 : 20 },
  header: { alignItems: 'center', marginVertical: 32 },
  logo: { fontSize: 36, fontFamily: 'Inter_700Bold', color: colors.primary, letterSpacing: -1 },
  tagline: { fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginTop: 4 },
  card: { backgroundColor: colors.card, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: colors.border },
  title: { fontSize: 24, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginBottom: 24 },
  inputGroup: { marginBottom: 16 },
  label: { fontSize: 12, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, fontSize: 15, color: colors.foreground, fontFamily: 'Inter_400Regular' },
  forgot: { alignSelf: 'flex-end', marginBottom: 20 },
  forgotText: { fontSize: 13, color: colors.primary, fontFamily: 'Inter_500Medium' },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.primaryForeground },
  divider: { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 10 },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
  orText: { fontSize: 12, color: colors.mutedForeground, fontFamily: 'Inter_500Medium' },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.secondary, borderRadius: 10, paddingVertical: 12, gap: 8, borderWidth: 1, borderColor: colors.border },
  googleText: { fontSize: 15, fontFamily: 'Inter_500Medium', color: colors.foreground },
  signupLink: { marginTop: 24, alignItems: 'center' },
  signupText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
});
