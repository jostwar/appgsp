import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Linking,
} from 'react-native';
import { colors, spacing } from '../theme';
import {
  fetchAllProducts,
  fetchCategories,
  hasWooCredentials,
} from '../api/woocommerce';
import { useCart } from '../store/cart';
import { runSearch } from '../api/aiSearch';
import { useFocusEffect } from '@react-navigation/native';

export default function ProductsScreen({ route }) {
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [selectedCategoryName, setSelectedCategoryName] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('idle');
  const searchDebounceRef = useRef(null);
  const { addItem } = useCart();
  const initialCategoryName = route?.params?.categoryName;
  const initialBrandName = route?.params?.brandName;
  const initialSearchQuery = route?.params?.searchQuery;
  const incomingTs = route?.params?._ts;
  const [addedId, setAddedId] = useState(null);
  const [pendingCategoryName, setPendingCategoryName] = useState(null);


  const formatCop = (value) => {
    if (!value) return 'Consultar';
    const numeric = Number.parseFloat(value);
    if (Number.isNaN(numeric)) return 'Consultar';
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0,
    }).format(numeric);
  };

  const filteredProducts = useMemo(() => {
    if (selectedCategoryId === 'all' && !selectedCategoryName) {
      return products;
    }
    return products.filter((product) =>
      product.categories?.some((category) => {
        if (selectedCategoryId !== 'all') {
          return category.id === selectedCategoryId;
        }
        if (selectedCategoryName) {
          return (
            category.name?.toLowerCase() === selectedCategoryName.toLowerCase()
          );
        }
        return false;
      })
    );
  }, [products, selectedCategoryId, selectedCategoryName]);

  const extractResults = (payload) => {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload.results)) return payload.results;
    if (Array.isArray(payload.items)) return payload.items;
    if (Array.isArray(payload.products)) return payload.products;
    if (typeof payload.products === 'string') {
      try {
        const parsedProducts = JSON.parse(payload.products);
        return Array.isArray(parsedProducts) ? parsedProducts : [];
      } catch (error) {
        return [];
      }
    }
    return [];
  };

  const searchedProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return filteredProducts;
    return filteredProducts.filter((product) =>
      product.name?.toLowerCase().includes(query)
    );
  }, [filteredProducts, searchQuery]);

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchStatus('idle');
      return;
    }
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
    }
    searchDebounceRef.current = setTimeout(async () => {
      setSearchStatus('loading');
      try {
        const data = await runSearch(query);
        const parsedResponse = data?.parsed ?? data;
        const bodyPayload = parsedResponse?.body ?? parsedResponse?.data ?? null;
        const parsedBody =
          typeof bodyPayload === 'string'
            ? (() => {
                try {
                  return JSON.parse(bodyPayload);
                } catch (error) {
                  return bodyPayload;
                }
              })()
            : bodyPayload;
        const parsed =
          parsedBody ||
          parsedResponse?.results ||
          parsedResponse?.items ||
          parsedResponse?.data ||
          (data?.raw ? JSON.parse(data.raw) : data);
        const list = extractResults(parsed);
        setSearchResults(list);
        setSearchStatus('ready');
      } catch (error) {
        setSearchResults([]);
        setSearchStatus('error');
      }
    }, 450);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchQuery]);

  useEffect(() => {
    if (!initialCategoryName) {
      setPendingCategoryName(null);
      return;
    }
    setPendingCategoryName(initialCategoryName);
  }, [initialCategoryName, incomingTs]);

  useEffect(() => {
    setSearchQuery('');
  }, [initialCategoryName]);

  useEffect(() => {
    if (!initialBrandName) return;
    setSelectedCategoryId('all');
    setSelectedCategoryName(null);
    setSearchQuery(initialBrandName);
  }, [initialBrandName]);

  useEffect(() => {
    if (!initialSearchQuery) return;
    setSelectedCategoryId('all');
    setSelectedCategoryName(null);
    setSearchQuery(initialSearchQuery);
  }, [initialSearchQuery]);

  useEffect(() => {
    if (!pendingCategoryName || categories.length === 0) return;
    const normalize = (value) =>
      value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();
    const target = normalize(pendingCategoryName);
    const match = categories.find(
      (category) => normalize(category.name || '') === target
    );
    if (match) {
      setSelectedCategoryId(match.id);
      setSelectedCategoryName(null);
    } else {
      setSelectedCategoryId('all');
      setSelectedCategoryName(pendingCategoryName);
    }
    setPendingCategoryName(null);
  }, [categories, pendingCategoryName]);

  useFocusEffect(
    useCallback(() => {
      const targetCategory = route?.params?.categoryName;
      const targetBrand = route?.params?.brandName;
      const targetSearch = route?.params?.searchQuery;
      if (categories.length === 0) {
        setPendingCategoryName(targetCategory || null);
        return;
      }
      if (targetSearch) {
        setSelectedCategoryId('all');
        setSelectedCategoryName(null);
        setSearchQuery(targetSearch);
        return;
      }
      if (targetBrand) {
        setSelectedCategoryId('all');
        setSelectedCategoryName(null);
        setSearchQuery(targetBrand);
        return;
      }
      if (!targetCategory) {
        setSelectedCategoryId('all');
        setSelectedCategoryName(null);
        setSearchQuery('');
        return;
      }
      const normalize = (value) =>
        value
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .trim();
      const target = normalize(targetCategory);
      const match = categories.find(
        (category) => normalize(category.name || '') === target
      );
      if (match) {
        setSelectedCategoryId(match.id);
        setSelectedCategoryName(null);
      } else {
        setSelectedCategoryId('all');
        setSelectedCategoryName(targetCategory);
      }
      setSearchQuery('');
    }, [route?.params?.categoryName, route?.params?.brandName, route?.params?._ts, categories])
  );

  const load = useCallback(async () => {
    try {
      if (!hasWooCredentials()) {
        setProducts([]);
        setCategories([]);
        setStatus('missing');
        return;
      }
      const [cats, data] = await Promise.all([
        fetchCategories(),
        fetchAllProducts({ perPage: 50, maxPages: 10 }),
      ]);
      setCategories(cats);
      setProducts(data);
      setStatus('ready');
    } catch (error) {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (status === 'loading') {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.buttonBg} />
        <Text style={styles.centerText}>Cargando productos...</Text>
      </View>
    );
  }

  if (status === 'missing') {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>Conecta WooCommerce</Text>
        <Text style={styles.centerText}>
          Configura `EXPO_PUBLIC_WC_URL`, `EXPO_PUBLIC_WC_KEY` y
          `EXPO_PUBLIC_WC_SECRET` para ver tus productos.
        </Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>No se pudieron cargar productos</Text>
        <Text style={styles.centerText}>
          Revisa tus credenciales o la conexión a internet.
        </Text>
        <Pressable
          style={pressableStyle(styles.primaryButton)}
          onPress={() => {
            setStatus('loading');
            load();
          }}
        >
          <Text style={styles.primaryButtonText}>Reintentar</Text>
        </Pressable>
      </View>
    );
  }

  if (status === 'ready' && products.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>No hay productos disponibles</Text>
        <Text style={styles.centerText}>
          Publica productos en WooCommerce o revisa los permisos de la llave.
        </Text>
        <Pressable
          style={pressableStyle(styles.primaryButton)}
          onPress={() => {
            setStatus('loading');
            load();
          }}
        >
          <Text style={styles.primaryButtonText}>Actualizar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <FlatList
        contentContainerStyle={styles.list}
        data={searchQuery.trim().length >= 2 ? searchResults : searchedProducts}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        refreshing={isRefreshing}
        onRefresh={async () => {
          setIsRefreshing(true);
          await load();
          setIsRefreshing(false);
        }}
        ListHeaderComponent={
          <View style={styles.categoriesSection}>
            <Text style={styles.sectionTitle}>Categorías</Text>
            <View style={styles.searchBox}>
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Buscar productos..."
                placeholderTextColor={colors.textMuted}
                style={styles.searchInput}
                returnKeyType="search"
              />
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterRow}
            >
              <Pressable
                style={({ pressed }) => [
                  styles.filterChip,
                  selectedCategoryId === 'all' && styles.filterChipActive,
                  pressed && styles.pressed,
                ]}
                onPress={() => setSelectedCategoryId('all')}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    selectedCategoryId === 'all' && styles.filterChipTextActive,
                  ]}
                >
                  Todo
                </Text>
              </Pressable>
              {categories.map((category) => (
                <Pressable
                  key={category.id}
                  style={({ pressed }) => [
                    styles.filterChip,
                    selectedCategoryId === category.id && styles.filterChipActive,
                    pressed && styles.pressed,
                  ]}
                  onPress={() =>
                    setSelectedCategoryId(
                      selectedCategoryId === category.id ? 'all' : category.id
                    )
                  }
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      selectedCategoryId === category.id &&
                        styles.filterChipTextActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Text style={styles.sectionTitle}>Productos</Text>
          </View>
        }
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => {
          const image =
            item.images && item.images.length > 0
              ? item.images[0].src
              : item.image && item.image !== 'null'
                ? item.image
                : null;
          return (
            <View style={styles.card}>
              {image ? (
                <Image source={{ uri: image }} style={styles.image} />
              ) : (
                <View style={styles.imagePlaceholder}>
                  <Text style={styles.imageText}>Sin imagen</Text>
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.title}>{item.name}</Text>
                <Text style={styles.price}>{formatCop(item.price)}</Text>
                {item.sku ? <Text style={styles.sku}>SKU: {item.sku}</Text> : null}
                <Text style={styles.stock}>
                  {item.stock_status === 'instock'
                    ? 'Stock disponible'
                    : item.stock_status === 'outofstock'
                      ? 'Sin stock'
                      : item.stock_status === 'onbackorder'
                        ? 'Bajo pedido'
                        : 'Stock no informado'}
                  {typeof item.stock_quantity === 'number'
                    ? ` (${item.stock_quantity})`
                    : ''}
                </Text>
                {item?.link ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => {
                      if (item.link) {
                        Linking.openURL(item.link);
                      }
                    }}
                  >
                    <Text style={styles.secondaryButtonText}>Ver en web</Text>
                  </Pressable>
                ) : (
                  <Pressable
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.primaryButtonPressed,
                    ]}
                    onPress={() => {
                      addItem(item);
                      setAddedId(item.id);
                      setTimeout(() => setAddedId(null), 900);
                    }}
                  >
                    <Text style={styles.primaryButtonText}>
                      {addedId === item.id ? 'Agregado ✓' : 'Agregar al carrito'}
                    </Text>
                  </Pressable>
                )}
              </View>
            </View>
          );
        }}
      />
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
    gap: spacing.lg,
  },
  productRow: {
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  categoriesSection: {
    gap: spacing.md,
  },
  searchBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: {
    color: colors.textMain,
    fontSize: 14,
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
    fontSize: 13,
  },
  filterRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filterChip: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  filterChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  filterChipText: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChipTextActive: {
    color: colors.buttonText,
  },
  sectionTitle: {
    color: colors.textMain,
    fontSize: 20,
    fontWeight: '600',
  },
  card: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: 18,
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: 180,
  },
  imagePlaceholder: {
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.card,
  },
  imageText: {
    color: colors.textMuted,
  },
  cardBody: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.textMain,
    fontSize: 16,
    fontWeight: '600',
  },
  price: {
    color: colors.textSoft,
    fontSize: 14,
  },
  stock: {
    color: colors.textMuted,
    fontSize: 12,
  },
  sku: {
    color: colors.textMuted,
    fontSize: 12,
  },
  primaryButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  primaryButtonPressed: {
    backgroundColor: colors.buttonPressed,
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: '700',
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
