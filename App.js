import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Image, Linking, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import HomeScreen from './src/screens/HomeScreen';
import RewardsScreen from './src/screens/RewardsScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { colors } from './src/theme';
import ProductsScreen from './src/screens/ProductsScreen';
import CartScreen from './src/screens/CartScreen';
import { CartProvider, useCart } from './src/store/cart';
import CheckoutScreen from './src/screens/CheckoutScreen';
import MembershipScreen from './src/screens/MembershipScreen';
import LoginScreen from './src/screens/LoginScreen';
import IntroScreen from './src/screens/IntroScreen';
import { AuthProvider, useAuth } from './src/store/auth';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();
const NOTIFICATIONS_STORAGE_KEY = 'gsp_notifications';

const persistNotification = async (notification) => {
  if (!notification) return;
  try {
    const content = notification?.request?.content || {};
    const identifier = notification?.request?.identifier || '';
    const payload = {
      id: String(identifier || Date.now()),
      title: String(content.title || '').trim(),
      body: String(content.body || '').trim(),
      data: content.data || {},
      read: false,
      receivedAt: new Date().toISOString(),
    };
    const raw = await AsyncStorage.getItem(NOTIFICATIONS_STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    if (Array.isArray(list) && list.some((item) => item?.id === payload.id)) {
      return;
    }
    const next = Array.isArray(list) ? [payload, ...list] : [payload];
    await AsyncStorage.setItem(NOTIFICATIONS_STORAGE_KEY, JSON.stringify(next.slice(0, 50)));
  } catch (_error) {
    // ignore storage errors
  }
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function MainTabs() {
  const { items } = useCart();
  const cartCount = items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <Tab.Navigator
      initialRouteName="Inicio"
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textMain,
        headerTitleStyle: { fontWeight: '600' },
        headerShadowVisible: false,
        headerTitleAlign: 'center',
        headerTitle: () => (
          <Image
            source={{
              uri: 'https://gsp.com.co/wp-content/uploads/2026/01/cropped-Identificador-GSP_LOGO_3.png',
            }}
            style={{ width: 140, height: 40 }}
            resizeMode="contain"
          />
        ),
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: 'transparent',
          height: 74,
          paddingTop: 6,
          paddingBottom: 6,
          justifyContent: 'space-around',
          marginHorizontal: 16,
          marginBottom: 12,
          borderRadius: 18,
          elevation: 8,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 6 },
          position: 'absolute',
        },
        tabBarHideOnKeyboard: true,
        sceneContainerStyle: {
          paddingBottom: 96,
        },
        tabBarShowLabel: true,
        tabBarIconStyle: {
          marginTop: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          marginTop: 2,
        },
        tabBarItemStyle: {
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1,
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarIcon: ({ color, size }) => {
          const icons = {
            Inicio: 'home',
            Recompensas: 'gift',
            Portafolio: 'grid',
            Productos: 'pricetags',
            Carrito: 'cart',
            Membresia: 'shield',
            Checkout: 'card',
            Perfil: 'person',
          };
          const iconName = icons[route.name] || 'ellipse';
          if (route.name === 'Carrito') {
            return (
              <View style={{ width: size + 10, height: size + 10 }}>
                <Ionicons name={iconName} size={size} color={color} />
                {cartCount > 0 ? (
                  <View
                    style={{
                      position: 'absolute',
                      right: -2,
                      top: -4,
                      minWidth: 16,
                      height: 16,
                      borderRadius: 8,
                      backgroundColor: colors.primary,
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingHorizontal: 4,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.buttonText,
                        fontSize: 10,
                        fontWeight: '700',
                      }}
                    >
                      {cartCount}
                    </Text>
                  </View>
                ) : null}
              </View>
            );
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} />
      <Tab.Screen
        name="Recompensas"
        component={RewardsScreen}
        options={{ tabBarLabel: 'Rewards' }}
      />
      <Tab.Screen
        name="Portafolio"
        component={PortfolioScreen}
        options={{ tabBarLabel: 'Portafolio' }}
      />
      <Tab.Screen
        name="Productos"
        component={ProductsScreen}
        options={{ tabBarLabel: 'Productos' }}
      />
      <Tab.Screen
        name="Membresia"
        component={MembershipScreen}
        options={{ tabBarLabel: 'GSP Care' }}
      />
      <Tab.Screen
        name="Carrito"
        component={CartScreen}
        options={{ tabBarLabel: 'Carrito' }}
      />
      <Tab.Screen
        name="Checkout"
        component={CheckoutScreen}
        options={{
          tabBarButton: () => null,
          tabBarItemStyle: { display: 'none' },
        }}
      />
      <Tab.Screen
        name="Perfil"
        component={ProfileScreen}
        options={{ tabBarLabel: 'Perfil' }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user } = useAuth();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Intro">
      {user ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <>
          <Stack.Screen name="Intro" component={IntroScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
        </>
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        persistNotification(notification);
      }
    );
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const url = response?.notification?.request?.content?.data?.url;
        persistNotification(response?.notification);
        if (url) {
          Linking.openURL(String(url)).catch(() => null);
        }
      }
    );
    return () => {
      receivedSubscription.remove();
      subscription.remove();
    };
  }, []);
  return (
    <AuthProvider>
      <CartProvider>
        <NavigationContainer>
          <StatusBar style="light" />
          <RootNavigator />
        </NavigationContainer>
      </CartProvider>
    </AuthProvider>
  );
}
