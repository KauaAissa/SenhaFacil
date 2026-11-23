import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Screen } from './ui/Screen';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleButton } from './ui/AccessibleButton';
import { accountSecurityService } from '../services/account-security.service';
import { spacing, radii } from '../theme/theme';
import { useThemeColors } from '../hooks/useThemeColors';
import { AccessibleSwitch } from './ui/AccessibleSwitch';
import { HeroCard, Notice, LoadingState, ScreenHeading } from './ui/Presentation';
import { AccessibleCard } from './ui/AccessibleCard';
import { getErrorMessage } from '../services/error-messages';
import { sensitiveClipboard } from '../services/clipboard.service';

export default function RecoveryKitGate({ identifier, recoverySalt, children }: { identifier: string; recoverySalt?: string; children: React.ReactNode }) {
  const colors = useThemeColors();
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  async function load() {
    setError(false);
    try { setCode(await accountSecurityService.pendingKit(identifier, recoverySalt)); }
    catch { setError(true); }
  }
  useEffect(() => {
    let active = true;
    void accountSecurityService.pendingKit(identifier, recoverySalt).then((value) => { if (active) setCode(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [identifier, recoverySalt]);
  if (code === null) return <>{children}</>;
  if (code === undefined) return error ? <Screen>
    <ScreenHeading title="Verificar kit de recuperação" icon="document-lock-outline" />
    <Notice tone="warning">Conecte-se para verificar se o novo kit foi ativado. Seu código não será substituído sem essa confirmação.</Notice>
    <AccessibleButton label="Tentar novamente" icon="refresh-outline" onPress={() => void load()} />
  </Screen> : <Screen><LoadingState label="Verificando seu kit de recuperação..." /></Screen>;
  function copyKit() {
    const value = code;
    if (!value) return;
    Alert.alert('Copiar kit de recuperação', 'O código completo ficará disponível para colar em outro aplicativo por até 5 minutos. Cole em um local seguro, como um gerenciador de senhas ou uma anotação protegida.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Copiar', onPress: async () => {
        try { await sensitiveClipboard.copy(value); setCopied(true); }
        catch (error) { Alert.alert('Não foi possível copiar', getErrorMessage(error, 'O código não foi copiado. Tente novamente.')); }
      } },
    ]);
  }
  async function finish() {
    setSaving(true);
    try { await accountSecurityService.acknowledgeKit(identifier); setCode(null); }
    catch (error) { Alert.alert('Não foi possível confirmar', getErrorMessage(error)); }
    finally { setSaving(false); }
  }
  return <Screen style={{ maxWidth: 640 }}>
    <HeroCard title="Seu plano de recuperação" eyebrow="UM PASSO IMPORTANTE" icon="document-lock-outline"
      description="Guarde este código fora do celular. Ele ajuda a recuperar seu cofre se você esquecer a senha mestra." />
    <AccessibleCard>
      <AccessibleText variant="bodyLarge" bold accessibilityRole="header" style={{ marginBottom: spacing.md }}>Seu kit de recuperação</AccessibleText>
      <View style={{ gap: spacing.sm }}>
        {code.split('-').map((part, index) => <View key={index} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md,
          backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.border, borderRadius: radii.sm, padding: spacing.md }}>
          <AccessibleText variant="caption" accessible={false}>{index + 1}</AccessibleText>
          <AccessibleText variant="bodyLarge" bold style={{ flex: 1 }} accessibilityLabel={`Grupo ${index + 1}: ${part.split('').join(' ')}`}>{part}</AccessibleText>
        </View>)}
      </View>
      <View style={{ marginTop: spacing.md }}>
        <AccessibleButton label={copied ? 'Copiar novamente' : 'Copiar código completo'} icon="copy-outline" variant="secondary"
          accessibilityHint="Copia todos os grupos do código de uma só vez" disabled={saving} onPress={copyKit} />
      </View>
      {copied && <View style={{ marginTop: spacing.md }}><Notice tone="success" title="Código copiado" icon="checkmark-circle-outline">
        Cole agora em um local seguro fora deste aparelho. A cópia será apagada automaticamente em até 5 minutos.</Notice></View>}
    </AccessibleCard>
    <Notice tone="warning" title="Este código é só seu" icon="hand-left-outline">Não compartilhe com familiares ou atendentes. Ele substitui qualquer kit anterior e não será exibido novamente após a confirmação.</Notice>
    <View style={{ marginVertical: spacing.lg }}><AccessibleSwitch label="Guardei o codigo fora deste aparelho"
      value={checked} onValueChange={setChecked} disabled={saving} /></View>
    <AccessibleButton label="Confirmar e continuar" icon="checkmark-outline" loading={saving} disabled={!checked} onPress={() => void finish()} />
  </Screen>;
}