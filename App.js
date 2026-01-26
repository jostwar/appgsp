import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from './src/screens/HomeScreen';
import RewardsScreen from './src/screens/RewardsScreen';
import PortfolioScreen from './src/screens/PortfolioScreen';
import ProfileScreen from './src/screens/ProfileScreen';
import { colors } from './src/theme';
import ProductsScreen from './src/screens/ProductsScreen';
import CartScreen from './src/screens/CartScreen';
import { CartProvider } from './src/store/cart';
import CheckoutScreen from './src/screens/CheckoutScreen';
import MembershipScreen from './src/screens/MembershipScreen';
import LoginScreen from './src/screens/LoginScreen';
import { AuthProvider, useAuth } from './src/store/auth';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

function MainTabs() {
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
          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen name="Inicio" component={HomeScreen} />
      <Tab.Screen
        name="Recompensas"
        component={RewardsScreen}
        options={{ tabBarLabel: 'GSPRewards' }}
      />
      <Tab.Screen
        name="Portafolio"
        component={PortfolioScreen}
        options={{ tabBarLabel: 'Portaf.' }}
      />
      <Tab.Screen
        name="Productos"
        component={ProductsScreen}
        options={{ tabBarLabel: 'Prod.' }}
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
