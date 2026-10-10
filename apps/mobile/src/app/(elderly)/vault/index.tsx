import { useCallback, useState } from 'react';
import { View, FlatList, RefreshControl, Switch, ScrollView, Pressable, Alert } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleCard } from '../../../components/ui/AccessibleCard';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { AccessibleTextInput } from '../../../components/ui/AccessibleTextInput';
import { offlineVaultService } from '../../../services/offline-vault.service';
import { vaultService } from '../../../services/vault.service';
import { syncService } from '../../../services/sync.service';
import type { LocalVaultItem } from '../../../services/offline-vault.service';
import { colors, spacing } from '../../../theme/theme';

const CATEGORY_LABELS: Record<string, string> = {
  BANKING: 'Banco',
  SOCIAL_MEDIA: 'Rede Social',
  EMAIL: 'E-mail',
  HEALTH: 'Saúde',
  GOVERNMENT: 'Governo',
  SHOPPING: 'Compras',
  OTHER: 'Outro',
};

export default function VaultListScreen() {
  const router = useRouter();
  const [items, setItems] = useState<LocalVaultItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [favorites, setFavorites] = useState(false);
  const [conflicts, setConflicts] = useState<LocalVaultItem[]>([]);
  const [error, setError] = useState('');

  const loadItems = useCallback(async () => {
    const list = await vaultService.getAllItems();
    setItems(list);
    setConflicts(await offlineVaultService.getConflicts());
  }, []);

  // Reload every time the screen regains focus (e.g., returning from "new"/"[id]")
  useFocusEffect(
    useCallback(() => {
      void loadItems().catch(() => setError('Nao foi possivel abrir o cofre. Tente desbloquea-lo novamente.'));
    }, [loadItems]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await syncService.sync();
      setError('');
    } catch { setError('Nao foi possivel sincronizar. Suas alteracoes continuam neste aparelho.');
    } finally {
      await loadItems();
      setRefreshing(false);
    }
  }

  async function resolve(item: LocalVaultItem, keepLocal: boolean) {
    try { await offlineVaultService.resolveConflict(item.id, keepLocal); await syncService.sync(); await loadItems(); }
    catch { Alert.alert('Nao foi possivel resolver agora', 'Verifique a conexao e tente novamente.'); }
  }

  const visible = items.filter((item) => (category === 'ALL' || item.category === category) &&
    (!favorites || item.isFavorite) && item.label.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));

  return (
    <Screen scroll={false}>
      <View style={{ paddingVertical: spacing.md }}>
        <AccessibleText variant="title">Meu Cofre</AccessibleText>
        <AccessibleText variant="body" color={colors.textSecondary}>
          {items.length} {items.length === 1 ? 'senha guardada' : 'senhas guardadas'}
        </AccessibleText>
      </View>
      <AccessibleTextInput label="Buscar senha" value={query} onChangeText={setQuery} />
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <AccessibleText variant="body" style={{ flex: 1 }}>Somente favoritas</AccessibleText>
        <Switch accessibilityLabel="Mostrar somente favoritas" value={favorites} onValueChange={setFavorites} />
      </View>
      <ScrollView horizontal style={{ flexGrow: 0, marginVertical: spacing.sm }} showsHorizontalScrollIndicator={false}>
        {Object.entries({ ALL: 'Todas', ...CATEGORY_LABELS }).map(([value, label]) => (
          <Pressable key={value} onPress={() => setCategory(value)} accessibilityRole="button" accessibilityLabel={label}
            accessibilityState={{ selected: category === value }} style={{ minHeight: 56, justifyContent: 'center', paddingHorizontal: spacing.md }}>
            <AccessibleText variant="body" bold={category === value} color={category === value ? colors.primary : colors.textPrimary}>{label}</AccessibleText>
          </Pressable>
        ))}
      </ScrollView>
      {error && <AccessibleText variant="body" color={colors.danger} accessibilityLiveRegion="polite">{error}</AccessibleText>}

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListHeaderComponent={<>{conflicts.map((item) => (
          <AccessibleCard key={item.id}>
            <AccessibleText variant="body" bold>Conflito em {item.label}{item.deleted ? ' (exclusao)' : ''}</AccessibleText>
            <AccessibleButton label="Manter minha alteracao" onPress={() => void resolve(item, true)} />
            <AccessibleButton label="Usar versao do servidor" variant="secondary" onPress={() => Alert.alert('Descartar alteracao local?', item.label, [
              { text: 'Cancelar', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: () => void resolve(item, false) },
            ])} />
          </AccessibleCard>
        ))}</>}
        ListEmptyComponent={
          <AccessibleText variant="body" color={colors.textSecondary} style={{ marginTop: spacing.lg }}>
            {items.length ? 'Nenhuma senha encontrada.' : 'Nenhuma senha guardada.'}
          </AccessibleText>
        }
        renderItem={({ item }) => (
          <AccessibleCard
            onPress={() => router.push(`/(elderly)/vault/${item.id}`)}
            accessibilityLabel={`${item.label}, categoria ${CATEGORY_LABELS[item.category]}${
              item.requiresApproval ? ', requer aprovação de um familiar' : ''
            }`}
          >
            <AccessibleText variant="bodyLarge" bold>
              {item.isFavorite ? '⭐ ' : ''}
              {item.label}
            </AccessibleText>
            <AccessibleText variant="caption">{CATEGORY_LABELS[item.category]}</AccessibleText>
            {item.requiresApproval && (
              <AccessibleText variant="caption" color={colors.warning}>
                🔒 Requer aprovação de um familiar
              </AccessibleText>
            )}
            {!item.synced && (
              <AccessibleText variant="caption" color={colors.textSecondary}>
                Aguardando sincronização
              </AccessibleText>
            )}
          </AccessibleCard>
        )}
      />

      <AccessibleButton label="Adicionar nova senha" onPress={() => router.push('/(elderly)/vault/new')} />
    </Screen>
  );
}
