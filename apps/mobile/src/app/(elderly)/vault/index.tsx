import { useCallback, useState } from 'react';
import { View, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleCard } from '../../../components/ui/AccessibleCard';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { vaultService } from '../../../services/vault.service';
import { syncService } from '../../../services/sync.service';
import type { DecryptedVaultItem } from '../../../services/offline-vault.service';
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
  const [items, setItems] = useState<DecryptedVaultItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const loadItems = useCallback(async () => {
    const list = await vaultService.getAllItems();
    setItems(list);
  }, []);

  // Reload every time the screen regains focus (e.g., returning from "new"/"[id]")
  useFocusEffect(
    useCallback(() => {
      void loadItems();
    }, [loadItems]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await syncService.sync();
    } finally {
      await loadItems();
      setRefreshing(false);
    }
  }

  return (
    <Screen scroll={false}>
      <View style={{ paddingVertical: spacing.md }}>
        <AccessibleText variant="title">Meu Cofre</AccessibleText>
        <AccessibleText variant="body" color={colors.textSecondary}>
          {items.length} {items.length === 1 ? 'senha guardada' : 'senhas guardadas'}
        </AccessibleText>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListEmptyComponent={
          <AccessibleText variant="body" color={colors.textSecondary} style={{ marginTop: spacing.lg }}>
            Você ainda não guardou nenhuma senha. Toque em "Adicionar nova senha" para começar.
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
