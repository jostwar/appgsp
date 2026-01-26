import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Linking, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';

export default function MembershipScreen() {
  const memberName = 'Cliente GSP';
  const validUntil = '31 dic 2026';
  const plans = useMemo(
    () => [
      { id: 'annual', label: 'Pago anual', value: '$399.000' },
      { id: 'semi', label: 'Pago semestral', value: '2 pagos de $249.500' },
      { id: 'quarter', label: 'Pago trimestral', value: '4 pagos de $150.000' },
    ],
    []
  );

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

  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          <Image
            source={{
              uri: 'https://gsp.com.co/wp-content/uploads/2026/01/GSP-Care-Square.png',
            }}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Membresía GSP Care</Text>
          <Text style={styles.subtitle}>Costos IVA incluido</Text>
        </View>

        <View style={styles.memberCard}>
          <View style={styles.memberCardHighlight} />
          <View style={styles.memberCardHeader}>
            <Text style={styles.memberCardTitle}>GSP</Text>
            <Text style={styles.memberCardCare}>CARE</Text>
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
                  uri: 'https://gsp.com.co/wp-content/uploads/2026/01/Icon-Care.png',
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
          onPress={() => Linking.openURL('https://wa.me/573103611116')}
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
  },
  headerLogo: {
    width: 56,
    height: 56,
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
  },
  memberMeta: {
    color: '#A7ADB5',
    fontSize: 12,
    marginTop: 4,
  },
  memberLogoWrap: {
    alignItems: 'center',
    gap: 4,
  },
  memberLogo: {
    width: 46,
    height: 46,
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
