import { useCallback, useState } from 'react';
import { FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from './ui/Screen';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleCard } from './ui/AccessibleCard';
import { accessApiService, type AccessHistoryEntry } from '../services/access-api.service';
import { colors } from '../theme/theme';

const statuses = { PENDING: 'Aguardando resposta', APPROVED: 'Aprovado', DENIED: 'Negado',
  EXPIRED: 'Expirado', FALLBACK_GRANTED: 'Emergencia informada pelo aparelho' };

export default function AccessHistoryScreen() {
  const [items, setItems] = useState<AccessHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    setLoading(true);
    try { setItems(await accessApiService.history()); setError(''); }
    catch { setError('Historico indisponivel. Verifique a conexao.'); }
    finally { setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  return (
    <Screen scroll={false}>
      <AccessibleText variant="title">Historico de acessos</AccessibleText>
      {error && <AccessibleText variant="body" color={colors.danger} accessibilityLiveRegion="polite">{error}</AccessibleText>}
      <FlatList data={items} keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
        ListEmptyComponent={!loading && !error ? <AccessibleText variant="body">Nenhum acesso registrado.</AccessibleText> : null}
        renderItem={({ item }) => (
          <AccessibleCard>
            <AccessibleText variant="bodyLarge" bold>{item.vaultItem.label}</AccessibleText>
            <AccessibleText variant="body">{item.requester.name}</AccessibleText>
            <AccessibleText variant="body">{statuses[item.status]}</AccessibleText>
            <AccessibleText variant="caption">{new Date(item.requestedAt).toLocaleString('pt-BR')}</AccessibleText>
            {item.approver && <AccessibleText variant="body">{item.approver.name}</AccessibleText>}
            {item.notes && <AccessibleText variant="body">{item.notes}</AccessibleText>}
          </AccessibleCard>
        )} />
    </Screen>
  );
}