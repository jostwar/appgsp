import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing } from '../theme';
import { useCart } from '../store/cart';
import { createOrder, getOrderPayUrl } from '../api/woocommerce';

export default function CartScreen({ navigation }) {
  const { items, removeItem, clear, subtotal, pointsTotal } = useCart();
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0);
  const formatCop = (value) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(Number(value || 0));
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];

  if (items.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>Tu carrito está vacío</Text>
        <Text style={styles.centerText}>
          Agrega productos desde la sección Productos.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.list}>
        <View style={styles.countRow}>
          <Text style={styles.countLabel}>Productos en carrito</Text>
          <Text style={styles.countValue}>{totalItems}</Text>
        </View>
        {items.map((item) => (
          <View key={item.id} style={styles.itemCard}>
            <View style={styles.itemInfo}>
              <Text style={styles.itemTitle}>{item.name}</Text>
              <Text style={styles.itemMeta}>
                {item.quantity} x {formatCop(item.price)}
              </Text>
            </View>
            <Pressable
              style={pressableStyle(styles.secondaryButton)}
              onPress={() => removeItem(item.id)}
            >
              <Text style={styles.secondaryButtonText}>Quitar</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <Text style={styles.totalValue}>{formatCop(subtotal)}</Text>
        </View>
        <Text style={styles.taxNote}>IVA incluido</Text>
        <View style={styles.pointsRow}>
          <Text style={styles.pointsLabel}>Puntos acumulados</Text>
          <Text style={styles.pointsValue}>{pointsTotal}</Text>
        </View>
        <Pressable
          style={pressableStyle(styles.primaryButton)}
          disabled={status === 'loading'}
          onPress={async () => {
            try {
              setError('');
              setStatus('loading');
              const lineItems = items.map((item) => ({
                product_id: item.id,
                quantity: item.quantity,
              }));
              const order = await createOrder(lineItems);
              const payUrl = getOrderPayUrl(order.id, order.order_key);
              navigation.navigate('Checkout', { url: payUrl });
            } catch (err) {
              setError('No se pudo iniciar el pago. Intenta nuevamente.');
            } finally {
              setStatus('idle');
            }
          }}
        >
          {status === 'loading' ? (
            <ActivityIndicator color={colors.buttonText} />
          ) : (
            <Text style={styles.primaryButtonText}>Ir a pagar</Text>
          )}
        </Pressable>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        <Pressable style={pressableStyle(styles.secondaryButton)} onPress={clear}>
          <Text style={styles.secondaryButtonText}>Vaciar carrito</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    padding: spacing.xl,
    gap: spacing.md,
  },
  countRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
  },
  countLabel: {
    color: colors.textMuted,
    fontSize: 13,
  },
  countValue: {
    color: colors.textMain,
    fontSize: 16,
    fontWeight: '700',
  },
  itemCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemInfo: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 15,
  },
  itemMeta: {
    color: colors.textMuted,
    fontSize: 13,
  },
  footer: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  pointsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  totalValue: {
    color: colors.textMain,
    fontSize: 18,
    fontWeight: '700',
  },
  taxNote: {
    color: colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  pointsLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  pointsValue: {
    color: colors.textMain,
    fontSize: 16,
    fontWeight: '600',
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
  errorText: {
    color: colors.warning,
    textAlign: 'center',
    fontSize: 13,
  },
  secondaryButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.buttonText,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
  center: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  centerTitle: {
    color: colors.textMain,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  centerText: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
  },
});
