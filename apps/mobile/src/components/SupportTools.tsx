import { useState } from 'react';
import { Modal, View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { textScales, useAccessibilityStore } from '../stores/accessibility.store';
import { useThemeColors } from '../hooks/useThemeColors';
import { spacing } from '../theme/theme';
import { Screen } from './ui/Screen';
import { AccessibleButton } from './ui/AccessibleButton';
import { AccessibleCard } from './ui/AccessibleCard';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleSwitch } from './ui/AccessibleSwitch';
import { ChoiceChip } from './ui/ChoiceChip';
import { IconBadge, Notice, ScreenHeading, SectionHeading } from './ui/Presentation';

export function ReadingPreferences() {
  const { textScale, highContrast, setTextScale, setHighContrast } = useAccessibilityStore();
  const [error, setError] = useState('');
  async function save(operation: Promise<void>) {
    setError('');
    try { await operation; }
    catch { setError('O ajuste foi aplicado, mas não foi possível salvar sua preferência. Tente novamente.'); }
  }
  return <View style={{ gap: spacing.md }}>
    <AccessibleText>Escolha o tamanho mais confortável para você.</AccessibleText>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
      {textScales.map((scale) => <ChoiceChip key={scale} label={`${Math.round(scale * 100)}%`}
        selected={textScale === scale} onPress={() => void save(setTextScale(scale))} />)}
    </View>
    <AccessibleSwitch label="Contraste reforçado" description="Contornos mais marcados e cores de alto contraste."
      value={highContrast} onValueChange={(enabled) => void save(setHighContrast(enabled))} />
    {Boolean(error) && <Notice tone="danger">{error}</Notice>}
    <AccessibleText variant="caption">O tamanho de texto do Android também é respeitado. As animações seguem a opção de reduzir movimento do aparelho.</AccessibleText>
  </View>;
}

export function SupportTools() {
  const [panel, setPanel] = useState<'reading' | 'help' | null>(null);
  const reducedMotion = useReducedMotion();
  const colors = useThemeColors();
  return <>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.md }}>
      <View style={{ flexGrow: 1, flexBasis: 150 }}>
        <AccessibleButton label="Ajustar leitura" icon="text-outline" variant="quiet" onPress={() => setPanel('reading')} />
      </View>
      <View style={{ flexGrow: 1, flexBasis: 150 }}>
        <AccessibleButton label="Como funciona" icon="help-circle-outline" variant="quiet" onPress={() => setPanel('help')} />
      </View>
    </View>
    <Modal visible={panel !== null} animationType={reducedMotion ? 'none' : 'fade'} onRequestClose={() => setPanel(null)}>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: colors.background }}>
        <Screen style={{ maxWidth: 640 }}>
          <View style={{ marginBottom: spacing.lg }}>
            <AccessibleButton label="Fechar e voltar" icon="close-outline" variant="secondary" onPress={() => setPanel(null)} />
          </View>
          <ScreenHeading title={panel === 'reading' ? 'Do seu jeito' : 'Um passo de cada vez'}
            description={panel === 'reading' ? 'Deixe a leitura confortável.' : 'Um guia rápido, sem sair do aplicativo.'}
            icon={panel === 'reading' ? 'text-outline' : 'compass-outline'} />
          {panel === 'reading' ? <AccessibleCard><ReadingPreferences /></AccessibleCard> : <>
            <AccessibleCard>
              <IconBadge icon="key-outline" tone="primary" />
              <View style={{ marginTop: spacing.md }}><SectionHeading title="1. Entre no seu cofre" /></View>
              <AccessibleText>Use o e-mail ou celular escolhido no cadastro e sua senha mestra. Em Minha conta → Configurar PIN, digital ou rosto, você pode ativar o bloqueio do celular como opção principal e a biometria compatível como alternativa. A senha mestra continua disponível, mesmo sem internet. Quem conhece o bloqueio do celular poderá abrir o cofre após essa ativação. Não enviamos códigos por SMS; guarde seu kit de recuperação.</AccessibleText>
            </AccessibleCard>
            <AccessibleCard>
              <IconBadge icon="add-circle-outline" tone="coral" />
              <View style={{ marginTop: spacing.md }}><SectionHeading title="2. Guarde e encontre" /></View>
              <AccessibleText>Em “Adicionar senha”, dê um nome fácil de reconhecer. Use a busca, as categorias e os favoritos para encontrar o que precisa.</AccessibleText>
            </AccessibleCard>
            <AccessibleCard>
              <IconBadge icon="people-outline" tone="accent" />
              <View style={{ marginTop: spacing.md }}><SectionHeading title="3. Conte com alguém" /></View>
              <AccessibleText>O familiar cria a própria conta. Você envia um convite e, após o aceite, escolhe se ele pode aprovar pedidos. Ele não recebe suas senhas.</AccessibleText>
            </AccessibleCard>
            <Notice tone="warning" title="Seu kit merece cuidado" icon="document-lock-outline">
              Guarde o kit de recuperação fora do celular. Sem senha, kit válido ou chave local disponível, não é possível recuperar o conteúdo do cofre.
            </Notice>
            <AccessibleText variant="caption">Este guia é local: não envia perguntas nem dados para um chatbot.</AccessibleText>
          </>}
        </Screen>
      </View>
    </Modal>
  </>;
}
