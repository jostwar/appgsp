import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  Image,
  Linking,
} from 'react-native';
import { colors, spacing } from '../theme';
import { runSearch } from '../api/aiSearch';

export default function SearchScreen({ route }) {
  const initialQuery = route?.params?.query || '';
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState('idle');
  const [results, setResults] = useState([]);
  const [raw, setRaw] = useState(null);
  const [rawText, setRawText] = useState('');
  const [error, setError] = useState('');
  const [debugInfo, setDebugInfo] = useState('');
  const debounceRef = useRef(null);
  const pressableStyle = (baseStyle) => ({ pressed }) => [
    baseStyle,
    pressed && styles.pressed,
  ];

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

  const normalizedResults = useMemo(() => {
    if (Array.isArray(results)) return results;
    if (Array.isArray(results?.items)) return results.items;
    if (Array.isArray(results?.results)) return results.results;
    if (Array.isArray(results?.products)) return results.products;
    if (typeof results?.products === 'string') {
      try {
        const parsedProducts = JSON.parse(results.products);
        return Array.isArray(parsedProducts) ? parsedProducts : [];
      } catch (error) {
        return [];
      }
    }
    return [];
  }, [results]);

  const parseSearchPayload = (payload) => {
    if (!payload) return null;
    if (typeof payload === 'string') {
      try {
        return JSON.parse(payload);
      } catch (error) {
        return payload;
      }
    }
    return payload;
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

  const handleSearch = async (overrideQuery) => {
    const safeQuery = (overrideQuery ?? query).trim();
    if (!safeQuery) return;
    setStatus('loading');
    setError('');
    setDebugInfo('');
    try {
      const data = await runSearch(safeQuery);
      const parsedResponse = data?.parsed ?? data;
      const bodyPayload = parsedResponse?.body ?? parsedResponse?.data ?? null;
      const parsedBody = parseSearchPayload(bodyPayload);
      const parsedRaw = parseSearchPayload(data?.raw);
      const parsed =
        parsedBody ||
        parsedResponse?.results ||
        parsedResponse?.items ||
        parsedResponse?.data ||
        parsedRaw ||
        data;
      const list = extractResults(parsed);
      setResults(list);
      setRaw(parsed);
      setRawText(data?.raw || '');
      setStatus('ready');
    } catch (err) {
      setStatus('error');
      setError('No se pudo completar la búsqueda.');
      setDebugInfo(
        `${err?.status || 'ERR'} ${String(err?.payload || err?.message || '')}`
      );
    }
  };

  useEffect(() => {
    if (initialQuery) {
      handleSearch(initialQuery);
    }
  }, []);

  useEffect(() => {
    if (!query || query.trim().length < 2) {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      handleSearch(query);
    }, 450);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Buscador con AI</Text>
        <Text style={styles.subtitle}>
          Encuentra productos, categorías o información de GSP.
        </Text>
      </View>

      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="¿Qué estás buscando?"
          placeholderTextColor={colors.textMuted}
          style={styles.input}
          returnKeyType="search"
          onSubmitEditing={() => handleSearch()}
        />
        <Pressable
          style={pressableStyle(styles.primaryButton)}
          onPress={handleSearch}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? (
            <ActivityIndicator color={colors.buttonText} />
          ) : (
            <Text style={styles.primaryButtonText}>Buscar</Text>
          )}
        </Pressable>
      </View>

      {status === 'error' ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
          {debugInfo ? (
            <Text style={styles.errorDebug}>{debugInfo}</Text>
          ) : null}
        </View>
      ) : null}

      {status === 'ready' && normalizedResults.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No hay resultados</Text>
        </View>
      ) : null}

      <FlatList
        data={normalizedResults}
        keyExtractor={(item, index) => String(item?.id || index)}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.resultCard}>
            {item?.image ? (
              <Image source={{ uri: item.image }} style={styles.resultImage} />
            ) : null}
            <Text style={styles.resultTitle}>
              {item?.name || item?.title || 'Resultado'}
            </Text>
            {item?.price ? (
              <Text style={styles.resultPrice}>{formatCop(item.price)}</Text>
            ) : null}
            <Text style={styles.resultText}>
              {item?.description || item?.summary || ''}
            </Text>
            {item?.link ? (
              <Pressable
                style={pressableStyle(styles.secondaryButton)}
                onPress={() => Linking.openURL(item.link)}
              >
                <Text style={styles.secondaryButtonText}>Ver en web</Text>
              </Pressable>
            ) : null}
          </View>
        )}
        ListFooterComponent={
          status === 'ready' && rawText && normalizedResults.length === 0 ? (
            <View style={styles.rawCard}>
              <Text style={styles.resultTitle}>Respuesta</Text>
              <Text style={styles.resultText}>{rawText}</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    padding: spacing.xl,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.xs,
  },
  title: {
    color: colors.textMain,
    fontSize: 22,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
  },
  searchRow: {
    gap: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    color: colors.textMain,
    fontSize: 15,
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
  },
  errorText: {
    color: colors.warning,
    textAlign: 'center',
  },
  errorBox: {
    gap: spacing.xs,
  },
  errorDebug: {
    color: colors.textMuted,
    fontSize: 11,
    textAlign: 'center',
  },
  list: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  resultCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.xs,
  },
  resultTitle: {
    color: colors.textMain,
    fontWeight: '600',
  },
  resultPrice: {
    color: colors.textSoft,
    fontSize: 13,
  },
  resultText: {
    color: colors.textMuted,
    fontSize: 12,
  },
  resultImage: {
    width: '100%',
    height: 140,
    borderRadius: 10,
    marginBottom: spacing.sm,
  },
  secondaryButton: {
    backgroundColor: colors.buttonBg,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  secondaryButtonText: {
    color: colors.buttonText,
    fontWeight: '600',
    fontSize: 12,
  },
  pressed: {
    opacity: 0.7,
  },
  empty: {
    alignItems: 'center',
  },
  emptyText: {
    color: colors.textMuted,
  },
  rawCard: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: spacing.md,
    gap: spacing.xs,
  },
});
