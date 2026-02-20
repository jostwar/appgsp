import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  Linking,
} from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { colors, spacing } from '../theme';
import { fetchProducts, searchProducts } from '../api/woocommerce';

export default function SearchScreen({ route }) {
  const tabBarHeight = useBottomTabBarHeight();
  const initialQuery = route?.params?.query || '';
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');
  const debounceRef = useRef(null);
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];

  const formatCop = (value) => {
    if (!value) return '';
    const numeric = Number.parseFloat(value);
    if (Number.isNaN(numeric)) return String(value);
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(numeric);
  };

  const normalizedResults = useMemo(() => {
    return Array.isArray(results) ? results : [];
  }, [results]);

  const mapToShape = (list) =>
    (list || []).map((p) => ({
      id: p?.id,
      name: p?.name,
      price: p?.price,
      images: p?.images,
      sku: p?.sku,
      link: p?.permalink,
    }));

  const handleSearch = async (overrideQuery) => {
    const safeQuery = (overrideQuery ?? query).trim();
    if (safeQuery.length < 2) return;
    setStatus('loading');
    setError('');
    try {
      let list = await searchProducts(safeQuery);
      if (!list?.length) {
        list = await fetchProducts({ search: safeQuery, page: 1, perPage: 20 });
      }
      setResults(mapToShape(list || []));
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError('No se pudo completar la búsqueda.');
    }
  };

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, []);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      handleSearch(query);
    }, 450);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Buscador con AI</Text>
        <Text style={styles.subtitle}>
          Encuentra productos, categorías o información de GSP.
        </Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="¿Qué estás buscando?"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={() => handleSearch()}
        />
        <Pressable
          style={pressableStyle(styles.primaryButton)}
          onPress={handleSearch}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <ActivityIndicator color={colors.buttonText} />
          ) : (
            <Text style={styles.primaryButtonText}>Buscar</Text>
          )}
        </Pressable>
      </View>

      {status === 'error' ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {status === 'ready' && normalizedResults.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No hay resultados</Text>
        </View>
      ) : null}

      <FlatList
        data={normalizedResults}
        keyExtractor={(item, index) => String(item?.id || index)}
        contentContainerStyle={[
          styles.list,
          { paddingBottom: spacing.xxl + tabBarHeight },
        ]}
        renderItem={({ item }) => (
          <View style={styles.resultCard}>
            {item?.images?.[0]?.src ? (
              <Image
                source={{ uri: item.images[0].src }}
                style={styles.resultImage}
              />
            ) : null}
            <Text style={styles.resultTitle}>
              {item?.name || 'Resultado'}
            </Text>
            {item?.sku ? (
              <Text style={styles.resultText}>{item.sku}</Text>
            ) : null}
            {item?.price ? (
              <Text style={styles.resultPrice}>{formatCop(item.price)}</Text>
            ) : null}
            {item?.link ? (
              <Pressable
                style={pressableStyle(styles.secondaryButton)}
                onPress={() => Linking.openURL(item.link)}
              >
                <Text style={styles.secondaryButtonText}>Ver en web</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.textMain,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
  },
  searchRow: {
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.textMain,
    fontSize: 15,
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
  },
  errorBox: {
    gap: spacing.xs,
  },
  errorDebug: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.xs,
  },
  resultTitle: {
    color: colors.textMain,
    fontWeight: '600',
  },
  resultPrice: {
    color: colors.textSoft,
    fontSize: 13,
  },
  resultText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  resultImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginBottom: spacing.sm,
  },
  secondaryButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.buttonText,
    fontWeight: '600',
    fontSize: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  empty: {
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
  },
  rawCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
