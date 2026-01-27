import { StyleSheet, Text, View, Image, Pressable } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { colors, spacing } from '../theme';

export default function IntroScreen() {
  const navigation = useNavigation();
  return (
    <View style={styles.screen}>
      <View style={styles.content}>
        <Image
          source={{
            uri: 'https://gsp.com.co/wp-content/uploads/2026/01/cropped-Identificador-GSP_LOGO_3.png',
          }}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.title}>Bienvenido a GSP</Text>
        <Text style={styles.subtitle}>
          Cotiza, compra y accede a beneficios exclusivos desde tu celular.
        </Text>
        <Pressable
          style={({ pressed }) => [
            styles.primaryButton,
            pressed && styles.pressed,
          ]}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.primaryButtonText}>Continuar</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
  },
  content: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  logo: {
    width: 180,
    height: 60,
  },
  title: {
    color: colors.textMain,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: spacing.sm,
    backgroundColor: colors.buttonBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
