import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, View, FlatList, RefreshControl } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Screen } from './ui/Screen';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleCard } from './ui/AccessibleCard';
import { accessApiService, hasHistoryLocation, type AccessHistoryEntry, type AccessHistoryLocation } from '../services/access-api.service';
import { spacing, type Tone } from '../theme/theme';
import { useThemeColors } from '../hooks/useThemeColors';
import { AccessibleButton } from './ui/AccessibleButton';
import { ScreenHeading, StatusPill, Notice, IconBadge, LoadingState, EmptyState, type IconName } from './ui/Presentation';
import type { AccessStatus } from '../services/access-api.service';
import { getErrorMessage } from '../services/error-messages';
import { apiClient } from '../services/api.client';
import { useAuthStore } from '../stores/auth.store';
import { RequestLocation } from './RequestLocation';
import { connectivityService } from '../services/connectivity.service';

const statuses: Record<AccessStatus, { label: string; tone: Tone; icon: IconName }> = {
  PENDING: { label: 'Aguardando resposta', tone: 'warning', icon: 'time-outline' },
  APPROVED: { label: 'Autorizado', tone: 'success', icon: 'checkmark-circle-outline' },
  DENIED: { label: 'Não autorizado', tone: 'danger', icon: 'close-circle-outline' },
  EXPIRED: { label: 'Prazo encerrado', tone: 'neutral', icon: 'hourglass-outline' },
  FALLBACK_GRANTED: { label: 'Emergência informada', tone: 'warning', icon: 'cloud-offline-outline' },
  CANCELLED: { label: 'Cancelado', tone: 'neutral', icon: 'remove-circle-outline' },
};

export default function AccessHistoryScreen() {
  const colors = useThemeColors();
  const [items, setItems] = useState<AccessHistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cursor, setCursor] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const generation = useRef(0);
  const active = useRef(false);
  const busy = useRef(false);
  const load = useCallback(async (next?: string) => {
    if (busy.current || !active.current || AppState.currentState !== 'active') return;
    busy.current = true;
    const current = generation.current;
    const owner = useAuthStore.getState().user?.id;
    const isCurrent = () => active.current && current === generation.current && AppState.currentState === 'active' &&
      !useAuthStore.getState().isLocked && useAuthStore.getState().user?.id === owner;
    setLoading(true);
    try {
      const page = await accessApiService.historyPage(next);
      if (!isCurrent()) return;
      setItems((previous) => next ? [...previous, ...page.items.filter((item) => !previous.some((old) => old.id === item.id))] : page.items);
      setCursor(page.nextCursor); setError('');
    } catch (error) {
      if (isCurrent()) { setExpandedId(null); setError(getErrorMessage(error, 'Histórico indisponível. Verifique a conexão.')); }
    }
    finally { if (current === generation.current) { busy.current = false; setLoading(false); } }
  }, []);
  useFocusEffect(useCallback(() => {
    active.current = true;
    void load();
    return () => { active.current = false; generation.current += 1; busy.current = false; setExpandedId(null); setItems([]); setCursor(null); };
  }, [load]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { generation.current += 1; busy.current = false; setExpandedId(null); }
      else if (active.current) void load();
    });
    return () => subscription.remove();
  }, [load]);
  return (
    <Screen scroll={false}>
      <FlatList data={items} keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingBottom: spacing.lg }}
        ListHeaderComponent={<>
          <ScreenHeading title="Histórico de acessos" eyebrow="CADA CUIDADO, REGISTRADO" icon="time-outline"
            description="Acompanhe pedidos, respostas e acessos de emergência." />
          <Notice tone="neutral">Em pedidos autorizados ou negados, o ponto do envio pode ficar disponível por 30 dias, se o titular autorizou. Pontos antigos já apagados não podem ser recuperados.</Notice>
          {Boolean(error) && <Notice tone="danger">{error}</Notice>}
        </>}
        refreshControl={<RefreshControl refreshing={loading} colors={[colors.primary]} tintColor={colors.primary} onRefresh={() => void load()} />}
        ListFooterComponent={cursor ? <AccessibleButton label="Carregar mais" icon="chevron-down-outline" variant="secondary"
          loading={loading} onPress={() => void load(cursor)} /> : null}
        ListEmptyComponent={loading ? <LoadingState label="Carregando seu histórico..." /> : error ?
          <AccessibleButton label="Tentar novamente" variant="secondary" onPress={() => void load()} /> :
          <EmptyState title="Uma história para acompanhar" description="Quando houver um pedido ou acesso de emergência, ele ficará registrado aqui." icon="time-outline" />}
        renderItem={({ item }) => {
          const status = statuses[item.status];
          return (
          <AccessibleCard>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.md }}>
              <IconBadge icon={status.icon} tone={status.tone} />
              <View style={{ flex: 1 }}><StatusPill label={status.label} tone={status.tone} />
                <AccessibleText variant="caption" style={{ marginTop: spacing.xs }}>{new Date(item.requestedAt).toLocaleString('pt-BR')}</AccessibleText>
              </View>
            </View>
            <AccessibleText variant="bodyLarge" bold>{item.vaultItem.label}</AccessibleText>
            <AccessibleText variant="body">Solicitado por {item.requester.name}</AccessibleText>
            {item.approver && <AccessibleText variant="caption">Resposta de {item.approver.name}</AccessibleText>}
            {Boolean(item.notes) && <View style={{ marginTop: spacing.md }}><Notice title="Motivo informado" tone="neutral">{item.notes}</Notice></View>}
            {item.fallbackUsed && <AccessibleText variant="caption" style={{ marginTop: spacing.md }}>Relato enviado pelo aparelho após uso offline.</AccessibleText>}
            {hasHistoryLocation(item, apiClient.getServerTime()) && item.locationHistoryExpiresAt && <View style={{ gap: spacing.md, marginTop: spacing.md }}>
              <AccessibleButton label={expandedId === item.id ? 'Fechar localização do pedido' : 'Ver localização deste pedido'}
                icon="map-outline" variant="secondary" expanded={expandedId === item.id}
                onPress={() => setExpandedId((current) => current === item.id ? null : item.id)} />
              {expandedId === item.id && <HistoryLocationDetails key={item.id} id={item.id} availableUntil={item.locationHistoryExpiresAt} />}
            </View>}
          </AccessibleCard>
        ); }} />
    </Screen>
  );
}

function HistoryLocationDetails({ id, availableUntil }: { id: string; availableUntil: string }) {
  const [value, setValue] = useState<AccessHistoryLocation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expired, setExpired] = useState(false);
  const active = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (!active.current || controller.current || AppState.currentState !== 'active') return;
    if (Date.parse(availableUntil) <= apiClient.getServerTime()) {
      setValue(null); setExpired(true); return;
    }
    if (!connectivityService.isOnline) {
      setValue(null); setError('Conecte-se à internet para conferir a permissão e consultar este ponto.'); return;
    }
    const owner = useAuthStore.getState().user?.id;
    const request = new AbortController();
    controller.current = request;
    const isCurrent = () => active.current && controller.current === request && !request.signal.aborted &&
      !useAuthStore.getState().isLocked && useAuthStore.getState().user?.id === owner;
    setLoading(true);
    try {
      const response = await accessApiService.historyLocation(id, request.signal);
      if (!isCurrent()) return;
      if (Math.min(Date.parse(response.historyExpiresAt), Date.parse(availableUntil)) <= apiClient.getServerTime()) {
        setValue(null); setExpired(true); return;
      }
      setValue(response); setError('');
    } catch (error) {
      if (isCurrent()) { setValue(null); setError(getErrorMessage(error, 'Não foi possível conferir este ponto. Atualize o histórico antes de tentar novamente.')); }
    } finally {
      if (controller.current === request) { controller.current = null; if (active.current) setLoading(false); }
    }
  }, [id, availableUntil]);
  useFocusEffect(useCallback(() => {
    active.current = true;
    void load();
    const interval = setInterval(() => void load(), 15_000);
    const unsubscribe = connectivityService.subscribe((online) => {
      if (!online) {
        controller.current?.abort(); controller.current = null;
        setLoading(false); setValue(null); setError('Conecte-se à internet para conferir a permissão e consultar este ponto.');
      }
    });
    return () => {
      active.current = false; controller.current?.abort(); controller.current = null;
      clearInterval(interval); unsubscribe(); setValue(null);
    };
  }, [load]));
  const expiry = Math.min(Date.parse(availableUntil), Date.parse(value?.historyExpiresAt ?? availableUntil));
  useEffect(() => {
    const timer = setInterval(() => {
      if (expiry > apiClient.getServerTime()) return;
      controller.current?.abort(); controller.current = null; setLoading(false); setValue(null); setExpired(true);
    }, 1_000);
    return () => clearInterval(timer);
  }, [expiry]);
  if (expired) return <Notice tone="neutral">Os 30 dias deste ponto terminaram. O registro do pedido continua no histórico, sem mapa.</Notice>;
  if (value) return <RequestLocation location={value.location} historyExpiresAt={new Date(expiry).toISOString()} />;
  if (error) return <View style={{ gap: spacing.sm }}>
    <Notice tone="warning">{error}</Notice>
    <AccessibleButton label="Consultar localização novamente" variant="secondary" onPress={() => void load()} loading={loading} />
  </View>;
  return <LoadingState label="Conferindo a localização e sua permissão..." />;
}