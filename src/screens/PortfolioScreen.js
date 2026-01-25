import { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, Pressable, Image } from 'react-native';
import { colors, spacing } from '../theme';

export default function PortfolioScreen({ navigation }) {
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];
  const categories = useMemo(
    () => [
      {
        id: 'alarmas',
        title: 'Alarmas',
        description: 'Soluciones de protección para hogares y empresas.',
        image:
          'https://gsp.com.co/wp-content/uploads/2024/02/SISTEMA-DE-ALARMAS-V2.png',
      },
      {
        id: 'camaras',
        title: 'Cámaras',
        description: 'Videovigilancia interior, exterior y WiFi.',
        image: 'https://gsp.com.co/wp-content/uploads/2024/02/CAMARAS-2.png',
      },
      {
        id: 'acceso',
        title: 'Control de acceso',
        description: 'Biométricos, electroimanes y barreras vehiculares.',
        image:
          'https://gsp.com.co/wp-content/uploads/2024/02/CONTROL-DE-ACCESO.png',
      },
      {
        id: 'redes',
        title: 'Redes',
        description: 'Switches, cableado y conectividad estable.',
        image:
          'https://gsp.com.co/wp-content/uploads/2024/02/SWICHES-Y-REDES-V2.png',
      },
      {
        id: 'almacenamiento',
        title: 'Almacenamiento',
        description: 'Discos, micro SD y grabadores DVR/NVR.',
        image:
          'https://gsp.com.co/wp-content/uploads/2024/02/ALMACENAMIENTO-V2.png',
      },
      {
        id: 'ups',
        title: 'UPS',
        description: 'Protección eléctrica para operación continua.',
        image:
          'https://gsp.com.co/wp-content/uploads/2024/02/PROTECCION-ELECTRICA-V2.png',
      },
    ],
    []
  );

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Portafolio</Text>
          <Text style={styles.heroText}>
            Explora nuestras líneas de seguridad electrónica y encuentra la
            solución ideal para tu negocio.
          </Text>
          <View style={styles.actionRow}>
            <Pressable
              style={pressableStyle(styles.primaryButton)}
              onPress={() => navigation.navigate('Productos')}
            >
              <Text style={styles.primaryButtonText}>Productos</Text>
            </Pressable>
            <Pressable
              style={pressableStyle(styles.secondaryButton)}
              onPress={() => navigation.navigate('Carrito')}
            >
              <Text style={styles.secondaryButtonText}>Carrito</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.grid}>
          {categories.map((item) => (
            <Pressable
              key={item.id}
              style={pressableStyle(styles.card)}
              onPress={() =>
                navigation.navigate('Productos', {
                  categoryName: item.title,
                  _ts: Date.now(),
                })
              }
            >
              <Image source={{ uri: item.image }} style={styles.cardImage} />
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardText}>{item.description}</Text>
              <Pressable
                style={pressableStyle(styles.secondaryButton)}
                onPress={() =>
                  navigation.navigate('Productos', {
                    categoryName: item.title,
                    _ts: Date.now(),
                  })
                }
              >
                <Text style={styles.secondaryButtonText}>Ver productos</Text>
              </Pressable>
            </Pressable>
          ))}
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
  heroCard: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  heroTitle: {
    color: colors.textMain,
    fontSize: 24,
    fontWeight: '700',
  },
  heroText: {
    color: colors.textSoft,
    fontSize: 15,
    lineHeight: 22,
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  primaryButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: colors.buttonText,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: colors.buttonText,
    fontWeight: '600',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    width: '48%',
    marginBottom: spacing.md,
  },
  cardImage: {
    width: '100%',
    height: 150,
    borderRadius: 12,
  },
  cardTitle: {
    color: colors.textMain,
    fontWeight: '600',
    fontSize: 16,
  },
  cardText: {
    color: colors.textMuted,
    fontSize: 13,
  },
  pressed: {
    opacity: 0.7,
  },
});
