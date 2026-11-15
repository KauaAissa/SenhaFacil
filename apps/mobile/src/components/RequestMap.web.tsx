import { useEffect, useState } from 'react';
import { Notice, LoadingState } from './ui/Presentation';

export default function RequestMap({ url }: { url: string }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => { if (!loaded) setFailed(true); }, 20_000);
    return () => clearTimeout(timer);
  }, [loaded]);
  return failed ? <Notice tone="warning">Não foi possível carregar o mapa. Confira a conexão e abra o mapa novamente.</Notice> : <>
    {!loaded && <LoadingState label="Carregando o mapa deste pedido..." />}
    <iframe title="Mapa da posição pontual no envio do pedido" src={url} height={300}
      style={{ width: '100%', border: 0 }} referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin" allow="geolocation 'none'"
      onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
  </>;
}
