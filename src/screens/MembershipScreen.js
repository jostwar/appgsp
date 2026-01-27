import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { colors, spacing } from '../theme';
import { useAuth } from '../store/auth';

export default function MembershipScreen() {
  const { user } = useAuth();
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
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
  const validUntil = '31 dic 2026';
  const plans = useMemo(
    () => [
      { id: 'annual', label: 'Pago anual', value: '$399.000' },
      { id: 'semi', label: 'Pago semestral', value: '2 pagos de $249.500' },
      { id: 'quarter', label: 'Pago trimestral', value: '4 pagos de $150.000' },
    ],
    []
  );
  const savingsItems = useMemo(
    () => [
      { id: 'password', label: 'Password', qty: 10, normal: 30_000, member: 0 },
      { id: 'firmware', label: 'Firmware', qty: 10, normal: 40_000, member: 0 },
      {
        id: 'diag-ptz',
        label: 'Diagnóstico cámaras PTZ',
        qty: 10,
        normal: 95_000,
        member: 0,
      },
      {
        id: 'diag-cctv',
        label: 'Diagnóstico cámaras y grabadores',
        qty: 10,
        normal: 20_000,
        member: 0,
      },
      { id: 'mano', label: 'Cambios mano a mano', qty: 2, normal: 600_000, member: 0 },
    ],
    []
  );
  const savingsTotal = useMemo(
    () =>
      savingsItems.reduce(
        (sum, item) =>
          sum + Math.max(0, (item.normal - item.member) * item.qty),
        0
      ),
    [savingsItems]
  );
  const annualMembershipValue = 399_000;
  const netSavings = Math.max(0, savingsTotal - annualMembershipValue);

  const benefits = useMemo(
    () => [
      { icon: 'key', label: '10 servicios de reset de password' },
      { icon: 'hardware-chip', label: '10 servicios de firmware' },
      { icon: 'build', label: '10 revisiones de equipos' },
      {
        icon: 'swap-horizontal',
        label:
          '2 cambios al año mano a mano a equipos no mayor de $300.000 (IVA incluido). Aplica para equipos adquiridos en el año corriente o mínimo 2 meses antes de fin de año anterior (quemados, partidos, etc).',
      },
      { icon: 'school', label: '2 a 4 capacitaciones o certificaciones gratis al año' },
    ],
    []
  );

  const formatCop = (value) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing.xxl + tabBarHeight },
        ]}
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
            <Text style={styles.memberCardTitle}>Membresía</Text>
          </View>
          <View style={styles.memberRow}>
            <View>
              <Text style={styles.memberLabel}>Titular</Text>
              <Text style={styles.memberName}>{memberName}</Text>
              <Text style={styles.memberMeta}>Válido hasta {validUntil}</Text>
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

        <View style={styles.card}>
          {plans.map((plan) => (
            <View key={plan.id} style={styles.row}>
              <Text style={styles.label}>{plan.label}</Text>
              <Text style={styles.value}>{plan.value}</Text>
            </View>
          ))}
          <Text style={styles.subtitle}>Costos IVA incluido</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Ahorro anual estimado</Text>
          <View style={styles.savingsHeader}>
            <Text style={styles.savingsHeaderLabel}>Servicio</Text>
            <Text style={styles.savingsHeaderValue}>Cant.</Text>
          </View>
          {savingsItems.map((item) => {
            const normalTotal = item.normal * item.qty;
            const memberTotal = item.member * item.qty;
            const savings = Math.max(0, normalTotal - memberTotal);
            return (
              <View key={item.id} style={styles.savingsRow}>
                <View style={styles.savingsRowMain}>
                  <Text style={styles.savingsLabel}>{item.label}</Text>
                  <Text style={styles.savingsQty}>x{item.qty}</Text>
                </View>
                <View style={styles.savingsRowValues}>
                  <View style={styles.savingsValueBlock}>
                    <Text style={styles.savingsValueLabel}>Normal</Text>
                    <Text style={styles.savingsValue}>{formatCop(normalTotal)}</Text>
                  </View>
                  <View style={styles.savingsValueBlock}>
                    <Text style={styles.savingsValueLabel}>Con membresía</Text>
                    <Text style={styles.savingsValue}>{formatCop(memberTotal)}</Text>
                  </View>
                  <View style={styles.savingsValueBlock}>
                    <Text style={styles.savingsValueLabel}>Ahorro</Text>
                    <Text style={styles.savingsValue}>{formatCop(savings)}</Text>
                  </View>
                </View>
              </View>
            );
          })}
          <Text style={styles.savingsNote}>
            Certificaciones y capacitaciones pueden ser pagas según el caso.
          </Text>
          <View style={styles.row}>
            <Text style={styles.totalLabel}>Total ahorro anual</Text>
            <Text style={styles.totalValue}>{formatCop(savingsTotal)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.totalLabel}>Membresía anual</Text>
            <Text style={styles.totalValue}>{formatCop(annualMembershipValue)}</Text>
          </View>
          <View style={styles.row}>
            <Text style={styles.totalLabel}>Ahorro neto estimado</Text>
            <Text style={styles.totalValue}>{formatCop(netSavings)}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Incluye</Text>
          {benefits.map((benefit, index) => (
            <View key={`${benefit.label}-${index}`} style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name={benefit.icon} size={18} color={colors.primary} />
              </View>
              <Text style={styles.benefitText}>{benefit.label}</Text>
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
  savingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savingsHeaderLabel: {
    color: colors.textMuted,
    fontSize: 12,
  },
  savingsHeaderValue: {
    color: colors.textMuted,
    fontSize: 12,
  },
  savingsRow: {
    gap: spacing.xs,
  },
  savingsRowMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  savingsLabel: {
    color: colors.textSoft,
    fontSize: 13,
    flex: 1,
  },
  savingsQty: {
    color: colors.textMuted,
    fontSize: 12,
  },
  savingsRowValues: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  savingsValueBlock: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  savingsValueLabel: {
    color: colors.textMuted,
    fontSize: 11,
  },
  savingsValue: {
    color: colors.textMain,
    fontSize: 13,
    fontWeight: '600',
  },
  savingsNote: {
    color: colors.textMuted,
    fontSize: 12,
  },
  totalLabel: {
    color: colors.textMain,
    fontWeight: '700',
    fontSize: 14,
  },
  totalValue: {
    color: colors.textMain,
    fontWeight: '700',
    fontSize: 14,
  },
  benefitRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  benefitIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  benefitText: {
    color: colors.textSoft,
    fontSize: 13,
    flex: 1,
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
