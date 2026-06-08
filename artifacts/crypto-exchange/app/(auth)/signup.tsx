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

export default function SignupScreen() {
  const router = useRouter();
  const colors = useColors();
  const { signupWithApi } = useApp();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [referral, setReferral] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const showError = (msg: string) => {
    setErrorMsg(msg);
    if (Platform.OS !== 'web') Alert.alert('Sign Up Failed', msg);
  };

  const handleSignup = async () => {
    setErrorMsg('');
    if (!name || !email || !phone || !password) { showError('Please fill all required fields'); return; }
    if (!agreed) { showError('Please agree to Terms & Conditions'); return; }
    if (password.length < 6) { showError('Password must be 6+ characters'); return; }
    setLoading(true);
    try {
      await signupWithApi({ name: name.trim(), email: email.trim(), phone: phone.trim(), password, referralCode: referral.trim() || undefined });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showError(e?.message || 'Could not create account');
    } finally {
      setLoading(false);
    }
  };

  const s = styles(colors);

  return (
    <SafeAreaView style={s.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={s.back} onPress={() => router.back()}>
            <Feather name="arrow-left" size={22} color={colors.foreground} />
          </TouchableOpacity>

          <Text style={s.title}>Create Account</Text>
          <Text style={s.subtitle}>Start your crypto journey today</Text>

          <View style={s.inputGroup}>
            <Text style={s.label}>Full Name *</Text>
            <View style={s.inputRow}>
              <MaterialIcons name="person" size={18} color={colors.mutedForeground} />
              <TextInput style={s.input} value={name} onChangeText={setName} placeholder="Your full name" placeholderTextColor={colors.mutedForeground} />
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.label}>Email *</Text>
            <View style={s.inputRow}>
              <MaterialIcons name="email" size={18} color={colors.mutedForeground} />
              <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="Your email" placeholderTextColor={colors.mutedForeground} keyboardType="email-address" autoCapitalize="none" />
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.label}>Phone *</Text>
            <View style={s.inputRow}>
              <MaterialIcons name="phone" size={18} color={colors.mutedForeground} />
              <TextInput style={s.input} value={phone} onChangeText={setPhone} placeholder="+91 XXXXX XXXXX" placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.label}>Password *</Text>
            <View style={s.inputRow}>
              <MaterialIcons name="lock" size={18} color={colors.mutedForeground} />
              <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="Min 8 characters" placeholderTextColor={colors.mutedForeground} secureTextEntry={!showPass} />
              <TouchableOpacity onPress={() => setShowPass(!showPass)}>
                <Feather name={showPass ? 'eye-off' : 'eye'} size={18} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>
          </View>

          <View style={s.inputGroup}>
            <Text style={s.label}>Referral Code (Optional)</Text>
            <View style={s.inputRow}>
              <MaterialIcons name="card-giftcard" size={18} color={colors.mutedForeground} />
              <TextInput style={s.input} value={referral} onChangeText={setReferral} placeholder="Enter referral code" placeholderTextColor={colors.mutedForeground} autoCapitalize="characters" />
            </View>
          </View>

          <TouchableOpacity style={s.checkRow} onPress={() => setAgreed(!agreed)}>
            <View style={[s.checkbox, agreed && { backgroundColor: colors.primary, borderColor: colors.primary }]}>
              {agreed && <Feather name="check" size={12} color="#000" />}
            </View>
            <Text style={s.checkText}>I agree to <Text style={{ color: colors.primary }}>Terms & Conditions</Text> and <Text style={{ color: colors.primary }}>Privacy Policy</Text></Text>
          </TouchableOpacity>

          {errorMsg ? (
            <View style={{ backgroundColor: '#fee2e2', borderRadius: 8, padding: 10, marginBottom: 12 }}>
              <Text style={{ color: '#b91c1c', fontSize: 13, fontFamily: 'Inter_500Medium' }}>{errorMsg}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={[s.btn, (!agreed || loading) && { opacity: 0.7 }]} onPress={handleSignup} disabled={!agreed || loading}>
            <Text style={s.btnText}>{loading ? 'Creating Account...' : 'Create Account'}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={s.loginLink} onPress={() => router.back()}>
            <Text style={s.loginText}>Already have an account? <Text style={{ color: colors.primary, fontFamily: 'Inter_600SemiBold' }}>Sign In</Text></Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = (colors: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, padding: 20, paddingTop: Platform.OS === 'web' ? 80 : 20, paddingBottom: Platform.OS === 'web' ? 60 : 20 },
  back: { marginBottom: 20 },
  title: { fontSize: 28, fontFamily: 'Inter_700Bold', color: colors.foreground, marginBottom: 4 },
  subtitle: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', marginBottom: 28 },
  inputGroup: { marginBottom: 14 },
  label: { fontSize: 11, fontFamily: 'Inter_500Medium', color: colors.mutedForeground, marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.secondary, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, gap: 10, borderWidth: 1, borderColor: colors.border },
  input: { flex: 1, fontSize: 15, color: colors.foreground, fontFamily: 'Inter_400Regular' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 24 },
  checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  checkText: { flex: 1, fontSize: 13, color: colors.mutedForeground, fontFamily: 'Inter_400Regular', lineHeight: 20 },
  btn: { backgroundColor: colors.primary, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  btnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: colors.primaryForeground },
  loginLink: { marginTop: 24, alignItems: 'center' },
  loginText: { fontSize: 14, color: colors.mutedForeground, fontFamily: 'Inter_400Regular' },
});
