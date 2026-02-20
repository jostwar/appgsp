import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  Modal,
  Animated,
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
  fetchCategories,
  fetchBrandOptions,
  fetchProducts,
  hasWooCredentials,
} from '../api/woocommerce';
import { useCart } from '../store/cart';
import { useFocusEffect } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

export default function ProductsScreen({ route, navigation }) {
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];
  const normalizeText = useCallback(
    (value) =>
      String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim(),
    []
  );
  const normalizeProduct = useCallback(
    (product) => {
      const name = product?.name || '';
      const sku = product?.sku || '';
      const categoriesList = Array.isArray(product?.categories)
        ? product.categories
        : [];
      const categoryIds = categoriesList.map((category) => category.id);
      const categoryNames = categoriesList
        .map((category) => normalizeText(category?.name))
        .filter(Boolean);
      return {
        ...product,
        _searchText: normalizeText(`${name} ${sku}`),
        _categoryIds: categoryIds,
        _categoryNames: categoryNames,
      };
    },
    [normalizeText]
  );
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [status, setStatus] = useState('loading');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [selectedCategoryName, setSelectedCategoryName] = useState(null);
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('idle');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [sortOption, setSortOption] = useState('recomendado');
  const [selectedBrand, setSelectedBrand] = useState('Todas');
  const [activeBrandName, setActiveBrandName] = useState(null);
  const [selectedPortfolio, setSelectedPortfolio] = useState('Todo');
  const [showCategoryMenu, setShowCategoryMenu] = useState(false);
  const [showBrandMenu, setShowBrandMenu] = useState(false);
  const [showPortfolioMenu, setShowPortfolioMenu] = useState(false);
  const [showFiltersDrawer, setShowFiltersDrawer] = useState(false);
  const [usePriceRange, setUsePriceRange] = useState(false);
  const [minPriceInput, setMinPriceInput] = useState('');
  const [maxPriceInput, setMaxPriceInput] = useState('');
  const [appliedMinPrice, setAppliedMinPrice] = useState(null);
  const [appliedMaxPrice, setAppliedMaxPrice] = useState(null);
  const [cartToast, setCartToast] = useState(null);
  const drawerAnim = useRef(new Animated.Value(0));
  const toastTimer = useRef(null);
  const [brandOptions, setBrandOptions] = useState([
    'Todas',
    'Samsung',
    'Hikvision',
    'ZKTeco',
    'Forza',
    'Seagate',
    'EZVIZ',
  ]);
  const { addItem } = useCart();
  const resetAppliedFilters = useCallback(() => {
    setUsePriceRange(false);
    setMinPriceInput('');
    setMaxPriceInput('');
    setAppliedMinPrice(null);
    setAppliedMaxPrice(null);
    setSortOption('recomendado');
  }, []);

  const clearAllFilters = useCallback((reload = false) => {
    setSelectedCategoryId('all');
    setSelectedCategoryName(null);
    setSelectedBrand('Todas');
    setActiveBrandName(null);
    setSearchResults([]);
    setSearchStatus('idle');
    resetAppliedFilters();
    updateSearch('', { immediate: true });
    setShowFiltersDrawer(false);
    setShowCategoryMenu(false);
    setShowBrandMenu(false);
    setShowPortfolioMenu(false);
    if (reload) load(null);
  }, [resetAppliedFilters, updateSearch, load]);
  const initialCategoryName = route?.params?.categoryName;
  const initialBrandName = route?.params?.brandName;
  const initialSearchQuery = route?.params?.searchQuery;
  const incomingTs = route?.params?._ts;
  const [addedId, setAddedId] = useState(null);
  const [pendingCategoryName, setPendingCategoryName] = useState(null);
  const updateSearch = useCallback(
    (value, { immediate } = {}) => {
      setSearchInput(value);
      if (immediate) {
        setDebouncedQuery(value);
      }
    },
    []
  );
  const navSearchRef = useRef(false);
  const drawerWidth = 320;

  useEffect(() => {
    Animated.timing(drawerAnim.current, {
      toValue: showFiltersDrawer ? 1 : 0,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [showFiltersDrawer]);

  useEffect(
    () => () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current);
      }
    },
    []
  );

  const showCartToast = (product) => {
    if (toastTimer.current) {
      clearTimeout(toastTimer.current);
    }
    setCartToast(product);
    toastTimer.current = setTimeout(() => {
      setCartToast(null);
    }, 2500);
  };

  const normalizeBrandOptions = useCallback((options) => {
    const unique = Array.from(new Set(options)).sort((a, b) =>
      String(a).localeCompare(String(b))
    );
    return ['Todas', ...unique];
  }, []);
  const portfolioOptions = useMemo(
    () => [
      'Todo',
      'Alarmas',
      'Cámaras',
      'Control de acceso',
      'Redes',
      'UPS',
      'Video Wall',
    ],
    []
  );

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

  const parsePriceInput = (value) => {
    const cleaned = String(value || '').replace(/[^\d]/g, '');
    const numeric = Number.parseInt(cleaned || '0', 10);
    return Number.isNaN(numeric) ? null : numeric;
  };

  const filteredProducts = useMemo(() => {
    const normalizedCategoryName = normalizeText(selectedCategoryName);
    if (selectedCategoryId === 'all' && !selectedCategoryName) {
      return products;
    }
    return products.filter((product) =>
      selectedCategoryId !== 'all'
        ? product._categoryIds?.includes(selectedCategoryId)
        : selectedCategoryName
          ? product._categoryNames?.includes(normalizedCategoryName)
          : true
    );
  }, [products, selectedCategoryId, selectedCategoryName, normalizeText]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchInput);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const query = String(debouncedQuery || '').trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchStatus('idle');
      return;
    }
    let cancelled = false;
    setSearchStatus('loading');
    fetchProducts({
      page: 1,
      perPage: 20,
      search: query,
      categoryId: selectedCategoryId !== 'all' ? selectedCategoryId : undefined,
      brandName: activeBrandName || undefined,
    })
      .then((data) => {
        if (!cancelled) {
          setSearchResults((data || []).map(normalizeProduct));
          setSearchStatus('ready');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSearchResults([]);
          setSearchStatus('ready');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, selectedCategoryId, activeBrandName, normalizeProduct]);

  const searchedProducts = useMemo(() => {
    const query = normalizeText(debouncedQuery);
    if (!query || query.length < 2) return filteredProducts;
    if (searchStatus === 'ready' && searchResults.length >= 0) {
      let list = searchResults;
      if (selectedCategoryId !== 'all' || selectedCategoryName) {
        const normalizedCategoryName = normalizeText(selectedCategoryName);
        list = list.filter((p) =>
          selectedCategoryId !== 'all'
            ? p._categoryIds?.includes(selectedCategoryId)
            : p._categoryNames?.includes(normalizedCategoryName)
        );
      }
      if (activeBrandName) {
        const targetBrand = normalizeText(activeBrandName);
        list = list.filter((p) => {
          const brand = getBrandLabel(p);
          return brand && normalizeText(brand) === targetBrand;
        });
      }
      return list;
    }
    return filteredProducts.filter((product) =>
      product._searchText?.includes(query)
    );
  }, [
    filteredProducts,
    debouncedQuery,
    normalizeText,
    searchStatus,
    searchResults,
    selectedCategoryId,
    selectedCategoryName,
    activeBrandName,
  ]);

  const displayedProducts = useMemo(() => {
    let list = searchedProducts;
    if (usePriceRange && (appliedMinPrice || appliedMaxPrice)) {
      list = list.filter((product) => {
        const price = Number.parseFloat(product?.price || '0');
        if (Number.isNaN(price)) return false;
        if (appliedMinPrice !== null && price < appliedMinPrice) return false;
        if (appliedMaxPrice !== null && price > appliedMaxPrice) return false;
        return true;
      });
    }
    const sorted = [...list];
    const prioritizeGspCare = (items) => {
      const index = items.findIndex(
        (item) => String(item?.sku || '').toUpperCase() === 'GSPCARE'
      );
      if (index <= 0) return items;
      const [match] = items.splice(index, 1);
      items.unshift(match);
      return items;
    };
    if (sortOption === 'price-asc') {
      sorted.sort((a, b) => Number(a.price || 0) - Number(b.price || 0));
    }
    if (sortOption === 'price-desc') {
      sorted.sort((a, b) => Number(b.price || 0) - Number(a.price || 0));
    }
    if (sortOption === 'name-asc') {
      sorted.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    }
    return prioritizeGspCare(sorted);
  }, [searchedProducts, sortOption, usePriceRange, appliedMinPrice, appliedMaxPrice]);

  const categoryLabel = useMemo(() => {
    if (selectedCategoryId === 'all' && !selectedCategoryName) return 'Todas';
    if (selectedCategoryName) return selectedCategoryName;
    const match = categories.find((category) => category.id === selectedCategoryId);
    return match?.name || 'Todas';
  }, [categories, selectedCategoryId, selectedCategoryName]);

  useEffect(() => {
    if (!initialCategoryName) {
      setPendingCategoryName(null);
      return;
    }
    setPendingCategoryName(initialCategoryName);
  }, [initialCategoryName, incomingTs]);

  useEffect(() => {
    updateSearch('', { immediate: true });
  }, [initialCategoryName, updateSearch]);

  useEffect(() => {
    if (!initialBrandName) return;
    setSelectedCategoryId('all');
    setSelectedCategoryName(null);
    setSelectedBrand(initialBrandName);
    setActiveBrandName(initialBrandName);
    resetAppliedFilters();
    updateSearch('', { immediate: true });
  }, [initialBrandName, updateSearch, resetAppliedFilters]);

  useEffect(() => {
    if (!initialSearchQuery) return;
    setSelectedCategoryId('all');
    setSelectedCategoryName(null);
    resetAppliedFilters();
    updateSearch(initialSearchQuery, { immediate: true });
    navigation?.setParams?.({ searchQuery: null });
    navSearchRef.current = true;
  }, [initialSearchQuery, updateSearch, resetAppliedFilters, navigation]);

  useEffect(() => {
    if (!pendingCategoryName || categories.length === 0) return;
    const target = normalizeText(pendingCategoryName);
    const match = categories.find(
      (category) => normalizeText(category.name || '') === target
    );
    if (match) {
      setSelectedCategoryId(match.id);
      setSelectedCategoryName(null);
    } else {
      setSelectedCategoryId('all');
      setSelectedCategoryName(pendingCategoryName);
    }
    resetAppliedFilters();
    setPendingCategoryName(null);
  }, [categories, pendingCategoryName, resetAppliedFilters]);

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
        resetAppliedFilters();
        updateSearch(targetSearch, { immediate: true });
        return;
      }
      if (navSearchRef.current && !targetCategory && !targetBrand) {
        updateSearch('', { immediate: true });
        navSearchRef.current = false;
      }
      if (targetBrand) {
        setSelectedCategoryId('all');
        setSelectedCategoryName(null);
        setSelectedBrand(targetBrand);
        setActiveBrandName(targetBrand);
        resetAppliedFilters();
        updateSearch('', { immediate: true });
        return;
      }
      if (!targetCategory) {
        setSelectedCategoryId('all');
        setSelectedCategoryName(null);
        resetAppliedFilters();
        updateSearch('', { immediate: true });
        return;
      }
      const target = normalizeText(targetCategory);
      const match = categories.find(
        (category) => normalizeText(category.name || '') === target
      );
      if (match) {
        setSelectedCategoryId(match.id);
        setSelectedCategoryName(null);
      } else {
        setSelectedCategoryId('all');
        setSelectedCategoryName(targetCategory);
      }
      resetAppliedFilters();
      updateSearch('', { immediate: true });
    }, [
      route?.params?.categoryName,
      route?.params?.brandName,
      route?.params?._ts,
      categories,
      updateSearch,
      resetAppliedFilters,
    ])
  );
  useFocusEffect(
    useCallback(() => {
      return () => {
        if (navSearchRef.current) {
          updateSearch('', { immediate: true });
          navSearchRef.current = false;
        }
        navigation?.setParams?.({ categoryName: null, brandName: null, searchQuery: null, _ts: null });
        clearAllFilters();
      };
    }, [updateSearch, navigation, clearAllFilters])
  );

  const load = useCallback(
    async (brandNameOverride = null) => {
      const brandName = brandNameOverride ?? activeBrandName;
      try {
        if (!hasWooCredentials()) {
          setProducts([]);
          setCategories([]);
          setStatus('missing');
          return;
        }
        const categoriesPromise = fetchCategories();
        const productsPromise = fetchProducts({
          page: 1,
          perPage: 20,
          brandName,
        });
        const brandsPromise = fetchBrandOptions().catch(() => []);
        const [cats, data, brands] = await Promise.all([
          categoriesPromise,
          productsPromise,
          brandsPromise,
        ]);
        setCategories(cats);
        setProducts(data.map(normalizeProduct));
        if (Array.isArray(brands) && brands.length > 0) {
          setBrandOptions(normalizeBrandOptions(brands));
        }
        setPage(1);
        setHasMore(data.length === 20);
        setStatus('ready');
      } catch (error) {
        setStatus('error');
      }
    },
    [activeBrandName, normalizeBrandOptions, normalizeProduct]
  );

  const loadMore = useCallback(async () => {
    if (status !== 'ready' || isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const nextPage = page + 1;
      const data = await fetchProducts({
        page: nextPage,
        perPage: 20,
        brandName: activeBrandName,
      });
      setProducts((prev) => [...prev, ...data.map(normalizeProduct)]);
      setPage(nextPage);
      setHasMore(data.length === 20);
    } catch (_error) {
      // ignore for now
    } finally {
      setIsLoadingMore(false);
    }
  }, [status, isLoadingMore, hasMore, page, activeBrandName, normalizeProduct]);

  useEffect(() => {
    setStatus('loading');
    load(activeBrandName);
  }, [load, activeBrandName]);

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
        <Text style={styles.centerTitle}>No hay productos disponibles</Text>
        <Text style={styles.centerText}>
          El catálogo no está disponible en este momento. Intenta más tarde.
        </Text>
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.center}>
        <Text style={styles.centerTitle}>No se pudieron cargar productos</Text>
        <Text style={styles.centerText}>
          Revisa tu conexión a internet e intenta de nuevo.
        </Text>
        <Pressable
          style={pressableStyle(styles.primaryButton)}
          onPress={() => {
            setStatus('loading');
            load(activeBrandName);
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
          No encontramos productos con los filtros actuales. Prueba cambiando la categoría o la búsqueda, o intenta más tarde.
        </Text>
        <Pressable
          style={pressableStyle(styles.primaryButton)}
          onPress={() => {
            setStatus('loading');
            load(activeBrandName);
          }}
        >
          <Text style={styles.primaryButtonText}>Actualizar</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <Modal transparent visible={showFiltersDrawer} animationType="none">
        <View style={styles.drawerContainer}>
          <Pressable
            style={[styles.drawerOverlay, { right: drawerWidth }]}
            onPress={() => setShowFiltersDrawer(false)}
          />
          <Animated.View
            style={[
              styles.filterDrawer,
              {
                width: drawerWidth,
                transform: [
                  {
                    translateX: drawerAnim.current.interpolate({
                      inputRange: [0, 1],
                      outputRange: [drawerWidth, 0],
                    }),
                  },
                ],
              },
            ]}
          >
            <View
              style={[
                styles.drawerHeader,
                { paddingTop: Math.max(insets.top, spacing.sm) },
              ]}
            >
              <Text style={styles.drawerTitle}>Filtros</Text>
              <Pressable
                style={styles.drawerClose}
                onPress={() => setShowFiltersDrawer(false)}
                hitSlop={10}
              >
                <Ionicons name="close" size={18} color={colors.textMain} />
              </Pressable>
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.primaryButton,
                { marginHorizontal: spacing.md, marginBottom: spacing.sm },
                pressed && styles.pressed,
              ]}
              onPress={() => {
                clearAllFilters(true);
              }}
            >
              <Text style={styles.primaryButtonText}>Limpiar filtros</Text>
            </Pressable>
            <ScrollView
              contentContainerStyle={styles.drawerContent}
              keyboardShouldPersistTaps="handled"
            >
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Seleccionar rango de precios</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.rangeToggle,
                    pressed && styles.pressed,
                  ]}
                  onPress={() => setUsePriceRange((prev) => !prev)}
                >
                  <Ionicons
                    name={usePriceRange ? 'radio-button-on' : 'radio-button-off'}
                    size={20}
                    color={usePriceRange ? colors.primary : colors.textMuted}
                  />
                  <Text style={styles.rangeToggleText}>
                    {usePriceRange ? 'Rango activo' : 'Rango desactivado'}
                  </Text>
                </Pressable>
                {usePriceRange ? (
                  <View style={styles.rangeCard}>
                    <View style={styles.rangeInputs}>
                      <TextInput
                        value={minPriceInput}
                        onChangeText={setMinPriceInput}
                        placeholder="Min"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        style={styles.rangeInput}
                      />
                      <Text style={styles.rangeSeparator}>—</Text>
                      <TextInput
                        value={maxPriceInput}
                        onChangeText={setMaxPriceInput}
                        placeholder="Max"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="numeric"
                        style={styles.rangeInput}
                      />
                    </View>
                    <Text style={styles.rangeValue}>
                      {formatCop(parsePriceInput(minPriceInput) || 0)} ·{' '}
                      {formatCop(parsePriceInput(maxPriceInput) || 0)}
                    </Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Filtrar por</Text>
                <View style={styles.dropdownGroup}>
                  <View style={styles.dropdownField}>
                    <Text style={styles.dropdownLabel}>Categoría</Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.dropdownButton,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => {
                        setShowCategoryMenu((prev) => !prev);
                        setShowBrandMenu(false);
                        setShowPortfolioMenu(false);
                      }}
                    >
                      <Text style={styles.dropdownText}>{categoryLabel}</Text>
                      <Ionicons
                        name={showCategoryMenu ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.textMuted}
                      />
                    </Pressable>
                    {showCategoryMenu ? (
                      <ScrollView
                        style={styles.dropdownMenu}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        <Pressable
                          style={({ pressed }) => [
                            styles.dropdownItem,
                            pressed && styles.pressed,
                          ]}
                          onPress={() => {
                            setSelectedCategoryId('all');
                            setSelectedCategoryName(null);
                            resetAppliedFilters();
                            setShowCategoryMenu(false);
                          }}
                        >
                          <Text style={styles.dropdownItemText}>Todas</Text>
                        </Pressable>
                        {categories.map((category) => (
                          <Pressable
                            key={category.id}
                            style={({ pressed }) => [
                              styles.dropdownItem,
                              pressed && styles.pressed,
                            ]}
                            onPress={() => {
                              setSelectedCategoryId(category.id);
                              setSelectedCategoryName(null);
                              resetAppliedFilters();
                              setShowCategoryMenu(false);
                            }}
                          >
                            <Text style={styles.dropdownItemText}>
                              {category.name}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                  <View style={styles.dropdownField}>
                    <Text style={styles.dropdownLabel}>Marca</Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.dropdownButton,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => {
                        setShowBrandMenu((prev) => !prev);
                        setShowCategoryMenu(false);
                        setShowPortfolioMenu(false);
                      }}
                    >
                      <Text style={styles.dropdownText}>{selectedBrand}</Text>
                      <Ionicons
                        name={showBrandMenu ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.textMuted}
                      />
                    </Pressable>
                    {showBrandMenu ? (
                      <ScrollView
                        style={styles.dropdownMenu}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        {brandOptions.map((option) => (
                          <Pressable
                            key={option}
                            style={({ pressed }) => [
                              styles.dropdownItem,
                              pressed && styles.pressed,
                            ]}
                            onPress={() => {
                              setSelectedBrand(option);
                              setShowBrandMenu(false);
                              setSelectedCategoryId('all');
                              setSelectedCategoryName(null);
                              setActiveBrandName(option === 'Todas' ? null : option);
                              resetAppliedFilters();
                              updateSearch('', { immediate: true });
                            }}
                          >
                            <Text style={styles.dropdownItemText}>{option}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                  <View style={styles.dropdownField}>
                    <Text style={styles.dropdownLabel}>Portafolio</Text>
                    <Pressable
                      style={({ pressed }) => [
                        styles.dropdownButton,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => {
                        setShowPortfolioMenu((prev) => !prev);
                        setShowCategoryMenu(false);
                        setShowBrandMenu(false);
                      }}
                    >
                      <Text style={styles.dropdownText}>{selectedPortfolio}</Text>
                      <Ionicons
                        name={showPortfolioMenu ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color={colors.textMuted}
                      />
                    </Pressable>
                    {showPortfolioMenu ? (
                      <ScrollView
                        style={styles.dropdownMenu}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        {portfolioOptions.map((option) => (
                          <Pressable
                            key={option}
                            style={({ pressed }) => [
                              styles.dropdownItem,
                              pressed && styles.pressed,
                            ]}
                            onPress={() => {
                              setSelectedPortfolio(option);
                              setShowPortfolioMenu(false);
                              updateSearch('', { immediate: true });
                              if (option === 'Todo') {
                                setSelectedCategoryId('all');
                                setSelectedCategoryName(null);
                              } else {
                                setSelectedCategoryId('all');
                                setSelectedCategoryName(option);
                              }
                              resetAppliedFilters();
                            }}
                          >
                            <Text style={styles.dropdownItemText}>{option}</Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : null}
                  </View>
                </View>
              </View>
              <View style={styles.filterGroup}>
                <Text style={styles.filterLabel}>Ordenar por</Text>
                <View style={styles.filterChips}>
                  {[
                    { id: 'recomendado', label: 'Recomendado' },
                    { id: 'price-asc', label: 'Precio ↑' },
                    { id: 'price-desc', label: 'Precio ↓' },
                    { id: 'name-asc', label: 'A-Z' },
                  ].map((option) => (
                    <Pressable
                      key={option.id}
                      style={({ pressed }) => [
                        styles.filterChip,
                        sortOption === option.id && styles.filterChipActive,
                        pressed && styles.pressed,
                      ]}
                      onPress={() => setSortOption(option.id)}
                    >
                      <Text
                        style={[
                          styles.filterChipText,
                          sortOption === option.id && styles.filterChipTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.resultsButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => {
                  if (usePriceRange) {
                    const minValue = parsePriceInput(minPriceInput);
                    const maxValue = parsePriceInput(maxPriceInput);
                    setAppliedMinPrice(minValue || null);
                    setAppliedMaxPrice(maxValue || null);
                  } else {
                    setAppliedMinPrice(null);
                    setAppliedMaxPrice(null);
                  }
                  setShowFiltersDrawer(false);
                }}
              >
                <Text style={styles.resultsButtonText}>Ver resultados</Text>
              </Pressable>
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
      <FlatList
        contentContainerStyle={[
          styles.list,
          { paddingBottom: spacing.xxl + tabBarHeight },
        ]}
        data={displayedProducts}
        numColumns={2}
        columnWrapperStyle={styles.productRow}
        removeClippedSubviews
        initialNumToRender={12}
        maxToRenderPerBatch={12}
        windowSize={7}
        updateCellsBatchingPeriod={50}
        refreshing={isRefreshing}
        onRefresh={async () => {
          setIsRefreshing(true);
          await load(activeBrandName);
          setIsRefreshing(false);
        }}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        ListHeaderComponent={
          <View style={styles.categoriesSection}>
            <Text style={styles.sectionTitle}>Productos</Text>
            <View style={styles.searchRow}>
              <View style={styles.searchBox}>
                <TextInput
                  value={searchInput}
                  onChangeText={updateSearch}
                  placeholder="Buscar productos..."
                  placeholderTextColor={colors.textMuted}
                  style={styles.searchInput}
                  returnKeyType="search"
                />
              </View>
              <Pressable
                style={({ pressed }) => [
                  styles.filterButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => setShowFiltersDrawer(true)}
              >
                <Ionicons name="options-outline" size={18} color={colors.textMain} />
              </Pressable>
            </View>
            <Text style={styles.sectionTitle}>Productos</Text>
          </View>
        }
        keyExtractor={(item) => String(item.id)}
        ListEmptyComponent={
          displayedProducts.length === 0 ? (
            <View style={[styles.center, { paddingVertical: spacing.xxl }]}>
              {searchStatus === 'loading' && String(debouncedQuery || '').trim().length >= 2 ? (
                <>
                  <ActivityIndicator size="large" color={colors.primary} />
                  <Text style={[styles.centerText, { marginTop: spacing.sm }]}>Buscando...</Text>
                </>
              ) : searchStatus === 'ready' && String(debouncedQuery || '').trim().length >= 2 ? (
                <>
                  <Text style={styles.centerTitle}>Sin resultados</Text>
                  <Text style={styles.centerText}>
                    No hay resultados para "{String(debouncedQuery).trim()}".
                  </Text>
                </>
              ) : (
                <>
                  <Text style={styles.centerTitle}>No hay productos</Text>
                  <Text style={styles.centerText}>
                    No hay productos con los filtros actuales. Prueba cambiando la búsqueda o los filtros.
                  </Text>
                </>
              )}
            </View>
          ) : null
        }
        renderItem={({ item }) => {
          const image = item.images?.[0]?.src || item.image || null;
          const productUrl = item.permalink || item.link;
          const isVariable = item.type === 'variable';
          const isExternal = item.type === 'external';
          const brandLabel = getBrandLabel(item);
          const openProduct = () => {
            if (productUrl) {
              navigation.navigate('Checkout', { url: productUrl, forceLogin: true });
            }
          };
          return (
            <View style={styles.card}>
              <Pressable
                style={({ pressed }) => [pressed && styles.pressed]}
                onPress={openProduct}
                disabled={!productUrl}
              >
                {image ? (
                  <Image source={{ uri: image }} style={styles.image} />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <Text style={styles.imageText}>Sin imagen</Text>
                  </View>
                )}
              </Pressable>
              <View style={styles.cardBody}>
                {brandLabel ? (
                  <Text style={styles.brand} numberOfLines={1} ellipsizeMode="tail">
                    {brandLabel}
                  </Text>
                ) : null}
                <Pressable
                  style={({ pressed }) => [pressed && styles.pressed]}
                  onPress={openProduct}
                  disabled={!productUrl}
                >
                  <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                    {item.name}
                  </Text>
                </Pressable>
                <Text style={styles.price}>{formatCop(item.price)}</Text>
                {item.sku ? <Text style={styles.sku}>{item.sku}</Text> : null}
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
                {isVariable && productUrl ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.pressed,
                    ]}
                    onPress={() =>
                      navigation.navigate('Checkout', {
                        url: productUrl,
                        forceLogin: true,
                      })
                    }
                  >
                    <Text style={styles.secondaryButtonText}>Ver opciones</Text>
                  </Pressable>
                ) : isExternal && productUrl ? (
                  <Pressable
                    style={({ pressed }) => [
                      styles.secondaryButton,
                      pressed && styles.pressed,
                    ]}
                    onPress={() => {
                      Linking.openURL(productUrl);
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
                      showCartToast(item);
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
        ListFooterComponent={
          isLoadingMore ? (
            <View style={styles.listFooter}>
              <ActivityIndicator color={colors.buttonBg} />
              <Text style={styles.footerText}>Cargando más productos...</Text>
            </View>
          ) : null
        }
      />
      {cartToast ? (
        <View style={styles.toastWrapper}>
          <View style={styles.toastCard}>
            <View style={styles.toastHeader}>
              <Text style={styles.toastTitle}>Agregaste a tu carrito</Text>
              <Pressable
                style={({ pressed }) => [pressed && styles.pressed]}
                onPress={() => setCartToast(null)}
              >
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.toastBody} numberOfLines={2} ellipsizeMode="tail">
              {cartToast.name}
            </Text>
            <Pressable
              style={({ pressed }) => [
                styles.toastButton,
                pressed && styles.pressed,
              ]}
              onPress={() => {
                setCartToast(null);
                navigation.navigate('Carrito');
              }}
            >
              <Text style={styles.toastButtonText}>Ver en el carrito</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
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
  drawerContainer: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  drawerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(3, 7, 18, 0.6)',
    zIndex: 1,
  },
  filterDrawer: {
    backgroundColor: colors.background,
    padding: spacing.lg,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    height: '100%',
    zIndex: 2,
  },
  drawerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  drawerTitle: {
    color: colors.textMain,
    fontSize: 18,
    fontWeight: '600',
  },
  drawerClose: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  drawerContent: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  listFooter: {
    marginTop: spacing.lg,
    alignItems: 'center',
    gap: spacing.xs,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  productRow: {
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  categoriesSection: {
    gap: spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchBox: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
    flex: 1,
  },
  filterButton: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  rangeToggleText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  rangeCard: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  rangeInputs: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rangeInput: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: colors.textMain,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rangeSeparator: {
    color: colors.textMuted,
    fontSize: 14,
  },
  rangeValue: {
    color: colors.textSoft,
    fontSize: 12,
  },
  resultsButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.buttonBg,
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  resultsButtonText: {
    color: colors.buttonText,
    fontWeight: '700',
    fontSize: 14,
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
  filtersSection: {
    gap: spacing.sm,
  },
  filterGroup: {
    gap: spacing.xs,
  },
  dropdownGroup: {
    gap: spacing.md,
  },
  dropdownField: {
    gap: spacing.xs,
  },
  dropdownLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  dropdownButton: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  dropdownText: {
    color: colors.textMain,
    fontSize: 13,
    fontWeight: '600',
  },
  dropdownMenu: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
    maxHeight: 220,
  },
  dropdownItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dropdownItemText: {
    color: colors.textMain,
    fontSize: 13,
  },
  filterLabel: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  filterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
    lineHeight: 20,
    minHeight: 40,
  },
  brand: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
  },
  price: {
    color: colors.textMain,
    fontSize: 16,
    fontWeight: '700',
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
  toastWrapper: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: 90,
  },
  toastCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.sm,
  },
  toastHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toastTitle: {
    color: colors.textMain,
    fontWeight: '700',
    fontSize: 14,
  },
  toastBody: {
    color: colors.textMuted,
    fontSize: 12,
  },
  toastButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  toastButtonText: {
    color: colors.buttonText,
    fontWeight: '700',
    fontSize: 13,
  },
});
