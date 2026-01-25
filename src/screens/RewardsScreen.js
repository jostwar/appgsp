import { useMemo } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Linking,
} from 'react-native';
import { colors, spacing } from '../theme';

export default function RewardsScreen() {
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];
  const rewards = useMemo(
    () => [
      {
        id: 'money',
        title: 'Dinero en saldo',
        points: '2.000 pts',
        value: '$20.000',
      },
      {
        id: 'gift',
        title: 'Tarjeta regalo',
        points: '5.000 pts',
        value: '$60.000',
      },
      {
        id: 'item',
        title: 'Accesorios premium',
        points: '3.500 pts',
        value: 'Item',
      },
    ],
    []
  );

  const steps = useMemo(
    () => [
      {
        id: '1',
        title: 'Acumula',
        description: 'Compra productos y gana puntos por cada pedido.',
      },
      {
        id: '2',
        title: 'Elige',
        description: 'Selecciona dinero, gift cards o productos.',
      },
      {
        id: '3',
        title: 'Canjea',
        description: 'Solicita el canje y recibe confirmación.',
      },
    ],
    []
  );

  const rates = useMemo(
    () => [
      { id: 'a', label: '1.000 pts', value: '$10.000' },
      { id: 'b', label: '2.000 pts', value: '$20.000' },
      { id: 'c', label: '5.000 pts', value: '$60.000' },
    ],
    []
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.pointsCard}>
          <Text style={styles.pointsLabel}>Saldo de puntos</Text>
          <Text style={styles.pointsValue}>8.450</Text>
          <Text style={styles.pointsHint}>
            Próximo nivel en 1.550 pts
          </Text>
          <View style={styles.levelRow}>
            <View style={styles.levelDot} />
            <Text style={styles.levelText}>Nivel Oro</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Programa GSPRewards</Text>
          <Text style={styles.sectionSubtitle}>
            Gana puntos por cada compra y canjéalos por dinero o productos.
          </Text>
          <View style={styles.rewardsGrid}>
            {rewards.map((reward) => (
              <View key={reward.id} style={styles.rewardCard}>
                <Text style={styles.rewardTitle}>{reward.title}</Text>
                <Text style={styles.rewardPoints}>{reward.points}</Text>
                <Text style={styles.rewardValue}>{reward.value}</Text>
                <Pressable style={pressableStyle(styles.secondaryButton)}>
                  <Text style={styles.secondaryButtonText}>Canjear</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Conversión rápida</Text>
          <View style={styles.conversionCard}>
            {rates.map((rate) => (
              <View key={rate.id} style={styles.conversionRow}>
                <Text style={styles.conversionLabel}>{rate.label}</Text>
                <Text style={styles.conversionValue}>{rate.value}</Text>
              </View>
            ))}
            <Pressable
              style={pressableStyle(styles.primaryButton)}
              onPress={() => Linking.openURL('https://wa.me/573103611116')}
            >
              <Text style={styles.primaryButtonText}>Solicitar canje</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>¿Cómo funciona GSPRewards?</Text>
          <View style={styles.stepsGrid}>
            {steps.map((step) => (
              <View key={step.id} style={styles.stepCard}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepText}>{step.description}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actividad reciente</Text>
          <View style={styles.activityCard}>
            <View style={styles.activityRow}>
              <Text style={styles.activityTitle}>Compra supermercado</Text>
              <Text style={styles.activityPoints}>+450 pts</Text>
            </View>
            <Text style={styles.activityDate}>21 ene 2026</Text>
          </View>
          <View style={styles.activityCard}>
            <View style={styles.activityRow}>
              <Text style={styles.activityTitle}>Canje tarjeta regalo</Text>
              <Text style={styles.activityRedeem}>-5.000 pts</Text>
            </View>
            <Text style={styles.activityDate}>10 ene 2026</Text>
          </View>
        </View>
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
  pointsCard: {
    backgroundColor: colors.card,
    padding: spacing.lg,
    borderRadius: 20,
    gap: spacing.sm,
  },
  pointsLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  pointsValue: {
    color: colors.textMain,
    fontSize: 34,
    fontWeight: '700',
  },
  pointsHint: {
    color: colors.textMuted,
    fontSize: 13,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  levelDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
  levelText: {
    color: colors.textSoft,
    fontWeight: '600',
    fontSize: 14,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMain,
    fontSize: 20,
    fontWeight: '600',
  },
  sectionSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  rewardsGrid: {
    gap: spacing.md,
  },
  rewardCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  rewardTitle: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 15,
  },
  rewardPoints: {
    color: colors.textMuted,
    fontSize: 13,
  },
  rewardValue: {
    color: colors.textSoft,
    fontSize: 14,
    marginBottom: spacing.sm,
  },
  secondaryButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.buttonText,
    fontWeight: '600',
    fontSize: 13,
  },
  conversionCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  conversionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  conversionLabel: {
    color: colors.textSoft,
    fontSize: 14,
  },
  conversionValue: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 14,
  },
  primaryButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: '700',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  stepsGrid: {
    gap: spacing.md,
  },
  stepCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  stepTitle: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 15,
  },
  stepText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  activityCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    gap: 4,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  activityTitle: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 15,
  },
  activityPoints: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  activityRedeem: {
    color: colors.warning,
    fontWeight: '600',
    fontSize: 14,
  },
  activityDate: {
    color: colors.textMuted,
    fontSize: 13,
  },
});
