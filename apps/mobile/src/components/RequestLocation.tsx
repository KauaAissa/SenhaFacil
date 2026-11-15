import { useEffect, useMemo, useState } from 'react';
import { AppState, View } from 'react-native';
import type { AccessRequestLocation } from '../services/access-api.service';
import { spacing } from '../theme/theme';
import { AccessibleText } from './ui/AccessibleText';
import { Notice } from './ui/Presentation';
import { AccessibleButton } from './ui/AccessibleButton';
import { requestMapUrl } from '../services/request-map';
import RequestMap from './RequestMap';

export function RequestLocation({ location, historyExpiresAt }: { location?: AccessRequestLocation | null; historyExpiresAt?: string }) {
  if (!location) return (
    <View style={{ marginBottom: spacing.md }}>
      <Notice tone="warning" title="Localização indisponível">
        Não foi possível compartilhar uma posição neste pedido. Isso não confirma que o titular esteja em um local seguro. Se precisar, fale com ele antes de decidir.
      </Notice>
    </View>
  );
  return <LocationDetails key={location.capturedAt} location={location} historyExpiresAt={historyExpiresAt} />;
}

function LocationDetails({ location, historyExpiresAt }: { location: AccessRequestLocation; historyExpiresAt?: string }) {
  const [showMap, setShowMap] = useState(false);
  const [confirmMap, setConfirmMap] = useState(false);
  const mapUrl = useMemo(() => {
    try { return requestMapUrl(location); }
    catch (error) {
      if (error instanceof Error && error.message === 'REQUEST_MAP_INVALID_LOCATION') return null;
      throw error;
    }
  }, [location.latitude, location.longitude, location.accuracy, location.capturedAt]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') { setShowMap(false); setConfirmMap(false); }
    });
    return () => subscription.remove();
  }, []);
  if (!mapUrl) return <Notice tone="warning" title="Localização indisponível">A posição deste pedido não está válida. Atualize os pedidos ou fale com o titular antes de decidir.</Notice>;
  return (
    <View style={{ gap: spacing.sm, marginBottom: spacing.md }}>
      <Notice tone="primary" title={historyExpiresAt ? 'Localização registrada no pedido' : 'Localização no envio'}>
        {historyExpiresAt ? 'Este é o ponto informado no envio daquele pedido. Não representa a posição atual nem comprova identidade.'
          : 'Esta é uma posição pontual informada pelo aparelho, não um acompanhamento de trajeto nem uma prova de identidade.'}
      </Notice>
      <AccessibleText bold>Onde o pedido foi enviado</AccessibleText>
      <AccessibleText>Horário: {new Date(location.capturedAt).toLocaleString('pt-BR')}.</AccessibleText>
      <AccessibleText>A posição pode variar em cerca de {Math.ceil(location.accuracy).toLocaleString('pt-BR')} metros ao redor do ponto.</AccessibleText>
      {showMap ? <>
        <RequestMap url={mapUrl} />
        <AccessibleButton label="Fechar mapa" variant="quiet" onPress={() => setShowMap(false)} />
      </> : confirmMap ? <View style={{ gap: spacing.sm }}>
        <Notice tone="warning" title="Carregar este ponto no mapa?">O OpenStreetMap receberá as coordenadas deste pedido e seu endereço de internet para exibir o mapa. Isso não inicia rastreamento. O provedor pode registrar o acesso conforme sua política de privacidade.</Notice>
        <AccessibleButton label="Permitir e carregar mapa" icon="map-outline" onPress={() => { setConfirmMap(false); setShowMap(true); }} />
        <AccessibleButton label="Agora não" variant="quiet" onPress={() => setConfirmMap(false)} />
      </View> : <AccessibleButton label="Ver mapa neste pedido" icon="map-outline" variant="secondary" onPress={() => setConfirmMap(true)} />}
      <AccessibleText variant="caption">O ponto é aproximado e não comprova a presença do titular.</AccessibleText>
      <AccessibleText variant="caption">{historyExpiresAt
        ? `Disponível até ${new Date(historyExpiresAt).toLocaleString('pt-BR')}, conforme a autorização do titular. Depois, o mapa será removido do histórico.`
        : 'Se o titular autorizou guardar este ponto, ele ficará no histórico por até 30 dias após o envio, somente em pedidos autorizados ou negados. Sem essa autorização ou em pedidos cancelados/expirados, as coordenadas são apagadas.'}</AccessibleText>
    </View>
  );
}
