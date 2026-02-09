import { useMemo, useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Image, ActivityIndicator, RefreshControl } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { colors, spacing } from '../theme';
import { useAuth } from '../store/auth';
import { getGspCareStatus } from '../api/backend';

export default function MembershipScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const [gspCareStatus, setGspCareStatus] = useState(null);
  const [gspCareLoading, setGspCareLoading] = useState(false);
  const [gspCareError, setGspCareError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadGspCareStatus = useCallback(async () => {
    const cedula = user?.cedula ? String(user.cedula).replace(/\D/g, '').trim() : '';
    if (!cedula) {
      setGspCareStatus(null);
      return;
    }
    setGspCareError('');
    try {
      const data = await getGspCareStatus({ cedula });
      setGspCareStatus(data);
    } catch (err) {
      setGspCareError(err?.message || 'No se pudo cargar el estado');
      setGspCareStatus(null);
    }
  }, [user?.cedula]);

  useEffect(() => {
    let mounted = true;
    setGspCareLoading(true);
    loadGspCareStatus().finally(() => {
      if (mounted) setGspCareLoading(false);
    });
    return () => { mounted = false; };
  }, [loadGspCareStatus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadGspCareStatus();
    setRefreshing(false);
  }, [loadGspCareStatus]);
  const formatName = (value) =>
    value ? value.replace(/[_\.]+/g, ' ').replace(/\s+/g, ' ').trim() : '';
  const toTitleCase = (value) =>
    value
      ? value
          .toLowerCase()
          .split(' ')
          .filter(Boolean)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      : '';
  const pickFirstLast = (value) => {
    const tokens = formatName(value).split(' ').filter(Boolean);
    if (tokens.length === 0) return '';
    if (tokens.length === 1) return tokens[0];
    return `${tokens[0]} ${tokens[tokens.length - 1]}`;
  };
  const memberName = (() => {
    const firstName = user?.firstName?.trim() || '';
    const lastName = user?.lastName?.trim() || '';
    if (firstName || lastName) {
      return toTitleCase(`${firstName} ${lastName}`.trim());
    }
    const fullName = pickFirstLast(user?.fullName);
    if (fullName) return toTitleCase(fullName);
    const fallbackName = pickFirstLast(user?.name);
    if (fallbackName) return toTitleCase(fallbackName);
    return 'Cliente GSP';
  })();
  const memberships = useMemo(
    () => [
      {
        id: 'basic',
        label: 'Basic',
        duration: '3 Meses',
        value: '$299.900',
        price: 299900,
        description: 'Membresía 3 meses.',
        background: '#2C2F36',
        border: '#3D434D',
        highlight: '3 Meses',
      },
      {
        id: 'professional',
        label: 'Professional',
        duration: '6 Meses',
        value: '$449.900',
        price: 449900,
        description: 'Membresía 6 meses.',
        background: '#0B2B4E',
        border: '#144A7A',
        highlight: '6 Meses',
      },
      {
        id: 'premium',
        label: 'Premium',
        duration: '1 Año',
        value: '$699.900',
        price: 699900,
        description: 'Membresía 1 año.',
        background: '#0B0B0B',
        border: '#1F1F1F',
        highlight: '1 Año',
      },
    ],
    []
  );
  const tableRows = useMemo(
    () => [
      { description: 'Reset contraseña equipo hikvision/hiklook', basic: null, professional: null, premium: null },
      { description: 'Servicio flasheo Hikvision', basic: null, professional: null, premium: null },
      { description: 'Desvinculacion cuenta HIK-CONNECT', basic: null, professional: null, premium: null },
      { description: 'Actualizacion firmware equipo Hikvision /Hilook', basic: null, professional: null, premium: null },
      { description: 'Diagnostico (no incluye PTZ) – incluye grabador – camaras fuera de garantia', basic: 10, professional: 16, premium: 32 },
      { description: 'Reset contraseña servidores software zkteco Biotime -Zkbiocvsecurity -Zkbiocvacces', basic: null, professional: null, premium: null },
      { description: 'Diagnostico Remoto Equipo fuera de Garantia (Servidores Zkbiocvacces Zkbiocvsecurity Biotime)', basic: 2, professional: 2, premium: 3 },
      { description: 'Parametrizacion Lector Honeywell lectura codigo de barras software Zkbiocvsecurity en modulo visitantes', basic: null, professional: null, premium: null },
      { description: 'Desvinculacion de equipo DSC plataforma Comunicadores', basic: null, professional: null, premium: null },
      { description: 'Diagnostico remoto Servidor powermanage para instalacion powermanage', basic: null, professional: null, premium: null },
      { description: 'Diagnostico equipos marca DSC fuera de garantia', basic: null, professional: null, premium: null },
      { description: 'Diagnostico equipos marca UHF fuera de garantia', basic: null, professional: null, premium: null },
      { description: 'Diagnostico equipo marca CAME en sede fuera de garantia', basic: 1, professional: 2, premium: 3 },
    ],
    []
  );
  const savingsByMembership = useMemo(
    () => [
      { id: 'basic', label: 'Basic (3 Meses)', amount: 328900 },
      { id: 'professional', label: 'Professional (6 Meses)', amount: 491900 },
      { id: 'premium', label: 'Premium (1 Año)', amount: 1055000 },
    ],
    []
  );

  const formatCop = (value) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));

  const formatExpiresAt = (dateStr) => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (Number.isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (_) {
      return dateStr;
    }
  };

  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];

  const hasCedula = Boolean(user?.cedula);
  const showMyServices = gspCareStatus?.active && Array.isArray(gspCareStatus?.services) && gspCareStatus.services.length > 0;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing.xxl + tabBarHeight },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.headerCard}>
          <Image
            source={{
              uri: 'https://gsp.com.co/wp-content/uploads/2026/01/GSP-Care-Rect@3x-scaled.png',
            }}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Membresía GSP Care</Text>
        </View>

        <View style={styles.memberCard}>
          <View style={styles.memberCardHighlight} />
          <View style={styles.memberCardHeader}>
            <Text style={styles.memberCardTitle}>Titular</Text>
          </View>
          <View style={styles.memberRow}>
            <View style={styles.memberInfo}>
              <Text style={styles.memberName}>{memberName}</Text>
              {gspCareLoading ? (
                <View style={styles.loadingRow}>
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text style={styles.memberMeta}>Cargando membresía...</Text>
                </View>
              ) : gspCareError ? (
                <Text style={styles.memberMetaError}>{gspCareError}</Text>
              ) : gspCareStatus?.active ? (
                <>
                  <Text style={styles.memberMeta}>Membresía {gspCareStatus.plan}</Text>
                  <Text style={styles.memberMeta}>Vence {formatExpiresAt(gspCareStatus.expiresAt)}</Text>
                  <View style={styles.badgeVigente}>
                    <Text style={styles.badgeVigenteText}>Vigente</Text>
                  </View>
                </>
              ) : gspCareStatus && !gspCareStatus.active ? (
                <>
                  {gspCareStatus.isExpired ? (
                    <>
                      <Text style={styles.memberMeta}>Venció {formatExpiresAt(gspCareStatus.expiresAt)}</Text>
                      <View style={styles.badgeVencida}>
                        <Text style={styles.badgeVencidaText}>Vencida</Text>
                      </View>
                    </>
                  ) : (
                    <Text style={styles.memberMeta}>Sin membresía activa</Text>
                  )}
                </>
              ) : !hasCedula ? (
                <Text style={styles.memberMeta}>Tu membresía aparecerá aquí</Text>
              ) : null}
            </View>
            <View style={styles.memberLogoWrap}>
              <Image
                source={{
                  uri: 'https://gsp.com.co/wp-content/uploads/2026/01/GSP-Care-Rect@3x-scaled.png',
                }}
                style={styles.memberLogo}
                resizeMode="contain"
              />
            </View>
          </View>
        </View>

        {showMyServices ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Tus servicios disponibles</Text>
            <Text style={styles.subtitle}>Según tu plan {gspCareStatus.plan}. Actualiza deslizando hacia abajo.</Text>
            {gspCareStatus.services.map((svc) => (
              <View key={svc.id} style={styles.serviceRow}>
                <Text style={styles.serviceName} numberOfLines={2}>{svc.name}</Text>
                <Text style={styles.serviceRemaining}>
                  {svc.remaining === 'Ilimitado' ? 'Ilimitado' : `${svc.remaining} disp.`}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Tipos de membresía</Text>
          <Text style={styles.subtitle}>Basic (3 Meses), Professional (6 Meses), Premium (1 Año). IVA incluido.</Text>
          <View style={styles.planGrid}>
            {memberships.map((plan) => (
              <View
                key={plan.id}
                style={[
                  styles.planCard,
                  { backgroundColor: plan.background, borderColor: plan.border },
                ]}
              >
                <View style={styles.planHeader}>
                  <Text style={styles.planTitle}>{plan.label}</Text>
                  <Text style={styles.planBadge}>{plan.highlight}</Text>
                </View>
                <Text style={styles.planPrice}>{plan.value}</Text>
                <Text style={styles.planDescription}>{plan.description}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Qué incluye cada membresía</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.tableWrap}>
              <View style={styles.tableHeaderRow}>
                <Text style={[styles.tableCellDesc, styles.tableHeaderText]}>DESCRIPCION</Text>
                <Text style={[styles.tableCellBasic, styles.tableHeaderText]}>BASIC</Text>
                <Text style={[styles.tableCellPro, styles.tableHeaderText]}>PROFESSIONAL</Text>
                <Text style={[styles.tableCellPremium, styles.tableHeaderText]}>PREMIUM</Text>
              </View>
              {tableRows.map((row, index) => (
                <View key={`row-${index}`} style={styles.tableRow}>
                  <Text style={styles.tableCellDesc} numberOfLines={3}>{row.description}</Text>
                  <Text style={styles.tableCellBasic}>{row.basic != null ? String(row.basic) : 'Incl.'}</Text>
                  <Text style={styles.tableCellPro}>{row.professional != null ? String(row.professional) : 'Incl.'}</Text>
                  <Text style={styles.tableCellPremium}>{row.premium != null ? String(row.premium) : 'Incl.'}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Lo que ahorrarías</Text>
          <Text style={styles.subtitle}>Pagando cada servicio incluido a valor unitario.</Text>
          {savingsByMembership.map((item) => (
            <View key={item.id} style={styles.savingsRow}>
              <Text style={styles.savingsLabel}>{item.label}</Text>
              <Text style={styles.savingsAmount}>{formatCop(item.amount)}</Text>
            </View>
          ))}
        </View>

        <Pressable
          style={pressableStyle(styles.primaryButton)}
          onPress={() =>
            navigation.navigate('Checkout', {
              url: 'https://gsp.com.co/product/membresia-gsp-care/',
              forceLogin: true,
            })
          }
        >
          <Text style={styles.primaryButtonText}>Quiero GSP Care</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  headerCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.xs,
    alignItems: 'center',
  },
  headerLogo: {
    width: 160,
    height: 48,
  },
  memberCard: {
    backgroundColor: '#0B0B0B',
    borderRadius: 20,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: '#1F1F1F',
    position: 'relative',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  memberCardHighlight: {
    position: 'absolute',
    top: -30,
    left: -40,
    right: -40,
    height: 70,
    backgroundColor: 'rgba(255,255,255,0.06)',
    transform: [{ rotate: '-3deg' }],
  },
  memberCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.md,
  },
  memberCardTitle: {
    color: '#E5E7EB',
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 2,
  },
  memberCardCare: {
    color: '#EF4444',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 2,
  },
  memberRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  memberLabel: {
    color: '#BFC4CC',
    fontSize: 12,
  },
  memberName: {
    color: '#E5E7EB',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 4,
    textAlign: 'center',
  },
  memberMeta: {
    color: '#A7ADB5',
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  memberInfo: {
    flex: 1,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
  },
  memberMetaError: {
    color: colors.warning,
    fontSize: 12,
    marginTop: 4,
    textAlign: 'center',
  },
  badgeVigente: {
    alignSelf: 'center',
    marginTop: 6,
    backgroundColor: '#16a34a',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeVigenteText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  badgeVencida: {
    alignSelf: 'center',
    marginTop: 6,
    backgroundColor: '#6b7280',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  badgeVencidaText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
  serviceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  serviceName: {
    color: colors.textSoft,
    fontSize: 13,
    flex: 1,
    marginRight: spacing.sm,
  },
  serviceRemaining: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '700',
  },
  memberLogoWrap: {
    alignItems: 'center',
    gap: 4,
  },
  memberLogo: {
    width: 150,
    height: 40,
  },
  title: {
    color: colors.textMain,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  planGrid: {
    gap: spacing.md,
  },
  planCard: {
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  planHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  planTitle: {
    color: '#F8FAFC',
    fontSize: 16,
    fontWeight: '700',
  },
  planBadge: {
    color: '#F8FAFC',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  planPrice: {
    color: '#F8FAFC',
    fontSize: 18,
    fontWeight: '700',
  },
  planDescription: {
    color: '#E2E8F0',
    fontSize: 12,
  },
  planServices: {
    gap: 6,
  },
  planServiceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  planServiceLabel: {
    color: '#E2E8F0',
    fontSize: 12,
    flex: 1,
  },
  planServiceQty: {
    color: '#F8FAFC',
    fontSize: 12,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.textMain,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  label: {
    color: colors.textSoft,
    fontSize: 14,
  },
  value: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 14,
  },
  tableWrap: {
    minWidth: 520,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    fontWeight: '700',
    fontSize: 11,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  tableCellDesc: {
    color: colors.textSoft,
    fontSize: 11,
    flex: 1.8,
    marginRight: 8,
  },
  tableCellBasic: {
    color: colors.textMain,
    fontSize: 12,
    width: 52,
    textAlign: 'center',
  },
  tableCellPro: {
    color: colors.textMain,
    fontSize: 12,
    width: 72,
    textAlign: 'center',
  },
  tableCellPremium: {
    color: colors.textMain,
    fontSize: 12,
    width: 58,
    textAlign: 'center',
  },
  savingsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  savingsLabel: {
    color: colors.textSoft,
    fontSize: 13,
    flex: 1,
  },
  savingsAmount: {
    color: colors.textMain,
    fontSize: 15,
    fontWeight: '700',
  },
  primaryButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
