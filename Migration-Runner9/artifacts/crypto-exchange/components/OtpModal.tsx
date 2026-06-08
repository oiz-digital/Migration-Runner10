import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useColors } from '@/hooks/useColors';
import { Feather } from '@expo/vector-icons';
import { api, type ApiOtpSendRes } from '@/lib/api';

type Props = {
  visible: boolean;
  channel: 'sms' | 'email';
  purpose: 'signup' | 'login' | 'withdraw' | 'kyc' | '2fa' | 'reset';
  recipient: string;
  onClose: () => void;
  onVerified: (otpId: number) => void;
};

export function OtpModal({ visible, channel, purpose, recipient, onClose, onVerified }: Props) {
  const colors = useColors();
  const [code, setCode] = useState('');
  const [otpId, setOtpId] = useState<number | null>(null);
  const [devCode, setDevCode] = useState<string | undefined>();
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [secsLeft, setSecsLeft] = useState(0);
  const [resendIn, setResendIn] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (visible && !otpId) void send();
    if (!visible) { setCode(''); setOtpId(null); setDevCode(undefined); setErrorMsg(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  useEffect(() => {
    if (secsLeft <= 0) return;
    const t = setInterval(() => setSecsLeft(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [secsLeft]);
  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setInterval(() => setResendIn(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(t);
  }, [resendIn]);

  const send = async () => {
    setSending(true); setErrorMsg(null);
    try {
      const res = await api.post<ApiOtpSendRes>('/otp/send', { channel, purpose, recipient });
      setOtpId(res.otpId);
      setDevCode(res.devCode);
      setSecsLeft(res.expiresInSec || 600);
      setResendIn(30);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Failed to send code');
    } finally { setSending(false); }
  };

  const verify = async () => {
    if (!otpId || code.length !== 6) return;
    setVerifying(true); setErrorMsg(null);
    try {
      await api.post('/otp/verify', { otpId, code });
      onVerified(otpId);
    } catch (e: any) {
      setErrorMsg(e?.message || 'Invalid code');
    } finally { setVerifying(false); }
  };

  const s = styles(colors);
  const masked = recipient.length > 6 ? recipient.slice(0, 2) + '****' + recipient.slice(-2) : recipient;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={s.backdrop}>
        <View style={s.card}>
          <View style={s.head}>
            <Text style={s.title}>Verify {channel === 'sms' ? 'phone' : 'email'}</Text>
            <TouchableOpacity onPress={onClose}><Feather name="x" size={20} color={colors.foreground} /></TouchableOpacity>
          </View>
          <Text style={s.sub}>Enter the 6-digit code sent to {masked}</Text>
          {devCode && (
            <View style={s.devBanner}>
              <Feather name="info" size={12} color={colors.warning} />
              <Text style={[s.devText, { color: colors.warning }]}>Dev mode — code: {devCode}</Text>
            </View>
          )}
          <TextInput
            style={s.input}
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, '').slice(0, 6))}
            placeholder="• • • • • •"
            placeholderTextColor={colors.mutedForeground}
            keyboardType="number-pad"
            maxLength={6}
            autoFocus
          />
          {errorMsg && <Text style={s.err}>{errorMsg}</Text>}
          <View style={s.row}>
            <Text style={s.timer}>{secsLeft > 0 ? `Expires in ${Math.floor(secsLeft / 60)}:${String(secsLeft % 60).padStart(2, '0')}` : 'Expired'}</Text>
            <TouchableOpacity disabled={resendIn > 0 || sending} onPress={send}>
              <Text style={[s.resend, (resendIn > 0 || sending) && { opacity: 0.4 }]}>{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend'}</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[s.btn, { backgroundColor: code.length === 6 ? colors.primary : colors.secondary }]}
            disabled={code.length !== 6 || verifying}
            onPress={verify}
          >
            {verifying ? <ActivityIndicator color="#000" /> : <Text style={[s.btnText, { color: code.length === 6 ? '#000' : colors.mutedForeground }]}>Verify</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 380, backgroundColor: c.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: c.border },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 16, fontFamily: 'Inter_700Bold', color: c.foreground },
  sub: { fontSize: 12, color: c.mutedForeground, marginBottom: 14 },
  devBanner: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: c.warning + '15', borderRadius: 8, padding: 8, marginBottom: 12 },
  devText: { fontSize: 11, fontFamily: 'Inter_600SemiBold' },
  input: { backgroundColor: c.secondary, borderRadius: 10, paddingVertical: 14, paddingHorizontal: 16, fontSize: 22, color: c.foreground, fontFamily: 'Inter_700Bold', textAlign: 'center', letterSpacing: 8 },
  err: { color: c.destructive, fontSize: 12, marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, marginBottom: 16 },
  timer: { fontSize: 11, color: c.mutedForeground },
  resend: { fontSize: 12, color: c.primary, fontFamily: 'Inter_600SemiBold' },
  btn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
  btnText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
