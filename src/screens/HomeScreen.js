import { useCallback, useMemo, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  ImageBackground,
  Pressable,
  Alert,
  Modal,
  Linking,
  TextInput,
  Platform,
  useWindowDimensions,
  RefreshControl,
} from 'react-native';
import { colors, spacing } from '../theme';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import { searchProducts } from '../api/woocommerce';
import { getHomeOffers, getWeeklyProduct, registerPushToken } from '../api/backend';
import { useAuth } from '../store/auth';
import { registerForPushNotificationsAsync } from '../utils/notifications';

export default function HomeScreen() {
  const navigation = useNavigation();
  const tabBarHeight = useBottomTabBarHeight();
  const { user } = useAuth();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];
  const loadNotifications = useCallback(async () => {
    setNotificationsLoading(true);
    try {
      const raw = await AsyncStorage.getItem('gsp_notifications');
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      setNotifications(list);
      setUnreadCount(list.filter((item) => !item?.read).length);
    } catch (_error) {
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setNotificationsLoading(false);
    }
  }, []);
  const markAllNotificationsRead = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem('gsp_notifications');
      const parsed = raw ? JSON.parse(raw) : [];
      const list = Array.isArray(parsed) ? parsed : [];
      const next = list.map((item) => ({ ...item, read: true }));
      await AsyncStorage.setItem('gsp_notifications', JSON.stringify(next));
      setNotifications(next);
      setUnreadCount(0);
    } catch (_error) {
      // ignore
    }
  }, []);
  const handleNotificationsPress = useCallback(async () => {
    try {
      const token = await registerForPushNotificationsAsync();
      if (!token) {
        Alert.alert(
          'Notificaciones',
          'Activa las notificaciones en Ajustes para recibir alertas.',
          Linking.openSettings
            ? [{ text: 'Ir a Ajustes', onPress: () => Linking.openSettings() }, { text: 'OK' }]
            : [{ text: 'OK' }]
        );
      } else {
        await registerPushToken({
          token,
          cedula: user?.cedula,
          email: user?.email,
          platform: Platform.OS,
        });
      }
      await loadNotifications();
      await markAllNotificationsRead();
      setNotificationsOpen(true);
    } catch (_error) {
      Alert.alert('Notificaciones', 'No se pudieron activar las notificaciones.');
    }
  }, [loadNotifications, markAllNotificationsRead, user?.cedula, user?.email]);
  const handleNotificationsClose = useCallback(() => {
    setNotificationsOpen(false);
  }, []);
  const handleClearNotifications = useCallback(async () => {
    try {
      await AsyncStorage.removeItem('gsp_notifications');
      setNotifications([]);
      setUnreadCount(0);
    } catch (_error) {
      // ignore
    }
  }, []);

  useEffect(() => {
    const subscription = Notifications.addNotificationReceivedListener(() => {
      loadNotifications();
    });
    return () => subscription.remove();
  }, [loadNotifications]);
  const services = useMemo(
    () => [
      'Cotizaciones y pedidos en minutos',
      'Soporte 24/7 por WhatsApp',
      'Acceso directo a portafolio',
    ],
    []
  );

  const portfolio = useMemo(
    () => [
      {
        id: 'alarmas',
        title: 'Alarmas',
        image:
          'https://gsp.com.co/wp-content/uploads/2024/02/SISTEMA-DE-ALARMAS-V2.png',
      },
      {
        id: 'camaras',
        title: 'Cámaras',
        image: 'https://gsp.com.co/wp-content/uploads/2024/02/CAMARAS-2.png',
      },
      {
        id: 'acceso',
        title: 'Control de acceso',
        image:
          'https://gsp.com.co/wp-content/uploads/2024/02/CONTROL-DE-ACCESO.png',
      },
      {
        id: 'redes',
        title: 'Redes',
        image:
          'https://gsp.com.co/wp-content/uploads/2024/02/SWICHES-Y-REDES-V2.png',
      },
      {
        id: 'ups',
        title: 'UPS',
        image:
          'https://gsp.com.co/wp-content/uploads/2024/02/PROTECCION-ELECTRICA-V2.png',
      },
      {
        id: 'video',
        title: 'Video Wall',
        image: 'https://gsp.com.co/wp-content/uploads/2024/02/VIDEO-WALL.png',
      },
    ],
    []
  );

  const portfolioRows = useMemo(() => {
    const splitIndex = Math.ceil(portfolio.length / 2);
    const firstRow = portfolio.slice(0, splitIndex);
    const secondRow = portfolio.slice(splitIndex);
    return [firstRow, secondRow];
  }, [portfolio]);

  const loopedRows = useMemo(
    () => portfolioRows.map((row) => [...row, ...row]),
    [portfolioRows]
  );

  const portfolioScrollRef = useRef(null);
  const portfolioScrollX = useRef(0);
  const portfolioContentWidth = useRef(0);
  const brandsScrollRef = useRef(null);
  const brandsScrollX = useRef(0);
  const brandsContentWidth = useRef(0);

  useEffect(() => {
    const step = 196;
    const interval = setInterval(() => {
      if (!portfolioScrollRef.current || portfolioContentWidth.current === 0) {
        return;
      }
      const nextX = portfolioScrollX.current + step;
      const resetPoint = portfolioContentWidth.current / 2;
      portfolioScrollRef.current.scrollTo({ x: nextX, animated: true });
      portfolioScrollX.current = nextX;
      if (nextX >= resetPoint) {
        portfolioScrollRef.current.scrollTo({ x: 0, animated: false });
        portfolioScrollX.current = 0;
      }
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const step = 136;
    const interval = setInterval(() => {
      if (!brandsScrollRef.current || brandsContentWidth.current === 0) {
        return;
      }
      const nextX = brandsScrollX.current + step;
      const resetPoint = brandsContentWidth.current / 2;
      brandsScrollRef.current.scrollTo({ x: nextX, animated: true });
      brandsScrollX.current = nextX;
      if (nextX >= resetPoint) {
        brandsScrollRef.current.scrollTo({ x: 0, animated: false });
        brandsScrollX.current = 0;
      }
    }, 2800);

    return () => clearInterval(interval);
  }, []);

  const partnerLogos = useMemo(
    () => [
      {
        id: 'came',
        name: 'CAME',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-CAME.png',
      },
      {
        id: 'dsc',
        name: 'DSC',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-DSC.png',
      },
      {
        id: 'dsc-iq',
        name: 'DSC IQ',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-IQ.png',
      },
      {
        id: 'ezviz',
        name: 'Ezviz',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-EZVIZ.png',
      },
      {
        id: 'forza',
        name: 'Forza',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-FORZA.png',
      },
      {
        id: 'hilook',
        name: 'Hilook',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-HILOOK.png',
      },
      {
        id: 'hikvision',
        name: 'Hikvision',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-HIKVISION.png',
      },
      {
        id: 'horus',
        name: 'Horus',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-HORUS.png',
      },
      {
        id: 'nexxt',
        name: 'Nexxt',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-NEXXT.png',
      },
      {
        id: 'sandisk',
        name: 'Sandisk',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-SANDISK-scaled.png',
      },
      {
        id: 'samsung',
        name: 'Samsung',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-SAMSUNG.png',
      },
      {
        id: 'seagate',
        name: 'Seagate',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-SEAGATE.png',
      },
      {
        id: 'seco-larm',
        name: 'Seco-Larm',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-SECO-LARM-.png',
      },
      {
        id: 'tp-link',
        name: 'TP-Link',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-PTLINK.png',
      },
      {
        id: 'uhf-zkteco',
        name: 'UHF by ZKTeco',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-UHF.png',
      },
      {
        id: 'visonic',
        name: 'Visonic',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-VISONIC.png',
      },
      {
        id: 'western-digital',
        name: 'Western Digital',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-WESTERN-DIGITAL-scaled.png',
      },
      {
        id: 'zkteco',
        name: 'ZKTeco',
        uri: 'https://gsp.com.co/wp-content/uploads/2026/01/LOGO-ZKTECO.png',
      },
    ],
    []
  );

  const events = useMemo(
    () => [
      {
        id: 'camaras-ip',
        title: 'Configuración de cámaras IP serie 1',
        date: '21 ene 2026 · 9:00 am',
      },
      {
        id: 'samsung',
        title: 'Lanzamiento Samsung',
        date: '27 ene 2026 · 9:00 am',
      },
    ],
    []
  );

  const sliderImages = useMemo(
    () => [
      'https://gsp.com.co/wp-content/uploads/2026/01/SMART-HOME-scaled.jpg',
      'https://gsp.com.co/wp-content/uploads/2026/01/SWICHES-Y-REDES-1-scaled.png',
      'https://gsp.com.co/wp-content/uploads/2026/01/CABLEADO-ESTRUCTURADO-1-1-scaled.jpg',
      'https://gsp.com.co/wp-content/uploads/2026/01/CCTV-1-scaled.jpg',
      'https://gsp.com.co/wp-content/uploads/2026/01/SISTEMA-DE-ALARMA-DE-INTRUSION-2-1-scaled.png',
      'https://gsp.com.co/wp-content/uploads/2026/01/VIDEO-INTERCOM-1-scaled.jpg',
      'https://gsp.com.co/wp-content/uploads/2026/01/CAMARAS-DE-SEGURIDAD-1-scaled.png',
      'https://gsp.com.co/wp-content/uploads/2026/01/ACCESO-scaled.jpg',
    ],
    []
  );

  const categoryTabs = useMemo(
    () => ['Todo', 'Alarmas', 'Cámaras', 'Acceso', 'Redes', 'UPS', 'Video'],
    []
  );

  const quickActions = useMemo(
    () => [
      { id: 'ofertas', label: 'Ofertas', icon: 'pricetag' },
      { id: 'academia', label: 'Academy', icon: 'school' },
      { id: 'soporte', label: 'Soporte', icon: 'headset' },
    ],
    []
  );

  const handleSearch = (text) => {
    const query = text?.trim();
    if (!query) return;
    navigation.navigate('Buscar', { query });
  };

  const handleNavigate = (route, params) => {
    navigation.navigate(route, params);
  };

  const openUrl = async (url) => {
    try {
      await Linking.openURL(url);
    } catch (error) {
      // no-op
    }
  };

  const handleQuickAction = (id) => {
    if (id === 'ofertas') {
      handleNavigate('Productos', { categoryName: null });
      return;
    }
    if (id === 'academia') {
      openUrl('https://gsp.com.co/academy/');
      return;
    }
    if (id === 'cupones') {
      handleNavigate('Buscar', { query: 'cupones' });
      return;
    }
    if (id === 'soporte') {
      openUrl('https://wa.me/573176394742');
    }
  };

  const [locationLabel, setLocationLabel] = useState('Detectando ubicación...');
  const [locationError, setLocationError] = useState('');
  const sliderRef = useRef(null);
  const { width: windowWidth } = useWindowDimensions();
  const sliderIndex = useRef(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchStatus, setSearchStatus] = useState('idle');
  const searchDebounceRef = useRef(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [homeOffers, setHomeOffers] = useState([]);
  const [weeklyProduct, setWeeklyProduct] = useState(null);

  const loadLocation = useCallback(async () => {
    setLocationError('');
    setLocationLabel('Detectando ubicación...');
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setLocationError('Permiso de ubicación no concedido');
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const [address] = await Location.reverseGeocodeAsync(position.coords);
      if (address) {
        const label = [address.street, address.city].filter(Boolean).join(', ');
        setLocationLabel(label || 'Ubicación actual');
      }
    } catch (_error) {
      setLocationError('No se pudo obtener la ubicación');
    }
  }, []);

  useEffect(() => {
    loadLocation();
  }, [loadLocation]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (!sliderRef.current || windowWidth === 0) {
        return;
      }
      sliderIndex.current =
        (sliderIndex.current + 1) % sliderImages.length;
      sliderRef.current.scrollTo({
        x: windowWidth * sliderIndex.current,
        animated: true,
      });
      setActiveSlide(sliderIndex.current);
    }, 3500);

    return () => clearInterval(interval);
  }, [sliderImages.length]);

  useEffect(() => {
    let isMounted = true;
    const loadHomeData = async () => {
      try {
        const [offersData, weeklyData] = await Promise.all([
          getHomeOffers().catch(() => ({ offers: [] })),
          getWeeklyProduct().catch(() => ({ product: null })),
        ]);
        if (!isMounted) return;
        setHomeOffers(Array.isArray(offersData?.offers) ? offersData.offers : []);
        setWeeklyProduct(weeklyData?.product || null);
      } catch (_error) {
        if (!isMounted) return;
        setHomeOffers([]);
        setWeeklyProduct(null);
      }
    };
    loadHomeData();
    return () => {
      isMounted = false;
    };
  }, []);

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
        const list = await searchProducts(query, { perPage: 12 });
        setSearchResults(Array.isArray(list) ? list : []);
        setSearchStatus('ready');
      } catch (error) {
        setSearchResults([]);
        setSearchStatus('error');
      }
    }, 250);
    return () => clearTimeout(searchDebounceRef.current);
  }, [searchQuery]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadLocation();
    const query = searchQuery.trim();
    if (query.length >= 2) {
      setSearchStatus('loading');
      try {
        const list = await searchProducts(query, { perPage: 12 });
        setSearchResults(Array.isArray(list) ? list : []);
        setSearchStatus('ready');
      } catch (_error) {
        setSearchResults([]);
        setSearchStatus('error');
      }
    }
    setIsRefreshing(false);
  }, [loadLocation, searchQuery]);

  return (
    <View style={styles.screen}>
      <Modal
        visible={notificationsOpen}
        transparent
        animationType="slide"
        onRequestClose={handleNotificationsClose}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Notificaciones</Text>
              <Pressable style={styles.modalClose} onPress={handleNotificationsClose}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            {notificationsLoading ? (
              <Text style={styles.modalHint}>Cargando...</Text>
            ) : notifications.length === 0 ? (
              <Text style={styles.modalHint}>No hay notificaciones.</Text>
            ) : (
              <ScrollView style={styles.modalList}>
                {notifications.map((item) => (
                  <View
                    key={item.id}
                    style={[
                      styles.modalItem,
                      item?.read ? styles.modalItemRead : styles.modalItemUnread,
                    ]}
                  >
                    <Text style={styles.modalItemTitle}>{item.title || 'GSPRewards'}</Text>
                    {item.body ? (
                      <Text style={styles.modalItemBody}>{item.body}</Text>
                    ) : null}
                  </View>
                ))}
              </ScrollView>
            )}
            <Pressable
              style={({ pressed }) => [
                styles.modalClear,
                pressed && styles.pressed,
              ]}
              onPress={handleClearNotifications}
            >
              <Text style={styles.modalClearText}>Limpiar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingBottom: spacing.xxl + tabBarHeight },
        ]}
        keyboardShouldPersistTaps="always"
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={colors.primary}
          />
        }
      >
        <View style={styles.topBar}>
          <View style={styles.searchBox}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Buscar productos, marcas o categorías"
              placeholderTextColor={colors.textMuted}
              style={styles.searchInput}
              returnKeyType="search"
            />
          </View>
          <Pressable style={styles.iconButton} onPress={handleNotificationsPress}>
            <Ionicons name="notifications-outline" size={20} color={colors.textMain} />
            {unreadCount > 0 ? <View style={styles.iconBadge} /> : null}
          </Pressable>
        </View>

        {searchQuery.trim().length >= 2 ? (
          <View style={styles.searchResults}>
            <Text style={styles.sectionTitle}>Resultados</Text>
            {searchStatus === 'loading' ? (
              <Text style={styles.searchHint}>Buscando...</Text>
            ) : null}
            {searchStatus === 'ready' && searchResults.length === 0 ? (
              <Text style={styles.searchHint}>No hay resultados</Text>
            ) : null}
            {searchResults.map((item, index) => {
              const imageUrl =
                item?.image && item.image !== 'null' ? item.image : null;
              return (
              <Pressable
                key={`${item?.id || index}`}
                style={pressableStyle(styles.searchCard)}
                onPress={() =>
                  handleNavigate('Productos', {
                    searchQuery: item?.name || item?.title || searchQuery,
                    _ts: Date.now(),
                  })
                }
              >
                {imageUrl ? (
                  <Image source={{ uri: imageUrl }} style={styles.searchImage} />
                ) : (
                  <View style={styles.searchImageFallback}>
                    <Ionicons name="image-outline" size={18} color={colors.textMuted} />
                  </View>
                )}
                <View style={styles.searchInfo}>
                  <Text style={styles.searchTitle}>
                    {item?.name || item?.title || 'Resultado'}
                  </Text>
                  {item?.sku ? (
                    <Text style={styles.searchSku}>{item.sku}</Text>
                  ) : null}
                  {item?.price ? (
                    <Text style={styles.searchPrice}>{formatCop(item.price)}</Text>
                  ) : null}
                </View>
              </Pressable>
            );
            })}
          </View>
        ) : null}

        <View style={styles.locationWidget}>
          <View style={styles.locationRow}>
            <Ionicons name="location-outline" size={16} color={colors.primary} />
            <Text style={styles.locationTitle}>Tu ubicación</Text>
          </View>
          <Text style={styles.locationValue}>
            {locationError || locationLabel}
          </Text>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.categoriesTabs}
          keyboardShouldPersistTaps="handled"
        >
          {categoryTabs.map((item, index) => (
            <Pressable
              key={item}
              style={({ pressed }) => [
                styles.categoryTab,
                index === 0 && styles.categoryTabActive,
                pressed && styles.pressed,
              ]}
              onPress={() =>
                handleNavigate('Productos', {
                  categoryName: item === 'Todo' ? null : item,
                  _ts: Date.now(),
                })
              }
            >
              <Text
                style={[
                  styles.categoryTabText,
                  index === 0 && styles.categoryTabTextActive,
                ]}
              >
                {item}
              </Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={styles.sliderWrapper}>
          <ScrollView
            ref={sliderRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sliderContent}
            onMomentumScrollEnd={(event) => {
              const offsetX = event.nativeEvent.contentOffset.x;
              if (windowWidth) {
                sliderIndex.current = Math.round(offsetX / windowWidth);
                setActiveSlide(sliderIndex.current);
              }
            }}
          >
            {sliderImages.map((image, index) => (
              <View
                key={`${image}-${index}`}
                style={[styles.slide, { width: windowWidth }]}
              >
                <Image
                  source={{ uri: image }}
                  style={styles.slideImage}
                  resizeMode="cover"
                />
              </View>
            ))}
          </ScrollView>
          <View style={styles.sliderDots}>
            {sliderImages.map((_, index) => (
              <View
                key={`dot-${index}`}
                style={[
                  styles.sliderDot,
                  activeSlide === index && styles.sliderDotActive,
                ]}
              />
            ))}
          </View>
        </View>

        <View style={styles.quickActionsRow}>
          {quickActions.map((action) => (
            <Pressable
              key={action.id}
              style={pressableStyle(styles.quickCard)}
              onPress={() => handleQuickAction(action.id)}
            >
              <Ionicons name={action.icon} size={20} color={colors.primary} />
              <Text style={styles.quickText}>{action.label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>
            La vida o quizá el destino te ha traído hacia nosotros
          </Text>
          <Text style={styles.heroText}>
            En GSP somos mayoristas líderes en soluciones de seguridad
            electrónica. Accede a cotizaciones, pedidos y soporte desde la app.
          </Text>
          <View style={styles.heroActions}>
            <Pressable
              style={pressableStyle(styles.primaryButton)}
              onPress={() => handleNavigate('Recompensas')}
            >
              <Text style={styles.primaryButtonText}>Ver GSPRewards</Text>
            </Pressable>
            <Pressable
              style={pressableStyle(styles.secondaryButton)}
              onPress={() => handleNavigate('Portafolio')}
            >
              <Text style={styles.secondaryButtonText}>Explorar portafolio</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.gspCareCard}>
          <View style={styles.gspCareHeader}>
            <View style={styles.gspCareBadge}>
              <Text style={styles.gspCareBadgeText}>Nuevo</Text>
            </View>
            <Text style={styles.gspCareTitle}>GSP Care</Text>
          </View>
          <Text style={styles.gspCareText}>
            Protege tus compras con cobertura preferencial y soporte dedicado.
            Asegura tu inversión en segundos.
          </Text>
          <Pressable
            style={pressableStyle(styles.primaryButton)}
            onPress={() =>
              handleNavigate('Productos', { searchQuery: 'GSPCARE', _ts: Date.now() })
            }
          >
            <Text style={styles.primaryButtonText}>Ver GSP Care</Text>
          </Pressable>
        </View>

        {weeklyProduct ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Producto de la semana</Text>
            <View style={styles.featureCard}>
              {weeklyProduct.image ? (
                <Image
                  source={{ uri: weeklyProduct.image }}
                  style={styles.featureImage}
                  resizeMode="cover"
                />
              ) : null}
              <View style={styles.featureContent}>
                <Text style={styles.featureTitle}>{weeklyProduct.title}</Text>
                {weeklyProduct.subtitle ? (
                  <Text style={styles.featureSubtitle}>{weeklyProduct.subtitle}</Text>
                ) : null}
                {weeklyProduct.price ? (
                  <Text style={styles.featurePrice}>{weeklyProduct.price}</Text>
                ) : null}
                <Pressable
                  style={pressableStyle(styles.primaryButton)}
                  onPress={() =>
                    weeklyProduct.searchQuery
                      ? handleNavigate('Productos', {
                          searchQuery: weeklyProduct.searchQuery,
                          _ts: Date.now(),
                        })
                      : null
                  }
                >
                  <Text style={styles.primaryButtonText}>
                    {weeklyProduct.cta || 'Ver producto'}
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
        ) : null}

        {homeOffers.length ? (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Ofertas</Text>
            <View style={styles.offersGrid}>
              {homeOffers.map((offer) => (
                <View key={offer.id} style={styles.offerCard}>
                  {offer.image ? (
                    <Image
                      source={{ uri: offer.image }}
                      style={styles.offerImage}
                      resizeMode="cover"
                    />
                  ) : null}
                  <View style={styles.offerContent}>
                    <Text style={styles.offerTitle}>{offer.title}</Text>
                    {offer.subtitle ? (
                      <Text style={styles.offerSubtitle}>{offer.subtitle}</Text>
                    ) : null}
                    {offer.price ? (
                      <Text style={styles.offerPrice}>{offer.price}</Text>
                    ) : null}
                    <Pressable
                      style={pressableStyle(styles.secondaryButton)}
                      onPress={() =>
                        offer.searchQuery
                          ? handleNavigate('Productos', {
                              searchQuery: offer.searchQuery,
                              _ts: Date.now(),
                            })
                          : null
                      }
                    >
                      <Text style={styles.secondaryButtonText}>
                        {offer.cta || 'Ver oferta'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Portafolio</Text>
          <ScrollView
            horizontal
            ref={portfolioScrollRef}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.portfolioLoop}
            onContentSizeChange={(width) => {
              portfolioContentWidth.current = width;
            }}
          >
            <View style={styles.portfolioRow}>
            {loopedRows[0].map((item, index) => (
              <Pressable
                key={`${item.id}-row1-${index}`}
                style={pressableStyle(styles.portfolioCard)}
                onPress={() => handleNavigate('Portafolio')}
              >
                  <Image
                    source={{ uri: item.image }}
                    style={styles.portfolioImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.portfolioTitle}>{item.title}</Text>
              </Pressable>
              ))}
            </View>
            <View style={styles.portfolioRow}>
            {loopedRows[1].map((item, index) => (
              <Pressable
                key={`${item.id}-row2-${index}`}
                style={pressableStyle(styles.portfolioCard)}
                onPress={() => handleNavigate('Portafolio')}
              >
                  <Image
                    source={{ uri: item.image }}
                    style={styles.portfolioImage}
                    resizeMode="contain"
                  />
                  <Text style={styles.portfolioTitle}>{item.title}</Text>
              </Pressable>
              ))}
            </View>
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Nuestras marcas</Text>
          <ScrollView
            horizontal
            ref={brandsScrollRef}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.logoRow}
            onContentSizeChange={(width) => {
              brandsContentWidth.current = width;
            }}
          >
            {partnerLogos.map((item, index) => (
              <Pressable
                key={`${item.id}-loop-${index}`}
                style={pressableStyle(styles.logoCard)}
                onPress={() =>
                  handleNavigate('Productos', {
                    brandName: item.name,
                    _ts: Date.now(),
                  })
                }
              >
                <Image
                  source={{ uri: item.uri }}
                  style={styles.partnerLogo}
                  resizeMode="contain"
                />
              </Pressable>
            ))}
            {partnerLogos.map((item, index) => (
              <Pressable
                key={`${item.id}-loop2-${index}`}
                style={pressableStyle(styles.logoCard)}
                onPress={() =>
                  handleNavigate('Productos', {
                    brandName: item.name,
                    _ts: Date.now(),
                  })
                }
              >
                <Image
                  source={{ uri: item.uri }}
                  style={styles.partnerLogo}
                  resizeMode="contain"
                />
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Academy</Text>
          <View style={styles.eventsCard}>
            {events.map((event) => (
              <View key={event.id} style={styles.eventRow}>
                <View>
                  <Text style={styles.eventTitle}>{event.title}</Text>
                  <Text style={styles.eventDate}>{event.date}</Text>
                </View>
                <Text style={styles.eventTag}>Gratis</Text>
              </View>
            ))}
            <Pressable
              style={pressableStyle(styles.secondaryButton)}
              onPress={() => openUrl('https://gsp.com.co/academy/')}
            >
              <Text style={styles.secondaryButtonText}>Ver agenda</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Servicios destacados</Text>
          {services.map((item) => (
            <View key={item} style={styles.serviceRow}>
              <View style={styles.dot} />
              <Text style={styles.serviceText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beneficios extra</Text>
          <View style={styles.benefitsCard}>
            <View style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name="rocket-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.benefitInfo}>
                <Text style={styles.benefitTitle}>Entrega prioritaria</Text>
                <Text style={styles.benefitText}>
                  Recibe tus pedidos en menos tiempo.
                </Text>
              </View>
            </View>
            <View style={styles.benefitRow}>
              <View style={styles.benefitIcon}>
                <Ionicons name="headset-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.benefitInfo}>
                <Text style={styles.benefitTitle}>Soporte dedicado</Text>
                <Text style={styles.benefitText}>
                  Un asesor listo para ayudarte en cada compra.
                </Text>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contacto y soporte</Text>
          <View style={styles.contactCard}>
            <View style={styles.contactRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.contactButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => openUrl('https://wa.me/573103611116')}
              >
                <Text style={styles.secondaryButtonText}>LIA Comercial</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.secondaryButton,
                  styles.contactButton,
                  pressed && styles.pressed,
                ]}
                onPress={() => openUrl('https://wa.me/573176394742')}
              >
                <Text style={styles.secondaryButtonText}>Titán Soporte</Text>
              </Pressable>
            </View>
            <Pressable
              style={pressableStyle(styles.primaryButton)}
              onPress={() => openUrl('https://gsp.com.co/')}
            >
              <Text style={styles.primaryButtonText}>Ir a gsp.com.co</Text>
            </Pressable>
            <Pressable
              style={pressableStyle(styles.secondaryButton)}
              onPress={() => openUrl('http://vacantes.gsp.com.co')}
            >
              <Text style={styles.secondaryButtonText}>Trabaja con nosotros</Text>
            </Pressable>
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 16,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchPlaceholder: {
    color: colors.textMuted,
    fontSize: 14,
  },
  searchInput: {
    flex: 1,
    color: colors.textMain,
    fontSize: 14,
  },
  searchResults: {
    gap: spacing.sm,
  },
  searchHint: {
    color: colors.textMuted,
    fontSize: 12,
  },
  searchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchImage: {
    width: 48,
    height: 48,
    borderRadius: 8,
  },
  searchImageFallback: {
    width: 48,
    height: 48,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  searchTitle: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 13,
  },
  searchSku: {
    color: colors.textMuted,
    fontSize: 12,
  },
  searchPrice: {
    color: colors.textSoft,
    fontSize: 12,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#ef4444',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 10, 18, 0.65)',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  modalTitle: {
    color: colors.textMain,
    fontSize: 18,
    fontWeight: '600',
  },
  modalClose: {
    padding: 4,
  },
  modalHint: {
    color: colors.textMuted,
    fontSize: 13,
  },
  modalList: {
    maxHeight: 320,
  },
  modalItem: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  modalItemUnread: {
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modalItemRead: {
    opacity: 0.8,
  },
  modalItemTitle: {
    color: colors.textMain,
    fontSize: 14,
    fontWeight: '600',
  },
  modalItemBody: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  modalClear: {
    alignSelf: 'flex-end',
  },
  modalClearText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  locationWidget: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    gap: spacing.xs,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  locationTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '600',
  },
  locationValue: {
    color: colors.textMain,
    fontSize: 14,
    fontWeight: '600',
  },
  brand: {
    color: colors.textMain,
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    marginTop: 4,
    fontSize: 16,
    textAlign: 'center',
  },
  badge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 999,
  },
  badgeText: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 13,
  },
  categoriesTabs: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  categoryTab: {
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  categoryTabActive: {
    backgroundColor: colors.textMain,
  },
  categoryTabText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  categoryTabTextActive: {
    color: colors.surface,
  },
  sliderWrapper: {
    borderRadius: 20,
    overflow: 'hidden',
    height: 180,
  },
  sliderContent: {
    alignItems: 'center',
  },
  slide: {
    height: 180,
  },
  slideImage: {
    width: '100%',
    height: '100%',
  },
  sliderDots: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  sliderDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(240, 248, 255, 0.5)',
  },
  sliderDotActive: {
    backgroundColor: colors.buttonText,
    width: 10,
  },
  heroCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 20,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  heroTitle: {
    color: colors.textMain,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  },
  heroText: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
  },
  heroActions: {
    gap: spacing.sm,
  },
  gspCareCard: {
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderRadius: 20,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  gspCareHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  gspCareBadge: {
    backgroundColor: colors.accent,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  gspCareBadgeText: {
    color: colors.buttonText,
    fontWeight: '700',
    fontSize: 11,
  },
  gspCareTitle: {
    color: colors.textMain,
    fontSize: 20,
    fontWeight: '700',
  },
  gspCareText: {
    color: colors.textSoft,
    fontSize: 14,
    lineHeight: 20,
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
    fontSize: 13,
  },
  section: {
    gap: spacing.sm,
  },
  featureCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  featureImage: {
    width: '100%',
    height: 160,
  },
  featureContent: {
    padding: spacing.lg,
    gap: spacing.xs,
  },
  featureTitle: {
    color: colors.textMain,
    fontSize: 16,
    fontWeight: '700',
  },
  featureSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  featurePrice: {
    color: colors.textMain,
    fontSize: 16,
    fontWeight: '700',
  },
  offersGrid: {
    gap: spacing.md,
  },
  offerCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  offerImage: {
    width: '100%',
    height: 140,
  },
  offerContent: {
    padding: spacing.md,
    gap: spacing.xs,
  },
  offerTitle: {
    color: colors.textMain,
    fontSize: 15,
    fontWeight: '700',
  },
  offerSubtitle: {
    color: colors.textMuted,
    fontSize: 13,
  },
  offerPrice: {
    color: colors.textMain,
    fontSize: 14,
    fontWeight: '700',
  },
  sectionTitle: {
    color: colors.textMain,
    fontSize: 22,
    fontWeight: '600',
  },
  serviceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.primary,
  },
  serviceText: {
    color: colors.textSoft,
    fontSize: 14,
  },
  logoRow: {
    gap: spacing.md,
    paddingRight: spacing.sm,
  },
  logoCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    width: 120,
    height: 64,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  partnerLogo: {
    width: 90,
    height: 40,
  },
  benefitsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  benefitRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
  },
  benefitIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  benefitInfo: {
    flex: 1,
    gap: 4,
  },
  benefitTitle: {
    color: colors.textMain,
    fontWeight: '600',
  },
  benefitText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  portfolioLoop: {
    gap: spacing.md,
    paddingRight: spacing.sm,
  },
  portfolioRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginRight: spacing.md,
  },
  portfolioCard: {
    width: 200,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.md,
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  portfolioImage: {
    width: '100%',
    height: 90,
  },
  portfolioTitle: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 15,
    textAlign: 'center',
  },
  eventsCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  eventRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  eventTitle: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 15,
  },
  eventDate: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  eventTag: {
    color: colors.primary,
    fontWeight: '600',
    fontSize: 13,
  },
  contactCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
  },
  quickCard: {
    width: 90,
    backgroundColor: colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickText: {
    color: colors.textSoft,
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.7,
  },
  contactRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    flexWrap: 'wrap',
  },
  contactButton: {
    minWidth: 150,
    paddingHorizontal: spacing.md,
  },
});
