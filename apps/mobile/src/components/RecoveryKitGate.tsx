import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { Screen } from './ui/Screen';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleButton } from './ui/AccessibleButton';
import { accountSecurityService } from '../services/account-security.service';
import { colors, spacing } from '../theme/theme';
import { AccessibleSwitch } from './ui/AccessibleSwitch';

export default function RecoveryKitGate({ email, recoverySalt, children }: { email: string; recoverySalt?: string; children: React.ReactNode }) {
  const [code, setCode] = useState<string | null | undefined>(undefined);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  async function load() {
    setError(false);
    try { setCode(await accountSecurityService.pendingKit(email, recoverySalt)); }
    catch { setError(true); }
  }
  useEffect(() => {
    let active = true;
    void accountSecurityService.pendingKit(email, recoverySalt).then((value) => { if (active) setCode(value); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [email, recoverySalt]);
  if (code === null) return <>{children}</>;
  if (code === undefined) return error ? <Screen>
    <AccessibleText variant="title">Verificar kit de recuperacao</AccessibleText>
    <AccessibleText>Conecte-se para verificar se o novo kit foi ativado.</AccessibleText>
    <AccessibleButton label="Tentar novamente" icon="refresh-outline" onPress={() => void load()} />
  </Screen> : <Screen><ActivityIndicator color={colors.primary} accessibilityLabel="Verificando kit" /></Screen>;
  async function finish() {
    setSaving(true);
    try { await accountSecurityService.acknowledgeKit(email); setCode(null); }
    catch { Alert.alert('Nao foi possivel confirmar. Tente novamente.'); }
    finally { setSaving(false); }
  }
  return <Screen>
    <AccessibleText variant="title">Seu kit de recuperacao</AccessibleText>
    <AccessibleText style={{ marginVertical: spacing.md }}>Anote este codigo e guarde fora do celular. Ele recupera seu cofre se voce esquecer a senha mestra. Nao compartilhe com familiares ou atendentes.</AccessibleText>
    <View style={{ backgroundColor: colors.surface, borderLeftWidth: 4, borderColor: colors.primary, padding: spacing.md, marginBottom: spacing.lg }}>
      {code.split('-').map((part, index) => <AccessibleText key={index} variant="bodyLarge" bold accessibilityLabel={`Grupo ${index + 1}: ${part.split('').join(' ')}`}>{part}</AccessibleText>)}
    </View>
    <AccessibleText>Este codigo substitui qualquer kit anterior. Depois da confirmacao, ele nao sera exibido novamente.</AccessibleText>
    <View style={{ marginVertical: spacing.lg }}><AccessibleSwitch label="Guardei o codigo fora deste aparelho"
      value={checked} onValueChange={setChecked} disabled={saving} /></View>
    <AccessibleButton label="Confirmar e continuar" icon="checkmark-outline" loading={saving} disabled={!checked} onPress={() => void finish()} />
  </Screen>;
}