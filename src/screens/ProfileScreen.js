import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Switch, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing } from '../theme';
import { useAuth } from '../store/auth';

export default function ProfileScreen({ navigation }) {
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];
  const { user, signOut } = useAuth();
  const displayName =
    user?.firstName || user?.lastName
      ? `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
      : user?.fullName || user?.name || 'Usuario GSP';
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [preferredChannel, setPreferredChannel] = useState('WhatsApp');
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const customerLevel = 'Purple Partner';
  const levelColors = {
    'Blue Partner': '#3B82F6',
    'Purple Partner': '#8B5CF6',
    'Red Partner': '#EF4444',
  };
  const levelColor = levelColors[customerLevel] || colors.accent;

  const savePrefs = async (next) => {
    try {
      await AsyncStorage.setItem('profile_prefs', JSON.stringify(next));
    } catch (_error) {
      // ignore persistence errors for now
    }
  };

  useEffect(() => {
    let isMounted = true;
    const loadPrefs = async () => {
      try {
        const raw = await AsyncStorage.getItem('profile_prefs');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (!isMounted || !parsed) return;
        if (typeof parsed.notificationsEnabled === 'boolean') {
          setNotificationsEnabled(parsed.notificationsEnabled);
        }
        if (typeof parsed.preferredChannel === 'string') {
          setPreferredChannel(parsed.preferredChannel);
        }
      } catch (_error) {
        // ignore load errors
      } finally {
        if (isMounted) {
          setPrefsLoaded(true);
        }
      }
    };
    loadPrefs();
    return () => {
      isMounted = false;
    };
  }, []);
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.profileCard}>
          <View>
            <Text style={styles.profileName}>
              {displayName}
            </Text>
            <Text style={styles.profileEmail}>
              {user?.email || 'correo@gsp.com.co'}
            </Text>
            <Text style={styles.profilePhone}>+57 300 555 0199</Text>
          </View>
          <View style={[styles.levelBadge, { backgroundColor: levelColor }]}>
            <Text style={styles.levelBadgeText}>Nivel {customerLevel}</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Membresía GSP Care</Text>
          <View style={styles.preferenceCard}>
            <Text style={styles.preferenceLabel}>Estado</Text>
            <Text style={styles.preferenceValue}>Sin membresía</Text>
          </View>
          <Pressable
            style={pressableStyle(styles.primaryButton)}
            onPress={() => navigation.navigate('Membresia')}
          >
            <Text style={styles.primaryButtonText}>Conocer planes</Text>
          </Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Preferencias</Text>
          <View style={styles.preferenceCard}>
            <Text style={styles.preferenceLabel}>Notificaciones</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={(value) => {
                setNotificationsEnabled(value);
                savePrefs({ notificationsEnabled: value, preferredChannel });
              }}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={colors.textMain}
              disabled={!prefsLoaded}
            />
          </View>
          <View style={styles.preferenceCard}>
            <Text style={styles.preferenceLabel}>Canal preferido</Text>
            <View style={styles.channelRow}>
              {['WhatsApp', 'Email', 'Llamada'].map((option) => (
                <Pressable
                  key={option}
                  style={({ pressed }) => [
                    styles.channelChip,
                    preferredChannel === option && styles.channelChipActive,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => {
                    setPreferredChannel(option);
                    savePrefs({ notificationsEnabled, preferredChannel: option });
                  }}
                  disabled={!prefsLoaded}
                >
                  <Text
                    style={[
                      styles.channelText,
                      preferredChannel === option && styles.channelTextActive,
                    ]}
                  >
                    {option}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Acciones rápidas</Text>
          <Pressable
            style={pressableStyle(styles.primaryButton)}
            onPress={() => Linking.openURL('https://gsp.com.co/my-account/')}
          >
            <Text style={styles.primaryButtonText}>Actualizar datos</Text>
          </Pressable>
          <Pressable style={pressableStyle(styles.secondaryButton)}>
            <Text style={styles.secondaryButtonText}>Contactar soporte</Text>
          </Pressable>
          <Pressable
            style={pressableStyle(styles.secondaryButton)}
            onPress={signOut}
          >
            <Text style={styles.secondaryButtonText}>Cerrar sesión</Text>
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
    alignItems: 'center',
    gap: spacing.sm,
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
  channelRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'flex-end',
  },
  channelChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.surface,
  },
  channelChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.buttonBg,
  },
  channelText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  channelTextActive: {
    color: colors.buttonText,
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
