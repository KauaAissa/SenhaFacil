import { useCallback, useRef, useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from './ui/Screen';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleCard } from './ui/AccessibleCard';
import { accessApiService, type AccessHistoryEntry } from '../services/access-api.service';
import { colors } from '../theme/theme';
import { AccessibleButton } from './ui/AccessibleButton';

const statuses = { PENDING: 'Aguardando resposta', APPROVED: 'Aprovado', DENIED: 'Negado',
  EXPIRED: 'Expirado', FALLBACK_GRANTED: 'Emergencia informada pelo aparelho', CANCELLED: 'Cancelado' };

export default function AccessHistoryScreen() {
  const [items, setItems] = useState<AccessHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const load = useCallback(async (next?: string) => {
    if (busy.current) return;
    busy.current = true;
    const current = generation.current;
    setLoading(true);
    try {
      const page = await accessApiService.historyPage(next);
      if (current !== generation.current) return;
      setItems((previous) => next ? [...previous, ...page.items.filter((item) => !previous.some((old) => old.id === item.id))] : page.items);
      setCursor(page.nextCursor); setError('');
    } catch { if (current === generation.current) setError('Historico indisponivel. Verifique a conexao.'); }
    finally { if (current === generation.current) { busy.current = false; setLoading(false); } }
  }, []);
  useFocusEffect(useCallback(() => { void load(); return () => { generation.current += 1; busy.current = false; }; }, [load]));
  return (
    <Screen scroll={false}>
      <AccessibleText variant="title">Historico de acessos</AccessibleText>
      {Boolean(error) && <AccessibleText variant="body" color={colors.danger} accessibilityLiveRegion="polite">{error}</AccessibleText>}
      <FlatList data={items} keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
        ListFooterComponent={cursor ? <AccessibleButton label="Carregar mais" icon="chevron-down-outline" variant="secondary"
          loading={loading} onPress={() => void load(cursor)} /> : null}
        ListEmptyComponent={!loading && !error ? <AccessibleText variant="body">Nenhum acesso registrado.</AccessibleText> : null}
        renderItem={({ item }) => (
          <AccessibleCard>
            <AccessibleText variant="bodyLarge" bold>{item.vaultItem.label}</AccessibleText>
            <AccessibleText variant="body">{item.requester.name}</AccessibleText>
            <AccessibleText variant="body">{statuses[item.status]}</AccessibleText>
            <AccessibleText variant="caption">{new Date(item.requestedAt).toLocaleString('pt-BR')}</AccessibleText>
            {item.approver && <AccessibleText variant="body">{item.approver.name}</AccessibleText>}
            {Boolean(item.notes) && <AccessibleText variant="body">{item.notes}</AccessibleText>}
          </AccessibleCard>
        )} />
    </Screen>
  );
}