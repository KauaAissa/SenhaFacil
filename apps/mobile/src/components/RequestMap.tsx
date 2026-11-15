import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Alert, Linking, TurboModuleRegistry, View } from 'react-native';
import type { WebViewProps } from 'react-native-webview';
import { canNavigateRequestMap, isMapCopyrightUrl, MAP_COPYRIGHT_URL, mapPresentationScript } from '../services/request-map';
import { Notice, LoadingState } from './ui/Presentation';
import { AccessibleButton } from './ui/AccessibleButton';
import { spacing } from '../theme/theme';
import { getErrorMessage } from '../services/error-messages';

export default function RequestMap({ url }: { url: string }) {
  const [MapView, setMapView] = useState<ComponentType<WebViewProps> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const openingCopyright = useRef(false);
  async function openCopyright() {
    if (openingCopyright.current) return;
    openingCopyright.current = true;
    try { await Linking.openURL(MAP_COPYRIGHT_URL); }
    catch (error) { Alert.alert('Não foi possível abrir a licença', getErrorMessage(error, 'Você pode consultar a origem e a licença dos dados em openstreetmap.org/copyright.')); }
    finally { openingCopyright.current = false; }
  }
  useEffect(() => {
    let active = true;
    if (!TurboModuleRegistry.get('RNCWebViewModule')) {
      setLoading(false);
      setError('Instale a nova versão Android do Senha Fácil para ver o mapa dentro do aplicativo.');
      return;
    }
    void import('react-native-webview').then((module) => {
      if (active) setMapView(() => module.WebView);
    }).catch(() => {
      if (active) { setLoading(false); setError('Não foi possível iniciar o mapa. Tente novamente ou confira a atualização do aplicativo.'); }
    });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (!loading) return;
    const timer = setTimeout(() => {
      setLoading(false); setError('O mapa demorou para carregar. Confira a internet e tente novamente.');
    }, 20_000);
    return () => clearTimeout(timer);
  }, [loading, attempt]);
  return <View style={{ gap: spacing.sm }}>
    {loading && <LoadingState label="Carregando o mapa deste pedido..." />}
    {error ? <>
      <Notice tone="warning">{error}</Notice>
      {MapView && <AccessibleButton label="Tentar carregar mapa novamente" variant="secondary" onPress={() => {
        setError(''); setLoading(true); setAttempt((current) => current + 1);
      }} />}
    </> : MapView && <MapView key={`${url}:${attempt}`} source={{ uri: url }} style={{ height: 300, width: '100%', backgroundColor: '#F6F5EE' }}
      accessibilityLabel="Mapa da posição pontual no envio do pedido"
      applicationNameForUserAgent="SenhaFacil/0.1"
      incognito
      cacheEnabled={false}
      injectedJavaScript={mapPresentationScript}
      geolocationEnabled={false}
      domStorageEnabled={false}
      thirdPartyCookiesEnabled={false}
      sharedCookiesEnabled={false}
      mixedContentMode="never"
      allowFileAccess={false}
      allowFileAccessFromFileURLs={false}
      allowUniversalAccessFromFileURLs={false}
      javaScriptCanOpenWindowsAutomatically={false}
      setSupportMultipleWindows
      originWhitelist={['https://www.openstreetmap.org']}
      onShouldStartLoadWithRequest={(request) => {
        if (isMapCopyrightUrl(request.url)) { void openCopyright(); return false; }
        return canNavigateRequestMap(request.url, url);
      }}
      onOpenWindow={(event) => { if (isMapCopyrightUrl(event.nativeEvent.targetUrl)) void openCopyright(); }}
      onLoadEnd={() => setLoading(false)}
      onError={() => { setLoading(false); setError('Não foi possível carregar o mapa. Confira a internet e tente novamente.'); }}
      onHttpError={() => { setLoading(false); setError('O serviço de mapas está indisponível agora. O horário e a precisão continuam disponíveis.'); }}
    />}
  </View>;
}
