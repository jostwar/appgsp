import { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '../theme';
import { getBaseUrl, getCheckoutUrl } from '../api/woocommerce';
import { useAuth } from '../store/auth';

export default function CheckoutScreen({ route }) {
  const { sessionEmail, sessionPassword } = useAuth();
  const targetUrl = route?.params?.url || getCheckoutUrl();
  const forceLogin = route?.params?.forceLogin === true;
  const baseUrl = getBaseUrl().replace(/\/$/, '');
  const loginUrl = `${baseUrl}/my-account/?redirect_to=${encodeURIComponent(
    targetUrl
  )}`;
  const checkoutUrl =
    forceLogin && sessionEmail && sessionPassword ? loginUrl : targetUrl;
  const webRef = useRef(null);
  const autoLogin = route?.params?.autoLogin !== false;
  const loginScript = useMemo(() => {
    if (!sessionEmail || !sessionPassword) return '';
    const email = JSON.stringify(sessionEmail);
    const password = JSON.stringify(sessionPassword);
    return `
      (function() {
        try {
          var email = ${email};
          var pass = ${password};
          if (!email || !pass) return;
          var attempts = 0;
          var timer = setInterval(function() {
            attempts += 1;
            var userField = document.querySelector('#username, #user_login, input[name="username"]');
            var passField = document.querySelector('#password, #user_pass, input[name="password"]');
            var form =
              document.querySelector('form.woocommerce-form-login') ||
              document.querySelector('form#loginform') ||
              document.querySelector('form.login');
            if (userField && passField) {
              userField.value = email;
              userField.dispatchEvent(new Event('input', { bubbles: true }));
              passField.value = pass;
              passField.dispatchEvent(new Event('input', { bubbles: true }));
              var submitBtn =
                document.querySelector('button[name="login"]') ||
                document.querySelector('button.woocommerce-button') ||
                document.querySelector('button[type="submit"]') ||
                document.querySelector('input[type="submit"]');
              if (submitBtn && submitBtn.click) {
                submitBtn.click();
              } else if (form) {
                form.submit();
              }
              clearInterval(timer);
            }
            if (attempts >= 10) {
              clearInterval(timer);
            }
          }, 400);
        } catch (_error) {}
      })();
    `;
  }, [sessionEmail, sessionPassword]);
  return (
    <View style={styles.screen}>
      {checkoutUrl ? (
        <WebView
          ref={webRef}
          source={{ uri: checkoutUrl }}
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          javaScriptEnabled
          onLoadEnd={() => {
            if (autoLogin && loginScript) {
              webRef.current?.injectJavaScript(loginScript);
            }
          }}
        />
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
