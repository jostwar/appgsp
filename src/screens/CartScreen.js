import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';
import { useCart } from '../store/cart';
import { createOrder, getOrderPayUrl } from '../api/woocommerce';

export default function CartScreen({ navigation }) {
  const tabBarHeight = useBottomTabBarHeight();
  const { items, removeItem, clear, subtotal, increaseItem, decreaseItem } = useCart();
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
  const getRebatePercent = (value) => {
    const total = Number(value || 0);
    if (total >= 30_000_000) return 2;
    if (total >= 15_000_000) return 1.5;
    if (total >= 5_000_000) return 1;
    return 0;
  };
  const rebatePercent = getRebatePercent(subtotal);
  const estimatedCashback =
    rebatePercent > 0 ? Math.round((subtotal * rebatePercent) / 100) : 0;
  const getBrandLabel = (product) => {
    if (Array.isArray(product?.brands) && product.brands.length > 0) {
      const brand = product.brands[0];
      return typeof brand === 'string' ? brand : brand?.name;
    }
    if (product?.brand) {
      return typeof product.brand === 'string' ? product.brand : product.brand?.name;
    }
    if (Array.isArray(product?.attributes)) {
      const brandAttr = product.attributes.find((attr) =>
        String(attr?.name || '').toLowerCase().includes('marca')
      );
      const option =
        Array.isArray(brandAttr?.options) && brandAttr.options.length > 0
          ? brandAttr.options[0]
          : brandAttr?.option;
      if (option) {
        return option;
      }
    }
    return '';
  };
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
        {items.map((item) => {
          const image =
            item.images && item.images.length > 0
              ? item.images[0].src
              : item.image && item.image !== 'null'
                ? item.image
                : null;
          const brandLabel = getBrandLabel(item);
          const regularPrice = Number(item.regular_price || 0);
          const currentPrice = Number(item.price || 0);
          const showDiscount = regularPrice > currentPrice && currentPrice > 0;
          const discountPercent = showDiscount
            ? Math.round(((regularPrice - currentPrice) / regularPrice) * 100)
            : 0;

          return (
            <View key={item.id} style={styles.itemCard}>
              <View style={styles.itemMedia}>
                {image ? (
                  <Image source={{ uri: image }} style={styles.itemImage} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Text style={styles.imageText}>Sin imagen</Text>
                  </View>
                )}
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {item.name}
                </Text>
                {brandLabel ? (
                  <Text style={styles.itemBrand}>Marca: {brandLabel}</Text>
                ) : null}
                {item.sku ? <Text style={styles.itemSku}>SKU: {item.sku}</Text> : null}
                <View style={styles.priceRow}>
                  {showDiscount ? (
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountText}>-{discountPercent}%</Text>
                    </View>
                  ) : null}
                  <Text style={styles.priceValue}>{formatCop(item.price)}</Text>
                  {showDiscount ? (
                    <Text style={styles.priceOld}>{formatCop(regularPrice)}</Text>
                  ) : null}
                </View>
                <View style={styles.controlsRow}>
                  <View style={styles.qtyPill}>
                    <Pressable
                      style={pressableStyle(styles.qtyIconButton)}
                      onPress={() => decreaseItem(item.id)}
                    >
                      <Ionicons name="trash-outline" size={16} color="#2563eb" />
                    </Pressable>
                    <Text style={styles.qtyValue}>{item.quantity}</Text>
                    <Pressable
                      style={pressableStyle(styles.qtyIconButton)}
                      onPress={() => increaseItem(item.id)}
                    >
                      <Ionicons name="add" size={18} color="#2563eb" />
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          );
        })}
      </View>

      <View style={[styles.footer, { paddingBottom: spacing.xl + tabBarHeight }]}>
        <View style={styles.totalRow}>
          <Text style={styles.totalLabel}>Subtotal</Text>
          <View style={styles.totalValueGroup}>
            <Text style={styles.totalValue}>{formatCop(subtotal)}</Text>
            <Text style={styles.taxNote}>IVA incluido</Text>
          </View>
        </View>
        <View style={styles.shippingRow}>
          <Text style={styles.shippingLabel}>Envío</Text>
          <Text style={styles.shippingValue}>Se calcula en el checkout</Text>
        </View>
        <View style={styles.pointsRow}>
          <Text style={styles.pointsLabel}>Cashback estimado</Text>
          <Text style={styles.pointsValue}>{formatCop(estimatedCashback)}</Text>
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
              navigation.navigate('Checkout', { url: payUrl, forceLogin: true });
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
    gap: spacing.md,
  },
  itemMedia: {
    width: 78,
    height: 78,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageText: {
    color: colors.textMuted,
    fontSize: 11,
  },
  itemInfo: {
    flex: 1,
    gap: 6,
  },
  itemTitle: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 15,
  },
  itemBrand: {
    color: colors.textSoft,
    fontSize: 12,
  },
  itemSku: {
    color: colors.textMuted,
    fontSize: 12,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  discountBadge: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 999,
  },
  discountText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '700',
  },
  priceValue: {
    color: colors.textMain,
    fontSize: 16,
    fontWeight: '700',
  },
  priceOld: {
    color: colors.textMuted,
    fontSize: 12,
    textDecorationLine: 'line-through',
  },
  controlsRow: {
    marginTop: spacing.xs,
  },
  qtyPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: '#e7f3ff',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  qtyIconButton: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyValue: {
    color: '#0f172a',
    fontWeight: '700',
    fontSize: 13,
    minWidth: 18,
    textAlign: 'center',
  },
  footer: {
    padding: spacing.xl,
    gap: spacing.sm,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  shippingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pointsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  totalValueGroup: {
    alignItems: 'flex-end',
  },
  shippingLabel: {
    color: colors.textMuted,
    fontSize: 14,
  },
  totalValue: {
    color: colors.textMain,
    fontSize: 18,
    fontWeight: '700',
  },
  shippingValue: {
    color: colors.textSoft,
    fontSize: 13,
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
