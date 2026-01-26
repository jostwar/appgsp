import { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Pressable,
  ActivityIndicator,
  Image,
  Linking,
} from 'react-native';
import Constants from 'expo-constants';
import { Ionicons } from '@expo/vector-icons';
import { colors, spacing } from '../theme';
import { useAuth } from '../store/auth';

export default function LoginScreen() {
  const { signIn, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const appVersion =
    Constants?.expoConfig?.version ||
    Constants?.manifest?.version ||
    '1.0.0';

  const handleSubmit = async () => {
    setError('');
    const result = await signIn({ email, password, remember: rememberMe });
    if (!result.ok) {
      setError(result.error || 'No se pudo iniciar sesión');
    }
  };

  return (
    <View style={styles.screen}>
      <View style={styles.card}>
        <Image
          source={{
            uri: 'https://gsp.com.co/wp-content/uploads/2026/01/Identificador-GSP_LOGO_3.png',
          }}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Bienvenido a GSP</Text>
        <Text style={styles.subtitle}>
          Ingresa con tu correo y contraseña de gsp.com.co
        </Text>

        <View style={styles.field}>
          <Text style={styles.label}>Correo</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="correo@empresa.com"
            placeholderTextColor={colors.textMuted}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Contraseña</Text>
          <View style={styles.passwordRow}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="••••••••"
              placeholderTextColor={colors.textMuted}
              secureTextEntry={!showPassword}
              style={styles.passwordInput}
            />
            <Pressable
              onPress={() => setShowPassword((prev) => !prev)}
              style={({ pressed }) => [
                styles.eyeButton,
                pressed && styles.pressed,
              ]}
            >
              <Ionicons
                name={showPassword ? 'eye-off' : 'eye'}
                size={20}
                color={colors.textMuted}
              />
            </Pressable>
          </View>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          style={({ pressed }) => [
            styles.rememberRow,
            pressed && styles.pressed,
          ]}
          onPress={() => setRememberMe((prev) => !prev)}
        >
          <Ionicons
            name={rememberMe ? 'checkbox' : 'square-outline'}
            size={20}
            color={rememberMe ? colors.primary : colors.textMuted}
          />
          <Text style={styles.rememberText}>Recordarme</Text>
        </Pressable>

        <Pressable
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          onPress={handleSubmit}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color={colors.buttonText} />
          ) : (
            <Text style={styles.buttonText}>Iniciar sesión</Text>
          )}
        </Pressable>

        <View style={styles.linksRow}>
          <Pressable
            onPress={() => Linking.openURL('https://gsp.com.co/my-account/')}
          >
            <Text style={styles.linkText}>Registrarse</Text>
          </Pressable>
          <Text style={styles.linkDivider}>·</Text>
          <Pressable
            onPress={() =>
              Linking.openURL('https://gsp.com.co/my-account/lost-password/')
            }
          >
            <Text style={styles.linkText}>Olvidé mi contraseña</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Versión {appVersion} · ipeakagency.com
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: spacing.xl,
    gap: spacing.md,
    alignItems: 'center',
  },
  logo: {
    width: 180,
    height: 56,
  },
  title: {
    color: colors.textMain,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
  },
  field: {
    gap: spacing.xs,
    alignSelf: 'stretch',
  },
  label: {
    color: colors.textSoft,
    fontSize: 13,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.textMain,
    borderWidth: 1,
    borderColor: colors.border,
  },
  passwordRow: {
    position: 'relative',
  },
  passwordInput: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.textMain,
    borderWidth: 1,
    borderColor: colors.border,
    paddingRight: 44,
  },
  eyeButton: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  button: {
    backgroundColor: colors.buttonBg,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  buttonText: {
    color: colors.buttonText,
    fontWeight: '700',
    fontSize: 14,
  },
  pressed: {
    opacity: 0.7,
  },
  error: {
    color: colors.warning,
    fontSize: 13,
  },
  rememberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    alignSelf: 'flex-start',
  },
  rememberText: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
  },
  linksRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    alignItems: 'center',
  },
  linkText: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '600',
  },
  linkDivider: {
    color: colors.textMuted,
    fontSize: 13,
  },
  footer: {
    marginTop: spacing.lg,
  },
  footerText: {
    color: colors.textMuted,
    fontSize: 12,
  },
});
