import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../theme';
import { getCheckoutUrl } from '../api/woocommerce';

export default function CheckoutScreen({ route }) {
  const checkoutUrl = route?.params?.url || getCheckoutUrl();
  return (
    <View style={styles.screen}>
      {checkoutUrl ? (
        <WebView source={{ uri: checkoutUrl }} />
      ) : (
        <View style={styles.center}>
          <Text style={styles.centerText}>
            No se pudo cargar el checkout.
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  centerText: {
    color: colors.textMuted,
    textAlign: 'center',
  },
});
