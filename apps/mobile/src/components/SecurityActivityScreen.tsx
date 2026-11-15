import { useCallback, useRef, useState } from 'react';
import { FlatList, RefreshControl, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { securityApiService, type SecurityEvent } from '../services/security-api.service';
import { useAuthStore } from '../stores/auth.store';
import { getErrorMessage } from '../services/error-messages';
import { Screen } from './ui/Screen';
import { AccessibleCard } from './ui/AccessibleCard';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleButton } from './ui/AccessibleButton';
import { EmptyState, LoadingState, Notice, ScreenHeading, StatusPill } from './ui/Presentation';
import { useThemeColors } from '../hooks/useThemeColors';
import { spacing } from '../theme/theme';

const titles: Record<SecurityEvent['type'], string> = {
  PASSWORD_CHANGED: 'Senha mestra alterada', RECOVERY_KIT_REPLACED: 'Kit de recuperação atualizado',
  ACCOUNT_RECOVERED: 'Conta recuperada com o kit', NEW_DEVICE: 'Entrada de uma instalação ainda não conhecida',
  FAILED_LOGIN_BURST: 'Várias tentativas de entrada incorretas', ACCESS_REQUEST_BURST: 'Muitos pedidos aguardando ou enviados rapidamente',
  BULK_REVEAL: 'Várias consultas de senhas solicitadas em pouco tempo', BULK_COPY: 'Várias cópias solicitadas em pouco tempo',
  BULK_DELETE: 'Várias exclusões solicitadas em pouco tempo', EMERGENCY_BURST: 'Vários relatos de emergência',
  EMERGENCY_AFTER_DENIAL: 'Relato de emergência após uma negativa', SESSIONS_REVOKED: 'Sessões encerradas pelo titular',
};

export default function SecurityActivityScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const user = useAuthStore((state) => state.user);
  const [items, setItems] = useState<SecurityEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async (next?: string) => {
    if (!active.current || controller.current) return;
    const owner = useAuthStore.getState().user?.id;
    const expected = generation.current;
    const request = new AbortController(); controller.current = request;
    const current = () => active.current && generation.current === expected && !request.signal.aborted &&
      useAuthStore.getState().user?.id === owner && !useAuthStore.getState().isLocked;
    setLoading(true);
    try {
      const page = await securityApiService.events(next, request.signal);
      if (!current()) return;
      setItems((old) => next ? [...old, ...page.items.filter((entry) => !old.some((item) => item.id === entry.id))] : page.items);
      setCursor(page.nextCursor); setError('');
    } catch (error) { if (current()) setError(getErrorMessage(error, 'Não foi possível atualizar os avisos. Confira a conexão.')); }
    finally { if (controller.current === request) controller.current = null; if (current()) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => {
    active.current = true; void load();
    return () => { active.current = false; generation.current += 1; controller.current?.abort(); controller.current = null; setItems([]); setCursor(null); };
  }, [load]));
  return <Screen scroll={false}>
    <FlatList data={items} keyExtractor={(item) => item.id} contentContainerStyle={{ paddingBottom: spacing.lg }}
      refreshControl={<RefreshControl refreshing={loading} colors={[colors.primary]} tintColor={colors.primary} onRefresh={() => void load()} />}
      ListHeaderComponent={<>
        <ScreenHeading title="Avisos de segurança" icon="shield-checkmark-outline" description="Acompanhe cuidados com a conta. Aviso não significa confirmação de fraude." onBack={() => router.back()} />
        <Notice tone="primary">Os avisos ficam por 90 dias. Não incluem senhas, kit ou localização. Familiares ativos com permissão para aprovar acessos também podem recebê-los.</Notice>
        {Boolean(error) && <Notice tone="danger">{error}</Notice>}
      </>}
      ListEmptyComponent={loading ? <LoadingState label="Conferindo os avisos..." /> : error ? <AccessibleButton label="Tentar novamente" onPress={() => void load()} />
        : <EmptyState title="Nenhum aviso por aqui" description="Mudanças de segurança e atividades incomuns aparecerão nesta lista." />}
      ListFooterComponent={cursor ? <AccessibleButton label="Carregar mais avisos" variant="secondary" loading={loading} onPress={() => void load(cursor)} /> : null}
      renderItem={({ item }) => <AccessibleCard highlight={item.id === eventId}>
        <StatusPill label={item.severity === 'WARNING' ? 'Confira esta atividade' : 'Mudança registrada'}
          tone={item.severity === 'WARNING' ? 'warning' : 'primary'} icon="shield-checkmark-outline" />
        <AccessibleText variant="bodyLarge" bold style={{ marginTop: spacing.md }}>{titles[item.type]}</AccessibleText>
        <AccessibleText>Conta de {item.user.name}</AccessibleText>
        <AccessibleText variant="caption">{new Date(item.occurredAt).toLocaleString('pt-BR')}</AccessibleText>
        {item.count > 1 && <AccessibleText variant="caption">{item.count} ocorrências informadas neste aviso.</AccessibleText>}
        <AccessibleText variant="caption" style={{ marginTop: spacing.sm }}>{item.source === 'DEVICE_REPORT'
          ? 'Relato enviado pelo aplicativo. Não comprova sozinho o que aconteceu no aparelho.'
          : 'Registro da operação ou das tentativas recebidas pelo servidor.'}</AccessibleText>
        {item.type === 'NEW_DEVICE' && <AccessibleText variant="caption">Reinstalar o aplicativo também pode gerar este aviso. O código da instalação não é prova de identidade.</AccessibleText>}
        {item.user.id === user?.id && <View style={{ marginTop: spacing.md }}>
          <AccessibleButton label="Revisar minhas sessões" icon="phone-portrait-outline" variant="secondary"
            onPress={() => router.push(user.role === 'CAREGIVER' ? '/(caregiver)/sessions' : '/(elderly)/sessions')} />
        </View>}
      </AccessibleCard>}
    />
  </Screen>;
}
