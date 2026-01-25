import { StyleSheet, Text, View, ScrollView, Pressable } from 'react-native';
import { colors, spacing } from '../theme';

export default function ProfileScreen() {
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <View>
            <Text style={styles.profileName}>María Rodríguez</Text>
            <Text style={styles.profileEmail}>maria@gsp.com.co</Text>
            <Text style={styles.profilePhone}>+57 300 555 0199</Text>
          </View>
          <View style={styles.levelBadge}>
            <Text style={styles.levelBadgeText}>Nivel Oro</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferencias</Text>
          <View style={styles.preferenceCard}>
            <Text style={styles.preferenceLabel}>Notificaciones</Text>
            <Text style={styles.preferenceValue}>Activadas</Text>
          </View>
          <View style={styles.preferenceCard}>
            <Text style={styles.preferenceLabel}>Canal preferido</Text>
            <Text style={styles.preferenceValue}>WhatsApp</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones rápidas</Text>
          <Pressable style={pressableStyle(styles.primaryButton)}>
            <Text style={styles.primaryButtonText}>Actualizar datos</Text>
          </Pressable>
          <Pressable style={pressableStyle(styles.secondaryButton)}>
            <Text style={styles.secondaryButtonText}>Contactar soporte</Text>
          </Pressable>
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
  profileCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  profileName: {
    color: colors.textMain,
    fontSize: 20,
    fontWeight: '700',
  },
  profileEmail: {
    color: colors.textMuted,
    marginTop: 4,
    fontSize: 13,
  },
  profilePhone: {
    color: colors.textSoft,
    marginTop: 2,
    fontSize: 13,
  },
  levelBadge: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  levelBadgeText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 13,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    color: colors.textMain,
    fontSize: 20,
    fontWeight: '600',
  },
  preferenceCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  preferenceLabel: {
    color: colors.textSoft,
    fontSize: 14,
  },
  preferenceValue: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 14,
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
    fontSize: 14,
  },
  secondaryButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.buttonText,
    fontWeight: '600',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.7,
  },
});
