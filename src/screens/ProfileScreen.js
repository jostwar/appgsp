import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Switch,
  Linking,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors, spacing } from '../theme';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useAuth } from '../store/auth';
import { getWooOrders } from '../api/backend';

export default function ProfileScreen({ navigation }) {
  const tabBarHeight = useBottomTabBarHeight();
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
  const [orders, setOrders] = useState([]);
  const [ordersStatus, setOrdersStatus] = useState('idle');
  const [isRefreshing, setIsRefreshing] = useState(false);
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

  const loadPrefs = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('profile_prefs');
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed) return;
      if (typeof parsed.notificationsEnabled === 'boolean') {
        setNotificationsEnabled(parsed.notificationsEnabled);
      }
      if (typeof parsed.preferredChannel === 'string') {
        setPreferredChannel(parsed.preferredChannel);
      }
    } catch (_error) {
      // ignore load errors
    } finally {
      setPrefsLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadPrefs();
  }, [loadPrefs]);

  const fetchOrders = useCallback(async () => {
    if (!user?.cedula && !user?.customerId && !user?.email) {
      setOrders([]);
      setOrdersStatus('missing');
      return;
    }
    setOrdersStatus('loading');
    try {
      const data = await getWooOrders({
        cedula: user?.cedula,
        customerId: user?.customerId,
          email: user?.email,
        perPage: 10,
        page: 1,
      });
      setOrders(Array.isArray(data?.orders) ? data.orders : []);
      setOrdersStatus('ready');
    } catch (_error) {
      setOrders([]);
      setOrdersStatus('error');
    }
  }, [user?.cedula, user?.customerId, user?.email]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([loadPrefs(), fetchOrders()]);
    setIsRefreshing(false);
  }, [loadPrefs, fetchOrders]);

  const orderItems = useMemo(
    () =>
      orders.map((order) => ({
        id: order?.id,
        status: order?.status || '',
        total: order?.total || '0',
        date: order?.date_created || order?.date_created_gmt || '',
        items: Array.isArray(order?.line_items) ? order.line_items.length : 0,
      })),
    [orders]
  );

  const formatOrderDate = (value) => {
    if (!value) return '—';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '—';
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
    }).format(parsed);
  };

  const formatCop = (value) => {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(Number.isNaN(numeric) ? 0 : numeric);
  };
  const helpLinks = [
    { label: 'Preguntas frecuentes', url: 'https://gsp.com.co/preguntas-frecuentes/' },
    { label: 'Contáctanos', url: 'https://gsp.com.co/contacto/' },
  ];
  const legalLinks = [
    { label: 'Términos y condiciones', url: 'https://gsp.com.co/terminos-y-condiciones/' },
    { label: 'Autorización datos personales', url: 'https://gsp.com.co/politica-de-tratamiento-de-datos-personales/' },
    { label: 'Política de garantías', url: 'https://gsp.com.co/politica-de-garantia/' },
  ];
  return (
    <View style={styles.screen}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing.xxl + tabBarHeight },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
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
          <Text style={styles.sectionTitle}>Mis pedidos</Text>
          {ordersStatus === 'loading' ? (
            <Text style={styles.sectionHint}>Cargando pedidos...</Text>
          ) : ordersStatus === 'error' ? (
            <Text style={styles.sectionHint}>No se pudieron cargar pedidos.</Text>
          ) : orderItems.length === 0 ? (
            <Text style={styles.sectionHint}>No hay pedidos registrados.</Text>
          ) : (
            orderItems.map((order) => (
              <View key={order.id} style={styles.orderCard}>
                <View>
                  <Text style={styles.orderTitle}>Pedido #{order.id}</Text>
                  <Text style={styles.orderMeta}>
                    {formatOrderDate(order.date)} · {order.items} items ·{' '}
                    {order.status}
                  </Text>
                </View>
                <Text style={styles.orderTotal}>{formatCop(order.total)}</Text>
              </View>
            ))
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ayuda</Text>
          <View style={styles.linkCard}>
            {helpLinks.map((item, index) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [
                  styles.linkRow,
                  index === helpLinks.length - 1 && styles.linkRowLast,
                  pressed && styles.pressed,
                ]}
                onPress={() => Linking.openURL(item.url)}
              >
                <Text style={styles.linkText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal</Text>
          <View style={styles.linkCard}>
            {legalLinks.map((item, index) => (
              <Pressable
                key={item.label}
                style={({ pressed }) => [
                  styles.linkRow,
                  index === legalLinks.length - 1 && styles.linkRowLast,
                  pressed && styles.pressed,
                ]}
                onPress={() => Linking.openURL(item.url)}
              >
                <Text style={styles.linkText}>{item.label}</Text>
                <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
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
  linkCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  linkRowLast: {
    borderBottomWidth: 0,
  },
  linkText: {
    color: colors.textMain,
    fontSize: 14,
    fontWeight: '600',
  },
  sectionHint: {
    color: colors.textMuted,
    fontSize: 13,
  },
  orderCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderTitle: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 14,
  },
  orderMeta: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  orderTotal: {
    color: colors.textMain,
    fontWeight: '700',
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
