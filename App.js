import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Image, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
import { AuthProvider, useAuth } from './src/store/auth';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

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
          backgroundColor: colors.background,
          borderTopColor: colors.border,
          height: 70,
          paddingBottom: 6,
          justifyContent: 'space-around',
        },
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 9,
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: 6,
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
        name="Carrito"
        component={CartScreen}
        options={{ tabBarLabel: 'Carrito' }}
      />
      <Tab.Screen
        name="Membresia"
        component={MembershipScreen}
        options={{ tabBarLabel: 'GSP Care' }}
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
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <Stack.Screen name="Main" component={MainTabs} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
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
