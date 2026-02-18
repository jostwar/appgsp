import { useMemo, useEffect, useState, useCallback } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Image, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { colors, spacing } from '../theme';
import { useAuth } from '../store/auth';
import { getGspCareCatalog, getGspCareStatus, getGspCareRequests, getRewardsPoints, createGspCareRequest } from '../api/backend';

const GSP_CARE_CATALOG_FALLBACK = {
  categories: [
    { id: 'A', name: 'Hikvision/HiLook + Diagnóstico CCTV no PTZ', Basic: 10, Professional: 16, Premium: 32 },
    { id: 'B', name: 'ZKTeco/Honeywell', Basic: 2, Professional: 2, Premium: 3 },
    { id: 'C', name: 'Otros diagnósticos/plataformas', Basic: 1, Professional: 2, Premium: 3 },
  ],
  services: [
    { id: 'reset_hikvision', name: 'Reset contraseña equipo hikvision/hiklook', categoryId: 'A', marca: 'Hikvision/HiLook', modalidad: 'Remoto' },
    { id: 'flasheo_hikvision', name: 'Servicio flasheo Hikvision', categoryId: 'A', marca: 'Hikvision', modalidad: 'Remoto' },
    { id: 'desvinculacion_hikconnect', name: 'Desvinculacion cuenta HIK-CONNECT', categoryId: 'A', marca: 'Hikvision', modalidad: 'Remoto' },
    { id: 'firmware_hikvision', name: 'Actualizacion firmware equipo Hikvision/Hilook', categoryId: 'A', marca: 'Hikvision/HiLook', modalidad: 'Remoto' },
    { id: 'diagnostico_no_ptz', name: 'Diagnostico (no incluye PTZ) – grabador – camaras fuera de garantia', categoryId: 'A', marca: 'Hikvision/HiLook', modalidad: 'Remoto' },
    { id: 'reset_zkteco', name: 'Reset contraseña servidores Zkteco Biotime/Zkbiocvsecurity/Zkbiocvacces', categoryId: 'B', marca: 'ZKTeco', modalidad: 'Remoto' },
    { id: 'diagnostico_remoto_zkteco', name: 'Diagnostico Remoto Equipo fuera de Garantia (Zkbiocvacces Zkbiocvsecurity Biotime)', categoryId: 'B', marca: 'ZKTeco', modalidad: 'Remoto' },
    { id: 'parametrizacion_honeywell', name: 'Parametrizacion Lector Honeywell codigo de barras Zkbiocvsecurity modulo visitantes', categoryId: 'B', marca: 'Honeywell/ZKTeco', modalidad: 'Remoto' },
    { id: 'desvinculacion_dsc', name: 'Desvinculacion de equipo DSC plataforma Comunicadores', categoryId: 'C', marca: 'DSC', modalidad: 'Remoto' },
    { id: 'diagnostico_powermanage', name: 'Diagnostico remoto Servidor powermanage para instalacion powermanage', categoryId: 'C', marca: 'Otros', modalidad: 'Remoto' },
    { id: 'diagnostico_dsc', name: 'Diagnostico equipos marca DSC fuera de garantia', categoryId: 'C', marca: 'DSC', modalidad: 'Remoto' },
    { id: 'diagnostico_uhf', name: 'Diagnostico equipos marca UHF fuera de garantia', categoryId: 'C', marca: 'UHF', modalidad: 'Remoto' },
    { id: 'diagnostico_came', name: 'Diagnostico equipo marca CAME en sede fuera de garantia', categoryId: 'C', marca: 'CAME', modalidad: 'En sede' },
  ],
};

export default function MembershipScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const [gspCareStatus, setGspCareStatus] = useState(null);
  const [gspCareLoading, setGspCareLoading] = useState(false);
  const [gspCareError, setGspCareError] = useState('');
  const [requests, setRequests] = useState([]);
  const [requestLoadingId, setRequestLoadingId] = useState(null);
  const [catalog, setCatalog] = useState(GSP_CARE_CATALOG_FALLBACK);
  const [refreshing, setRefreshing] = useState(false);
  const [clientName, setClientName] = useState('');

  const cedula = user?.cedula ? String(user.cedula).replace(/\D/g, '').trim() : '';

  const loadGspCareStatus = useCallback(async () => {
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
  }, [cedula]);

  const loadRequests = useCallback(async () => {
    if (!cedula) {
      setRequests([]);
      return;
    }
    try {
      const data = await getGspCareRequests({ cedula });
      setRequests(Array.isArray(data?.requests) ? data.requests : []);
    } catch (_err) {
      setRequests([]);
    }
  }, [cedula]);

  const loadCatalog = useCallback(async () => {
    try {
      const data = await getGspCareCatalog();
      const categories = Array.isArray(data?.categories) ? data.categories : [];
      const services = Array.isArray(data?.services) ? data.services : [];
      setCatalog(
        categories.length && services.length
          ? { categories, services }
          : GSP_CARE_CATALOG_FALLBACK
      );
    } catch (_err) {
      setCatalog(GSP_CARE_CATALOG_FALLBACK);
    }
  }, []);

  const loadClientName = useCallback(async () => {
    if (!cedula) {
      setClientName('');
      return;
    }
    try {
      const data = await getRewardsPoints({ cedula });
      setClientName(String(data?.companyName || '').trim());
    } catch (_err) {
      setClientName('');
    }
  }, [cedula]);

  useEffect(() => {
    let mounted = true;
    setGspCareLoading(true);
    Promise.all([loadCatalog(), loadGspCareStatus(), loadRequests(), loadClientName()]).finally(() => {
      if (mounted) setGspCareLoading(false);
    });
    return () => { mounted = false; };
  }, [loadCatalog, loadGspCareStatus, loadRequests, loadClientName]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadCatalog(), loadGspCareStatus(), loadRequests(), loadClientName()]);
    setRefreshing(false);
  }, [loadCatalog, loadGspCareStatus, loadRequests, loadClientName]);

  const servicesByCategory = useMemo(() => {
    if (!catalog?.services?.length) return {};
    const byCat = {};
    catalog.services.forEach((s) => {
      const cid = s.categoryId || 'C';
      if (!byCat[cid]) byCat[cid] = [];
      byCat[cid].push(s);
    });
    return byCat;
  }, [catalog]);

  const canRequestService = (svc) => {
    if (!svc) return false;
    const rem = svc.remaining;
    return rem === 'Ilimitado' || (typeof rem === 'number' && rem > 0);
  };

  const handleRequestService = useCallback(
    async (serviceId) => {
      if (!cedula || !serviceId) return;
      setRequestLoadingId(serviceId);
      try {
        await createGspCareRequest({ cedula, serviceId });
        await Promise.all([loadGspCareStatus(), loadRequests()]);
      } catch (err) {
        Alert.alert('Error', err?.message || 'No se pudo enviar la solicitud');
      } finally {
        setRequestLoadingId(null);
      }
    },
    [cedula, loadGspCareStatus, loadRequests]
  );
  const toTitleCase = (value) =>
    value
      ? value
          .toLowerCase()
          .split(' ')
          .filter(Boolean)
          .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ')
      : '';
  const memberName = clientName ? toTitleCase(clientName) : 'Cliente GSP';
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
            <Text style={styles.subtitle}>Según tu plan {gspCareStatus.plan}. Solicita el servicio y un asesor lo procesará.</Text>
            {gspCareStatus.services.map((svc) => {
              const canRequest = canRequestService(svc);
              const isLoading = requestLoadingId === svc.id;
              return (
                <View key={svc.id} style={styles.serviceRow}>
                  <View style={styles.serviceInfo}>
                    <Text style={styles.serviceName} numberOfLines={2}>{svc.name}</Text>
                    <Text style={styles.serviceRemaining}>
                      {svc.remaining === 'Ilimitado' ? 'Ilimitado' : `${svc.remaining} disp.`}
                    </Text>
                  </View>
                  {canRequest ? (
                    <Pressable
                      style={({ pressed }) => [styles.solicitarBtn, pressed && styles.pressed]}
                      onPress={() => handleRequestService(svc.id)}
                      disabled={isLoading}
                    >
                      {isLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.solicitarBtnText}>Solicitar</Text>
                      )}
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        {showMyServices && requests.length > 0 ? (
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>Mis solicitudes</Text>
            <Text style={styles.subtitle}>Estado de tus solicitudes de servicio.</Text>
            {requests.map((r) => (
              <View key={r.id} style={styles.requestRow}>
                <View style={styles.requestInfo}>
                  <Text style={styles.requestServiceName} numberOfLines={2}>{r.serviceName || r.serviceId}</Text>
                  <Text style={styles.requestMeta}>{r.date || ''}</Text>
                </View>
                <View style={[styles.requestBadge, r.status === 'completed' ? styles.requestBadgeDone : styles.requestBadgePending]}>
                  <Text style={styles.requestBadgeText}>{r.status === 'completed' ? 'Completado' : 'Pendiente'}</Text>
                </View>
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
          <Text style={styles.sectionTitle}>Categorías y qué incluye</Text>
          <Text style={styles.subtitle}>Cupos por plan (Basic / Professional / Premium) y servicios incluidos en cada categoría.</Text>
          {catalog?.categories?.length ? (
            catalog.categories.map((cat) => (
              <View key={cat.id} style={styles.categoryBlock}>
                <View style={styles.categoryHeader}>
                  <Text style={styles.categoryName}>{cat.name}</Text>
                  <View style={styles.categoryLimits}>
                    <Text style={styles.categoryLimitLabel}>Basic: {cat.Basic != null ? cat.Basic : 'Incl.'}</Text>
                    <Text style={styles.categoryLimitLabel}>Pro: {cat.Professional != null ? cat.Professional : 'Incl.'}</Text>
                    <Text style={styles.categoryLimitLabel}>Premium: {cat.Premium != null ? cat.Premium : 'Incl.'}</Text>
                  </View>
                </View>
                <View style={styles.serviceList}>
                  {(servicesByCategory[cat.id] || []).map((svc) => (
                    <View key={svc.id} style={styles.catalogServiceRow}>
                      <Text style={styles.catalogServiceName} numberOfLines={2}>{svc.name}</Text>
                      <Text style={styles.catalogServiceMeta}>{svc.marca || ''} · {svc.modalidad || ''}</Text>
                    </View>
                  ))}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.mutedText}>Cargando catálogo…</Text>
          )}
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
    gap: spacing.sm,
  },
  serviceInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  serviceName: {
    color: colors.textSoft,
    fontSize: 13,
    marginRight: spacing.sm,
  },
  serviceRemaining: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '700',
    marginTop: 2,
  },
  solicitarBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    minWidth: 88,
    alignItems: 'center',
  },
  solicitarBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
  },
  requestRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  requestInfo: {
    flex: 1,
  },
  requestServiceName: {
    color: colors.textMain,
    fontSize: 14,
    fontWeight: '500',
  },
  requestMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 2,
  },
  requestBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  requestBadgePending: {
    backgroundColor: 'rgba(251, 191, 36, 0.2)',
  },
  requestBadgeDone: {
    backgroundColor: 'rgba(16, 185, 129, 0.2)',
  },
  requestBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMain,
  },
  categoryBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  categoryHeader: {
    marginBottom: spacing.sm,
  },
  categoryName: {
    color: colors.textMain,
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 4,
  },
  categoryLimits: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  categoryLimitLabel: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '600',
  },
  serviceList: {
    paddingLeft: spacing.sm,
    gap: 6,
  },
  catalogServiceRow: {
    paddingVertical: 4,
    borderLeftWidth: 2,
    borderLeftColor: colors.border,
    paddingLeft: 8,
  },
  catalogServiceName: {
    color: colors.textSoft,
    fontSize: 13,
  },
  catalogServiceMeta: {
    color: colors.textMuted,
    fontSize: 11,
    marginTop: 2,
  },
  mutedText: {
    color: colors.textMuted,
    fontSize: 13,
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
