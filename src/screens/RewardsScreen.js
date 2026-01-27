import { useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Linking,
  Image,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { colors, spacing } from '../theme';
import { getRewardsCatalog, getRewardsPoints } from '../api/backend';
import { useAuth } from '../store/auth';

export default function RewardsScreen() {
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const [rewards, setRewards] = useState([]);
  const [rewardsError, setRewardsError] = useState('');
  const [pointsStatus, setPointsStatus] = useState('idle');
  const [pointsData, setPointsData] = useState(null);
  const [pointsError, setPointsError] = useState('');
  const customerLevel = pointsData?.level || 'Sin nivel';
  const rebatePercent = Number(pointsData?.rebate || 0);
  const baseLevelGoal = 5_000_000;
  const baseLevelRebate = 1;
  const levelThresholds = [
    { name: 'Blue Partner', min: 5_000_000 },
    { name: 'Purple Partner', min: 15_000_000 },
    { name: 'Red Partner', min: 30_000_000 },
  ];
  const levelColors = {
    'Blue Partner': '#3B82F6',
    'Purple Partner': '#8B5CF6',
    'Red Partner': '#EF4444',
  };
  const levelColor = levelColors[customerLevel] || colors.accent;
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];
  const fallbackRewards = useMemo(
    () => [
      {
        id: 'money',
        title: 'Dinero en saldo',
        points: '2.000',
        value: '$20.000',
      },
      {
        id: 'gift',
        title: 'Tarjeta regalo',
        points: '5.000',
        value: '$60.000',
      },
      {
        id: 'item',
        title: 'Accesorios premium',
        points: '3.500',
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
        description: 'Compra productos y acumula cashback por cada pedido.',
      },
      {
        id: '3',
        title: 'Canjea',
        description: 'Solicita el canje y recibe confirmación.',
      },
    ],
    []
  );

  const formatCop = (value) =>
    new Intl.NumberFormat('es-CO').format(Number(value || 0));

  const estimatedMonthlyPurchases = Number(pointsData?.total || 0);
  const nextThreshold = levelThresholds.find(
    (level) => estimatedMonthlyPurchases < level.min
  );
  const remainingForRebate = Math.max(0, baseLevelGoal - estimatedMonthlyPurchases);
  const progressValue = Math.min(1, estimatedMonthlyPurchases / baseLevelGoal);
  const progressPercent = Math.round(progressValue * 100);
  const nextLevelGoal = baseLevelGoal;
  const baseLevelCashback = baseLevelGoal * (baseLevelRebate / 100);

  useEffect(() => {
    let isMounted = true;
    const loadRewards = async () => {
      try {
        const data = await getRewardsCatalog();
        const items = Array.isArray(data?.rewards) ? data.rewards : [];
        if (isMounted && items.length) {
          setRewards(items);
        }
      } catch (error) {
        if (isMounted) {
          setRewardsError(error?.message || 'No se pudieron cargar los premios');
        }
      }
    };

    loadRewards();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const loadPoints = async () => {
      if (!user?.cedula) {
        setPointsData(null);
        setPointsStatus('missing');
        setPointsError('');
        return;
      }
      setPointsStatus('loading');
      setPointsError('');
      try {
        const data = await getRewardsPoints({ cedula: user.cedula });
        if (isMounted) {
          setPointsData(data || null);
          setPointsStatus('ready');
        }
      } catch (error) {
        if (isMounted) {
          setPointsData(null);
          setPointsStatus('error');
          setPointsError(error?.message || 'No se pudieron cargar las compras');
        }
      }
    };

    loadPoints();
    return () => {
      isMounted = false;
    };
  }, [user?.cedula]);

  const rewardsToShow = rewards.length ? rewards : fallbackRewards;

  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing.xxl + tabBarHeight },
        ]}
      >
        <View style={styles.pointsCard}>
          <View style={styles.pointsHeader}>
            <Image
              source={{
                uri: 'https://gsp.com.co/wp-content/uploads/2026/01/GSP-Reware-Rectangular.png',
              }}
              style={styles.pointsLogo}
              resizeMode="contain"
            />
            <Text style={styles.pointsLabel}>Saldo de cashback</Text>
          </View>
          {pointsStatus === 'loading' ? (
            <Text style={styles.pointsHint}>Consultando compras...</Text>
          ) : pointsStatus === 'missing' ? (
            <Text style={styles.pointsHint}>
              No hay cédula asociada. Cierra sesión e inicia de nuevo para sincronizar tu NIT.
            </Text>
          ) : pointsStatus === 'error' ? (
            <Text style={styles.pointsHint}>{pointsError}</Text>
          ) : (
            <>
              <Text style={styles.pointsValue}>
                ${formatCop(pointsData?.cashback || 0)}
              </Text>
              <Text style={styles.pointsHint}>
                Rebate {rebatePercent}% · Compras mensuales antes de IVA
              </Text>
              <Text style={styles.pointsHint}>
                Compras ${formatCop(pointsData?.total || 0)} · Falta $
                {formatCop(remainingForRebate)} para recibir cashback
              </Text>
              <Text style={styles.pointsHint}>
                Al cumplir nivel 1 ganarías ${formatCop(baseLevelCashback)} de cashback
              </Text>
            </>
          )}
          <View style={styles.progressHeader}>
            <Text style={styles.progressText}>{progressPercent}%</Text>
            <Text style={styles.progressText}>
              {nextLevelGoal ? `Meta $${formatCop(nextLevelGoal)}` : 'Meta alcanzada'}
            </Text>
          </View>
          <View style={styles.progressTrack}>
            <View
              style={[styles.progressFill, { width: `${progressValue * 100}%` }]}
            />
            <View style={styles.progressGoal} />
          </View>
          <View style={styles.levelRow}>
            <View style={[styles.levelDot, { backgroundColor: levelColor }]} />
            <Text style={styles.levelText}>{customerLevel}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Image
            source={{
              uri: 'https://gsp.com.co/wp-content/uploads/2026/01/GSP-Reware-Rectangular.png',
            }}
            style={styles.rewardsLogo}
            resizeMode="contain"
          />
          <Text style={styles.sectionTitle}>Rewards</Text>
          <Text style={styles.sectionSubtitle}>
            Acumula cashback en cada compra y redímelo para tus próximas compras en GSP.
          </Text>
          {rewardsError ? (
            <Text style={styles.inlineError}>{rewardsError}</Text>
          ) : null}
          <View style={styles.rewardsGrid}>
            {rewardsToShow.map((reward) => (
              <View key={reward.id} style={styles.rewardCard}>
                {reward.image ? (
                  <Image
                    source={{ uri: reward.image }}
                    style={styles.rewardImage}
                  />
                ) : null}
                <Text style={styles.rewardTitle}>{reward.title}</Text>
                <Text style={styles.rewardPoints}>
                  Cashback requerido ${formatCop(Number(reward.points || 0) * 10)}
                </Text>
                <Text style={styles.rewardValue}>{reward.value}</Text>
                <Pressable style={pressableStyle(styles.secondaryButton)}>
                  <Text style={styles.secondaryButtonText}>Canjear</Text>
                </Pressable>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Niveles Rewards</Text>
          <View style={styles.levelsCard}>
            <View style={styles.levelRow}>
              <Text style={styles.levelLabel}>Blue Partner</Text>
              <Text style={styles.levelValue}>
                Rebate 1% · Compras mensuales &gt; $5.000.000 antes de IVA
              </Text>
            </View>
            <View style={styles.levelRow}>
              <Text style={styles.levelLabel}>Purple Partner</Text>
              <Text style={styles.levelValue}>
                Rebate 1.5% · Compras mensuales &gt; $15.000.000 antes de IVA
              </Text>
            </View>
            <View style={styles.levelRow}>
              <Text style={styles.levelLabel}>Red Partner</Text>
              <Text style={styles.levelValue}>
                Rebate 2% · Compras mensuales &gt; $30.000.000 antes de IVA
              </Text>
            </View>
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
          <View style={styles.notesCard}>
            <Text style={styles.noteText}>
              El cashback se redime para compras futuras de productos disponibles.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Actividad reciente</Text>
          <View style={styles.activityCard}>
            <View style={styles.activityRow}>
              <Text style={styles.activityTitle}>Canje $500.000 cashback</Text>
              <Text style={styles.activityRedeem}>-$500.000</Text>
            </View>
            <Text style={styles.activityDate}>21 ene 2026</Text>
          </View>
          <View style={styles.activityCard}>
            <View style={styles.activityRow}>
              <Text style={styles.activityTitle}>Canje bono gasolina</Text>
              <Text style={styles.activityRedeem}>-$80.000</Text>
            </View>
            <Text style={styles.activityDate}>10 ene 2026</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>T&C</Text>
          <Text style={styles.termsText}>
            Rewards GSP: Acumula cashback en cada compra y redímelo para tus próximas
            compras en GSP. El cashback no es dinero en efectivo, no es transferible
            y no aplica para pagos de cartera ni abonos a cuenta. El cashback es válido
            únicamente para compras futuras de productos disponibles y bajo las
            condiciones y vigencia informadas. Al participar en Rewards GSP aceptas
            estos términos.
          </Text>
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
    textAlign: 'center',
  },
  pointsHeader: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pointsLogo: {
    width: 110,
    height: 32,
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
  progressTrack: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  progressGoal: {
    position: 'absolute',
    right: 0,
    top: -3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.background,
    borderWidth: 2,
    borderColor: colors.textMuted,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  levelRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
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
  rewardsLogo: {
    width: 180,
    height: 52,
    alignSelf: 'center',
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
  rewardImage: {
    width: '100%',
    height: 120,
    borderRadius: 12,
    marginBottom: spacing.xs,
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
  inlineError: {
    color: colors.warning,
    fontSize: 12,
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
  termsText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'justify',
  },
  notesCard: {
    marginTop: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.xs,
  },
  noteText: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  levelsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  levelLabel: {
    color: colors.textSoft,
    fontSize: 14,
    minWidth: 110,
  },
  levelValue: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 14,
    flex: 1,
    flexWrap: 'wrap',
  },
});
