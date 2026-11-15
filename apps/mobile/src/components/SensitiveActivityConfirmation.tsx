import { useCallback, useRef, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useAuthStore, type UnlockMethod } from '../stores/auth.store';
import { vaultActivityService } from '../services/vault-activity.service';
import { getErrorMessage } from '../services/error-messages';
import { AccessibleCard } from './ui/AccessibleCard';
import { AccessibleTextInput } from './ui/AccessibleTextInput';
import { AccessibleButton } from './ui/AccessibleButton';
import { Notice, SectionHeading } from './ui/Presentation';
import { spacing } from '../theme/theme';
import { sensitiveClipboard } from '../services/clipboard.service';

export function SensitiveActivityConfirmation({ onConfirmed, onCancel }: {
  onConfirmed: () => Promise<void>; onCancel: () => void;
}) {
  const { biometrics, deviceLock, reauthenticate, isLoading } = useAuthStore();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef(false);
  const inFlight = useRef(false);
  useFocusEffect(useCallback(() => {
    active.current = true;
    void sensitiveClipboard.clear().catch((error) => {
      if (active.current) setError(getErrorMessage(error, 'Não foi possível limpar a cópia anterior. Feche o aplicativo ou confira a área de transferência antes de continuar.'));
    });
    return () => { active.current = false; setPassword(''); };
  }, []));
  async function confirm(method: UnlockMethod | 'password') {
    if (inFlight.current) return;
    const owner = useAuthStore.getState().user?.id;
    const entered = password;
    setPassword(''); setError(''); setBusy(true); inFlight.current = true;
    const current = () => active.current && owner === useAuthStore.getState().user?.id && !useAuthStore.getState().isLocked;
    try {
      await reauthenticate(method === 'password' ? entered : undefined, method === 'device' ? 'device' : 'biometric');
      if (!current()) return;
      await vaultActivityService.confirmedAfterAuthentication();
      if (current()) await onConfirmed();
    } catch (error) { if (current()) setError(getErrorMessage(error, 'Não foi possível confirmar. Tente novamente ou volte ao cofre.')); }
    finally { inFlight.current = false; if (active.current) setBusy(false); }
  }
  return <AccessibleCard highlight>
    <SectionHeading title="Confirme que é você" description="Foram feitas várias ações em pouco tempo. Esta confirmação protege o cofre sem apagar suas senhas." />
    <Notice tone="warning">Um aviso foi registrado neste aparelho e será enviado quando houver conexão. Você e familiares autorizados poderão consultá-lo. Isso não significa fraude. Após confirmar, você poderá continuar por um minuto.</Notice>
    {Boolean(error) && <Notice tone="danger">{error}</Notice>}
    <View style={{ gap: spacing.md }}>
      {deviceLock?.enabled && deviceLock.available && <AccessibleButton label="Confirmar com bloqueio do celular" icon="phone-portrait-outline"
        loading={busy} disabled={isLoading} onPress={() => void confirm('device')} />}
      {biometrics?.enabled && biometrics.available && <AccessibleButton label={`Confirmar com ${biometrics.label}`} icon="finger-print-outline"
        variant="secondary" disabled={busy || isLoading} onPress={() => void confirm('biometric')} />}
      <AccessibleTextInput label="Senha mestra" value={password} onChangeText={setPassword} secureTextEntry
        maxLength={128} editable={!busy && !isLoading} onSubmitEditing={() => { if (password) void confirm('password'); }} />
      <AccessibleButton label="Confirmar com senha mestra" icon="key-outline" loading={busy} disabled={!password || isLoading}
        onPress={() => void confirm('password')} />
      <AccessibleButton label="Voltar sem continuar" variant="quiet" disabled={busy || isLoading} onPress={onCancel} />
    </View>
  </AccessibleCard>;
}
