import { useCallback, useRef, useState } from 'react';
import { View, FlatList, RefreshControl, Alert } from 'react-native';
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
import { spacing } from '../../../theme/theme';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../../stores/auth.store';
import { AccessibleSwitch } from '../../../components/ui/AccessibleSwitch';
import { categories, categoryDetails } from '../../../theme/categories';
import { ChoiceChip } from '../../../components/ui/ChoiceChip';
import { HeroCard, SectionHeading, StatusPill, IconBadge, Notice, EmptyState, LoadingState } from '../../../components/ui/Presentation';
import { SupportTools } from '../../../components/SupportTools';
import { getErrorMessage } from '../../../services/error-messages';
import { isKeyboardScrollResponder } from '../../../components/ui/KeyboardFocusContext';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';

export default function VaultListScreen() {
  const colors = useThemeColors();
  const isOffline = useAuthStore((state) => state.isOffline);
  const user = useAuthStore((state) => state.user);
  const router = useRouter();
  const list = useRef<FlatList<LocalVaultItem>>(null);
  const getKeyboardScrollResponder = useCallback(() => {
    const responder = list.current?.getScrollResponder();
    return isKeyboardScrollResponder(responder) ? responder : null;
  }, []);
  const [items, setItems] = useState<LocalVaultItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('ALL');
  const [favorites, setFavorites] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [conflicts, setConflicts] = useState<LocalVaultItem[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const focused = useRef(false);
  const focusGeneration = useRef(0);
  const readGeneration = useRef(0);

  const loadItems = useCallback(async () => {
    const generation = ++readGeneration.current;
    const owner = useAuthStore.getState().user?.id;
    const isCurrent = () => focused.current && generation === readGeneration.current && !useAuthStore.getState().isLocked &&
      useAuthStore.getState().user?.id === owner;
    try {
      const [list, conflicts] = await Promise.all([vaultService.getAllItems(), offlineVaultService.getConflicts()]);
      if (!isCurrent()) return;
      setItems(list); setConflicts(conflicts);
      setError('');
    } catch (error) {
      if (isCurrent()) throw error;
    }
  }, []);

  const openVault = useCallback(async () => {
    const generation = focusGeneration.current;
    setLoading(true);
    try { await loadItems(); }
    catch (error) { if (focused.current && generation === focusGeneration.current) setError(getErrorMessage(error, 'Não foi possível abrir o cofre. Tente desbloqueá-lo novamente.')); }
    finally { if (focused.current && generation === focusGeneration.current) setLoading(false); }
  }, [loadItems]);

  // Reload every time the screen regains focus (e.g., returning from "new"/"[id]")
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      const generation = ++focusGeneration.current;
      const owner = useAuthStore.getState().user?.id;
      const unsubscribe = syncService.subscribe((accountId) => {
        if (!focused.current || generation !== focusGeneration.current || owner !== accountId ||
            useAuthStore.getState().user?.id !== owner || useAuthStore.getState().isLocked) return;
        void loadItems().catch((error) => {
          if (focused.current && generation === focusGeneration.current && useAuthStore.getState().user?.id === owner) {
            setError(getErrorMessage(error, 'Não foi possível atualizar o estado da sincronização. Suas senhas continuam neste aparelho.'));
          }
        });
      });
      void openVault();
      return () => { focused.current = false; focusGeneration.current += 1; readGeneration.current += 1; unsubscribe(); };
    }, [openVault, loadItems]),
  );

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await syncService.sync();
      await loadItems();
    } catch (error) { setError(`${getErrorMessage(error, 'Não foi possível sincronizar.')} Suas alterações continuam neste aparelho.`);
    } finally {
      setRefreshing(false);
    }
  }

  async function resolve(item: LocalVaultItem, keepLocal: boolean) {
    try { await offlineVaultService.resolveConflict(item.id, keepLocal); await syncService.sync(); await loadItems(); }
    catch (error) { Alert.alert('Não foi possível resolver agora', getErrorMessage(error)); }
  }

  const visible = items.filter((item) => (category === 'ALL' || item.category === category) &&
    (!favorites || item.isFavorite) && item.label.toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR')));
  const favoriteCount = items.filter((item) => item.isFavorite).length;
  const activeFilters = Number(category !== 'ALL') + Number(favorites);

  return (
    <Screen scroll={false} getKeyboardScrollResponder={getKeyboardScrollResponder}>
      <FlatList
        ref={list}
        data={visible}
        keyExtractor={(item) => item.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.primary} colors={[colors.primary]} onRefresh={handleRefresh} />}
        contentContainerStyle={{ paddingBottom: spacing.xl }}
        ListHeaderComponent={<>
          <HeroCard compact title="Meu cofre" eyebrow={user?.name ? `Olá, ${user.name.trim().split(/\s+/)[0]}.` : 'Bem-vindo de volta.'}
            description={loading ? 'Preparando suas senhas...' : error ? 'Seu cofre precisa de atenção.' : items.length ? 'Suas senhas, bem organizadas.' : 'Comece com uma senha. O resto, no seu tempo.'}>
            {!loading && !error && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
              <StatusPill label={`${items.length} ${items.length === 1 ? 'senha' : 'senhas'}`} icon="key-outline" />
              <StatusPill label={`${favoriteCount} ${favoriteCount === 1 ? 'favorita' : 'favoritas'}`} icon="star-outline" tone="warning" />
            </View>}
          </HeroCard>
          <View style={{ marginBottom: spacing.lg }}>
            <AccessibleButton label="Adicionar senha" icon="add-outline" onPress={() => router.push('/(elderly)/vault/new')} />
          </View>
          {isOffline && <Notice tone="warning" title="Você está usando o cofre local" icon="cloud-offline-outline">
            As alterações ficam neste aparelho e serão enviadas quando a conexão e a sessão online estiverem disponíveis.
          </Notice>}
          {Boolean(error) && <Notice tone="danger" title="Precisamos tentar de novo">{error}</Notice>}
          <AccessibleTextInput label="Buscar pelo nome" value={query} onChangeText={setQuery} />
          <View style={{ marginBottom: spacing.md }}>
            <AccessibleButton label={filtersOpen ? 'Fechar filtros' : `Filtrar senhas${activeFilters ? ` (${activeFilters})` : ''}`} icon="options-outline"
              variant="quiet" expanded={filtersOpen} onPress={() => setFiltersOpen(!filtersOpen)} />
          </View>
          {filtersOpen && <AccessibleCard>
          <AccessibleSwitch label="Somente favoritas" value={favorites} onValueChange={setFavorites} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
            <ChoiceChip label="Todas" selected={category === 'ALL'} onPress={() => setCategory('ALL')} />
            {categories.map((entry) => <ChoiceChip key={entry.value} label={entry.label} icon={entry.icon}
              selected={category === entry.value} onPress={() => setCategory(entry.value)} />)}
          </View>
          </AccessibleCard>}
          {conflicts.map((item) => <AccessibleCard key={item.id} highlight>
            <Notice tone="warning" title={`Duas versões de ${item.label}`}>Escolha qual alteração deseja manter. Nada será descartado sem a sua escolha.</Notice>
            {item.deleted && <AccessibleText>Esta alteração é uma exclusão.</AccessibleText>}
            <View style={{ gap: spacing.sm }}>
              <AccessibleButton label="Manter minha alteração" onPress={() => void resolve(item, true)} />
              <AccessibleButton label="Usar versão do servidor" variant="secondary" onPress={() => Alert.alert('Descartar alteração local?', item.label, [
                { text: 'Cancelar', style: 'cancel' }, { text: 'Descartar', style: 'destructive', onPress: () => void resolve(item, false) },
              ])} />
            </View>
          </AccessibleCard>)}
          <SectionHeading title={favorites ? 'Suas favoritas' : 'Suas senhas'}
            description={category === 'ALL' ? 'Toque em um item para abrir.' : `Categoria: ${categoryDetails(category).label}`} />
        </>}
        ListEmptyComponent={loading ? <LoadingState label="Abrindo seu cofre..." /> : error ?
          <AccessibleButton label="Tentar novamente" icon="refresh-outline" variant="secondary" onPress={() => void openVault()} /> : <EmptyState
          title={items.length ? 'Não encontramos essa senha' : 'Seu cofre começa aqui'}
          description={items.length ? 'Tente outro nome ou remova os filtros.' : 'Adicione uma conta que você usa no dia a dia. Dê a ela um nome fácil de lembrar.'}
          icon={items.length ? 'search-outline' : 'key-outline'}
          actionLabel={items.length ? 'Limpar busca e filtros' : undefined}
          onAction={() => { setQuery(''); setCategory('ALL'); setFavorites(false); }} />}
        ListFooterComponent={<SupportTools />}
        renderItem={({ item }) => {
          const category = categoryDetails(item.category);
          return (
          <AccessibleCard
            onPress={() => router.push(`/(elderly)/vault/${item.id}`)}
            accessibilityLabel={`${item.label}, categoria ${category.label}${item.isFavorite ? ', favorita' : ''}${
              item.requiresApproval ? ', requer aprovação de um familiar' : ''
            }${item.conflict ? ', revisar sincronização' : !item.synced ? ', aguardando sincronização' : ', sincronizada'}`}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
              <IconBadge icon={category.icon} tone={category.tone} />
              <View style={{ flex: 1 }}>
                <AccessibleText variant="bodyLarge" bold>{item.label}</AccessibleText>
                <AccessibleText variant="caption">{category.label}</AccessibleText>
              </View>
              <Ionicons name="chevron-forward-outline" size={22} color={colors.textSecondary} accessible={false} />
            </View>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }}>
              {item.isFavorite && <StatusPill label="Favorita" tone="warning" icon="star" />}
              {item.requiresApproval && <StatusPill label="Acesso assistido" icon="people-outline" />}
              <Animated.View key={item.conflict ? 'conflict' : item.synced ? 'synced' : 'pending'} accessibilityLiveRegion="polite"
                style={{ maxWidth: '100%' }}
                entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)}>
                <StatusPill label={item.conflict ? 'Revisar sincronização' : item.synced ? 'Sincronizada' : 'Aguardando sincronização'}
                  tone={item.conflict ? 'warning' : item.synced ? 'success' : 'neutral'}
                  icon={item.conflict ? 'alert-circle-outline' : item.synced ? 'checkmark-circle-outline' : 'cloud-upload-outline'} />
              </Animated.View>
            </View>
          </AccessibleCard>
        ); }}
      />
    </Screen>
  );
}
