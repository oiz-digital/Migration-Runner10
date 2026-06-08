import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, Modal, TextInput, ActivityIndicator, Alert } from 'react-native';
import { Header } from '@/components/Header';
import { useColors } from '@/hooks/useColors';
import { useApp } from '@/context/AppContext';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { api, type ApiKycRecord } from '@/lib/api';

type Settings = { level: number; depositLimit: string; withdrawLimit: string; tradeLimit: string; features: string };

export default function Kyc() {
  const colors = useColors();
  const { user } = useApp();
  const [settings, setSettings] = useState<Settings[]>([]);
  const [records, setRecords] = useState<ApiKycRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [formLevel, setFormLevel] = useState<1 | 2 | 3 | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // form fields
  const [fullName, setFullName] = useState(user.name || '');
  const [dob, setDob] = useState('');
  const [pan, setPan] = useState('');
  const [aadhaar, setAadhaar] = useState('');
  const [address, setAddress] = useState('');
  const [panDocUrl, setPanDocUrl] = useState('');
  const [aadhaarDocUrl, setAadhaarDocUrl] = useState('');
  const [selfieUrl, setSelfieUrl] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [s, r] = await Promise.all([api.get<Settings[]>('/kyc/settings'), api.get<ApiKycRecord[]>('/kyc/my')]);
      setSettings(s); setRecords(r);
    } catch (e: any) { Alert.alert('Error', e?.message || 'Failed to load'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);

  const currentKycLevel = user.kycLevel || 0;
  const pendingForLevel = (lvl: number) => records.find(r => r.level === lvl && r.status === 'pending');

  const submit = async () => {
    if (!formLevel) return;
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = { level: formLevel, fullName, dob, panNumber: pan.toUpperCase() };
      if (formLevel >= 2) {
        payload.aadhaarNumber = aadhaar.replace(/\s+/g, '');
        // For demo: use placeholder URLs (real impl would upload to object storage first)
        payload.panDocUrl = panDocUrl || `https://placeholder.local/pan_${Date.now()}.jpg`;
        payload.aadhaarDocUrl = aadhaarDocUrl || `https://placeholder.local/aadhaar_${Date.now()}.jpg`;
      }
      if (formLevel >= 3) {
        payload.selfieUrl = selfieUrl || `https://placeholder.local/selfie_${Date.now()}.jpg`;
        payload.address = address;
      }
      await api.post('/kyc/submit', payload);
      Alert.alert('Submitted', 'Your KYC documents are under review (24-48 hours)');
      setFormLevel(null);
      await load();
    } catch (e: any) {
      Alert.alert('Submission failed', e?.message || 'Please try again');
    } finally { setSubmitting(false); }
  };

  const featuresFor = (lvl: number): string[] => {
    const row = settings.find(s => s.level === lvl);
    if (!row) return [];
    try { return JSON.parse(row.features); } catch { return []; }
  };

  const s = styles(colors);
  const inrFmt = (v: string | number) => '₹' + Number(v).toLocaleString('en-IN');

  return (
    <SafeAreaView style={s.container}>
      <Header title="KYC Verification" subtitle="Complete identity verification" />
      <ScrollView contentContainerStyle={s.content}>
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} /> : (
          <>
            <View style={s.statusCard}>
              <View style={[s.statusIcon, { backgroundColor: currentKycLevel >= 1 ? colors.success + '22' : colors.warning + '22' }]}>
                <Feather name={currentKycLevel >= 1 ? 'check-circle' : 'clock'} size={28} color={currentKycLevel >= 1 ? colors.success : colors.warning} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.statusTitle}>Level {currentKycLevel}</Text>
                <Text style={[s.statusBadge, { color: currentKycLevel >= 1 ? colors.success : colors.warning }]}>
                  {currentKycLevel >= 1 ? '✓ Verified' : 'Unverified'}
                </Text>
              </View>
            </View>

            <Text style={s.sectionTitle}>Verification Levels</Text>
            {settings.filter(l => l.level > 0).map(level => {
              const isCompleted = level.level <= currentKycLevel;
              const canUpgrade = level.level === currentKycLevel + 1;
              const pending = pendingForLevel(level.level);
              const isCurrent = level.level === currentKycLevel;
              return (
                <View key={level.level} style={[s.levelCard, isCurrent && { borderColor: colors.primary, backgroundColor: colors.primary + '08' }]}>
                  <View style={s.levelHeader}>
                    <View style={[s.levelBadge, { backgroundColor: isCompleted ? colors.success : colors.secondary }]}>
                      {isCompleted ? <Feather name="check" size={14} color="#fff" /> : <Text style={[s.levelBadgeText, { color: colors.foreground }]}>{level.level}</Text>}
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={s.levelTitle}>Level {level.level}</Text>
                      <Text style={s.levelSub}>{level.level === 1 ? 'PAN basic' : level.level === 2 ? 'PAN + Aadhaar' : 'Full KYC'}</Text>
                    </View>
                    {isCurrent && <View style={s.activePill}><Text style={s.activeText}>ACTIVE</Text></View>}
                  </View>

                  <View style={s.limitsBox}>
                    <View style={s.limitItem}><Text style={s.limitLbl}>Withdraw</Text><Text style={s.limitVal}>{inrFmt(level.withdrawLimit)}</Text></View>
                    <View style={s.limitItem}><Text style={s.limitLbl}>Deposit</Text><Text style={s.limitVal}>{inrFmt(level.depositLimit)}</Text></View>
                    <View style={s.limitItem}><Text style={s.limitLbl}>Trade</Text><Text style={s.limitVal}>{inrFmt(level.tradeLimit)}</Text></View>
                  </View>

                  <Text style={s.featTitle}>Features</Text>
                  {featuresFor(level.level).map((f, i) => (
                    <View key={i} style={s.featRow}>
                      <Feather name="check-circle" size={12} color={colors.success} />
                      <Text style={s.featText}>{f.replace(/_/g, ' ')}</Text>
                    </View>
                  ))}

                  {pending ? (
                    <View style={[s.completedBtn, { backgroundColor: colors.warning + '20' }]}>
                      <Feather name="clock" size={14} color={colors.warning} />
                      <Text style={[s.completedText, { color: colors.warning }]}>Under review</Text>
                    </View>
                  ) : canUpgrade ? (
                    <TouchableOpacity style={[s.upgradeBtn, { backgroundColor: colors.primary }]} onPress={() => { setFormLevel(level.level as 1 | 2 | 3); }}>
                      <Text style={[s.upgradeText, { color: '#000' }]}>Submit Level {level.level}</Text>
                    </TouchableOpacity>
                  ) : isCompleted ? (
                    <View style={[s.completedBtn, { backgroundColor: colors.success + '20' }]}>
                      <Feather name="check" size={14} color={colors.success} />
                      <Text style={[s.completedText, { color: colors.success }]}>Completed</Text>
                    </View>
                  ) : null}
                </View>
              );
            })}

            {records.filter(r => r.status === 'rejected').length > 0 && (
              <>
                <Text style={[s.sectionTitle, { marginTop: 18 }]}>Recent rejections</Text>
                {records.filter(r => r.status === 'rejected').slice(0, 3).map(r => (
                  <View key={r.id} style={s.rejCard}>
                    <Text style={s.rejTitle}>Level {r.level} rejected</Text>
                    <Text style={s.rejReason}>{r.rejectReason || 'No reason provided'}</Text>
                  </View>
                ))}
              </>
            )}
          </>
        )}
      </ScrollView>

      {/* Submission modal */}
      <Modal visible={formLevel !== null} animationType="slide" transparent onRequestClose={() => setFormLevel(null)}>
        <View style={s.backdrop}>
          <View style={s.modalCard}>
            <View style={s.modalHead}>
              <Text style={s.modalTitle}>Submit KYC Level {formLevel}</Text>
              <TouchableOpacity onPress={() => setFormLevel(null)}><Feather name="x" size={20} color={colors.foreground} /></TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 480 }}>
              <Text style={s.lbl}>Full name (as per PAN)</Text>
              <TextInput style={s.input} value={fullName} onChangeText={setFullName} placeholder="Rahul Sharma" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.lbl}>Date of birth (YYYY-MM-DD)</Text>
              <TextInput style={s.input} value={dob} onChangeText={setDob} placeholder="1995-08-21" placeholderTextColor={colors.mutedForeground} />
              <Text style={s.lbl}>PAN number</Text>
              <TextInput style={s.input} value={pan} onChangeText={t => setPan(t.toUpperCase())} placeholder="AAAAA1111A" placeholderTextColor={colors.mutedForeground} maxLength={10} autoCapitalize="characters" />
              {formLevel && formLevel >= 2 && (
                <>
                  <Text style={s.lbl}>Aadhaar number (12 digits)</Text>
                  <TextInput style={s.input} value={aadhaar} onChangeText={t => setAadhaar(t.replace(/\D/g, '').slice(0, 12))} placeholder="123412341234" placeholderTextColor={colors.mutedForeground} keyboardType="number-pad" />
                  <Text style={s.lbl}>PAN document URL (optional in dev)</Text>
                  <TextInput style={s.input} value={panDocUrl} onChangeText={setPanDocUrl} placeholder="https://..." placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
                  <Text style={s.lbl}>Aadhaar document URL (optional in dev)</Text>
                  <TextInput style={s.input} value={aadhaarDocUrl} onChangeText={setAadhaarDocUrl} placeholder="https://..." placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
                </>
              )}
              {formLevel === 3 && (
                <>
                  <Text style={s.lbl}>Address</Text>
                  <TextInput style={[s.input, { height: 70 }]} value={address} onChangeText={setAddress} multiline placeholder="Full address" placeholderTextColor={colors.mutedForeground} />
                  <Text style={s.lbl}>Selfie URL (optional in dev)</Text>
                  <TextInput style={s.input} value={selfieUrl} onChangeText={setSelfieUrl} placeholder="https://..." placeholderTextColor={colors.mutedForeground} autoCapitalize="none" />
                </>
              )}
            </ScrollView>
            <TouchableOpacity style={[s.submitBtn, { backgroundColor: colors.primary }]} disabled={submitting} onPress={submit}>
              {submitting ? <ActivityIndicator color="#000" /> : <Text style={[s.submitText, { color: '#000' }]}>Submit for review</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = (c: ReturnType<typeof useColors>) => StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  content: { padding: 16, paddingBottom: 60 },
  statusCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: c.card, borderRadius: 14, padding: 16, marginBottom: 18, borderWidth: 1, borderColor: c.border },
  statusIcon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginRight: 14 },
  statusTitle: { fontSize: 14, color: c.foreground, fontFamily: 'Inter_700Bold' },
  statusBadge: { fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 4 },
  sectionTitle: { fontSize: 13, color: c.foreground, fontFamily: 'Inter_700Bold', marginBottom: 10, textTransform: 'uppercase' },
  levelCard: { backgroundColor: c.card, borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: c.border },
  levelHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  levelBadge: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  levelBadgeText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  levelTitle: { fontSize: 15, color: c.foreground, fontFamily: 'Inter_700Bold' },
  levelSub: { fontSize: 11, color: c.mutedForeground, marginTop: 2 },
  activePill: { backgroundColor: c.primary, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 4 },
  activeText: { fontSize: 9, color: '#000', fontFamily: 'Inter_700Bold' },
  limitsBox: { flexDirection: 'row', backgroundColor: c.secondary, borderRadius: 10, padding: 12, marginBottom: 14 },
  limitItem: { flex: 1, alignItems: 'center' },
  limitLbl: { fontSize: 10, color: c.mutedForeground, fontFamily: 'Inter_500Medium', textTransform: 'uppercase' },
  limitVal: { fontSize: 12, color: c.foreground, fontFamily: 'Inter_700Bold', marginTop: 4 },
  featTitle: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', marginBottom: 8 },
  featRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 },
  featText: { fontSize: 12, color: c.foreground, fontFamily: 'Inter_400Regular' },
  upgradeBtn: { borderRadius: 8, paddingVertical: 11, alignItems: 'center', marginTop: 14 },
  upgradeText: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  completedBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 8, paddingVertical: 9, marginTop: 14 },
  completedText: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  rejCard: { backgroundColor: c.destructive + '10', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: c.destructive + '30' },
  rejTitle: { fontSize: 12, color: c.destructive, fontFamily: 'Inter_700Bold' },
  rejReason: { fontSize: 12, color: c.foreground, marginTop: 4 },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: c.card, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 18, paddingBottom: 30 },
  modalHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontFamily: 'Inter_700Bold', color: c.foreground },
  lbl: { fontSize: 11, color: c.mutedForeground, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', marginTop: 10, marginBottom: 6 },
  input: { backgroundColor: c.secondary, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, color: c.foreground, fontSize: 14, fontFamily: 'Inter_500Medium' },
  submitBtn: { borderRadius: 10, paddingVertical: 13, alignItems: 'center', marginTop: 16 },
  submitText: { fontSize: 14, fontFamily: 'Inter_700Bold' },
});
