import { useCallback, useEffect, useState } from 'react';
import { Alert, Linking, Platform, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Screen } from './ui/Screen';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleTextInput } from './ui/AccessibleTextInput';
import { AccessibleButton } from './ui/AccessibleButton';
import { AccessibleCard } from './ui/AccessibleCard';
import { ChoiceChip } from './ui/ChoiceChip';
import { ScreenHeading, SectionHeading, Notice, StatusPill } from './ui/Presentation';
import { useAuthStore, type UnlockMethod } from '../stores/auth.store';
import { spacing } from '../theme/theme';
import { getErrorMessage } from '../services/error-messages';

type Section = 'unlock' | 'password' | 'recovery';
function sectionFrom(value?: string): Section {
  return value === 'password' || value === 'recovery' ? value : 'unlock';
}

export default function SecurityScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ section?: string }>();
  const { changePassword, generateRecoveryKit, isLoading, biometrics, deviceLock, refreshBiometrics,
    configureBiometrics, configureDeviceLock, error } = useAuthStore();
  const [section, setSection] = useState<Section>(sectionFrom(params.section));
  const [method, setMethod] = useState<UnlockMethod | null>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');

  function clearForm() { setCurrent(''); setNext(''); setConfirmation(''); setMethod(null); }
  useEffect(() => { setSection(sectionFrom(params.section)); clearForm(); }, [params.section]);
  useFocusEffect(useCallback(() => {
    void refreshBiometrics();
    return clearForm;
  }, [refreshBiometrics]));
  function selectSection(value: Section) { clearForm(); setSection(value); }

  async function configure(selected: UnlockMethod, enabled: boolean, password?: string) {
    setCurrent('');
    try {
      if (selected === 'device') await configureDeviceLock(enabled, password);
      else await configureBiometrics(enabled, password);
      setMethod(null);
      Alert.alert(enabled ? 'Desbloqueio ativado' : 'Desbloqueio desativado',
        enabled ? 'Esta opção já pode abrir o cofre neste celular. Sua senha mestra continua disponível.'
          : 'Sua senha mestra e as outras opções ativadas continuam disponíveis.');
    } catch (error) {
      Alert.alert(enabled ? 'Não foi possível ativar' : 'Não foi possível desativar',
        getErrorMessage(error, 'A confirmação não foi concluída. Sua senha mestra continua disponível.'));
    }
  }
  function confirmMethod() {
    if (!method || !current || isLoading) return;
    const entered = current;
    setCurrent('');
    if (method === 'biometric') { void configure(method, true, entered); return; }
    Alert.alert('Quem conhece o bloqueio pode abrir o cofre',
      'Quem conhece o PIN, padrão ou senha deste celular poderá desbloquear seu cofre. O Android fará a confirmação. Não criamos outro PIN.',
      [{ text: 'Cancelar', style: 'cancel' },
        { text: 'Entendi, confirmar no Android', onPress: () => void configure('device', true, entered) }]);
  }
  async function settings() {
    try {
      if (Platform.OS === 'android') await Linking.sendIntent('android.settings.SECURITY_SETTINGS');
      else await Linking.openSettings();
    } catch (error) { Alert.alert('Não foi possível abrir as configurações', getErrorMessage(error, 'Abra Segurança nas configurações do celular e depois volte ao Senha Fácil.')); }
  }
  async function change() {
    if (next.length < 8 || next.length > 128 || next !== confirmation) {
      Alert.alert('Confira a nova senha', 'Use de 8 a 128 caracteres e repita a mesma senha.'); return;
    }
    const password = current; const replacement = next;
    clearForm();
    try { await changePassword(password, replacement); Alert.alert('Senha alterada', 'As outras sessões foram encerradas.'); }
    catch (error) { Alert.alert('Troca não concluída', getErrorMessage(error, 'Confira a senha atual e a conexão. Se a alteração já foi aceita, entre novamente com a nova senha.')); }
  }
  function kit() {
    const password = current; setCurrent('');
    Alert.alert('Substituir seu kit de recuperação?',
      'O kit anterior deixará de funcionar e as outras sessões serão encerradas. Suas senhas salvas serão preservadas.',
      [{ text: 'Cancelar', style: 'cancel' }, { text: 'Gerar novo kit', onPress: async () => {
        try { await generateRecoveryKit(password); }
        catch (error) { Alert.alert('Kit não concluído', getErrorMessage(error, 'Confira a senha e a conexão. Se a operação já foi aceita, entre novamente.')); }
      } }]);
  }

  return <Screen>
    <ScreenHeading title="Acesso e segurança" icon="shield-checkmark-outline"
      description="Escolha um cuidado por vez. Você sempre pode usar a senha mestra." onBack={() => router.back()} />
    <View style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
      <ChoiceChip label="Como abrir o cofre" icon="lock-open-outline" selected={section === 'unlock'} disabled={isLoading} onPress={() => selectSection('unlock')} />
      <ChoiceChip label="Trocar senha mestra" icon="key-outline" selected={section === 'password'} disabled={isLoading} onPress={() => selectSection('password')} />
      <ChoiceChip label="Kit de recuperação" icon="document-lock-outline" selected={section === 'recovery'} disabled={isLoading} onPress={() => selectSection('recovery')} />
    </View>
    {Boolean(error) && <Notice tone="warning">{error}</Notice>}
    {section === 'unlock' && <>
      <AccessibleCard>
        <SectionHeading title="1. Bloqueio do celular" description="Use o PIN, padrão ou senha que você já conhece. Será a opção principal depois de ativada." />
        <StatusPill label={deviceLock?.enabled ? 'Ativado neste celular' : 'Ainda não ativado'} icon={deviceLock?.enabled ? 'checkmark-circle-outline' : 'phone-portrait-outline'} />
        <AccessibleText style={{ marginVertical: spacing.md }}>{deviceLock?.reason ?? 'Conferindo a disponibilidade...'}</AccessibleText>
        {deviceLock?.enabled
          ? <AccessibleButton label="Desativar bloqueio do celular no cofre" variant="secondary" disabled={isLoading} onPress={() => void configure('device', false)} />
          : <AccessibleButton label="Ativar bloqueio do celular" icon="phone-portrait-outline" disabled={isLoading || !deviceLock?.available}
            onPress={() => { setCurrent(''); setMethod('device'); }} />}
      </AccessibleCard>
      <AccessibleCard>
        <SectionHeading title="2. Digital ou rosto compatível" description="Uma alternativa opcional. O Android escolhe uma biometria forte disponível neste aparelho." />
        <StatusPill label={biometrics?.enabled ? 'Ativada neste celular' : 'Ainda não ativada'} icon="finger-print-outline" />
        <AccessibleText style={{ marginVertical: spacing.md }}>{biometrics?.reason ?? 'Conferindo a biometria...'}</AccessibleText>
        <AccessibleText variant="caption" style={{ marginBottom: spacing.md }}>O rosto usado apenas para desbloquear a tela pode não ser seguro o suficiente para abrir o cofre. Nesse caso, use a digital ou o bloqueio do celular.</AccessibleText>
        {biometrics?.enabled
          ? <AccessibleButton label="Desativar biometria no cofre" variant="secondary" disabled={isLoading} onPress={() => void configure('biometric', false)} />
          : <AccessibleButton label="Ativar biometria" icon="finger-print-outline" disabled={isLoading || !biometrics?.available}
            onPress={() => { setCurrent(''); setMethod('biometric'); }} />}
      </AccessibleCard>
      {method && <AccessibleCard highlight>
        <SectionHeading title={method === 'device' ? 'Confirmar ativação do bloqueio' : 'Confirmar ativação da biometria'}
          description="Primeiro, confirme sua senha mestra. Depois, siga a confirmação do próprio Android." />
        <AccessibleTextInput label="Senha mestra atual" value={current} onChangeText={setCurrent} secureTextEntry maxLength={128}
          autoComplete="off" autoFocus editable={!isLoading} onSubmitEditing={confirmMethod} />
        <View style={{ gap: spacing.sm }}>
          <AccessibleButton label="Confirmar e ativar" icon="checkmark-circle-outline" loading={isLoading} disabled={!current} onPress={confirmMethod} />
          <AccessibleButton label="Cancelar ativação" variant="quiet" disabled={isLoading} onPress={() => { setMethod(null); setCurrent(''); }} />
        </View>
      </AccessibleCard>}
      <AccessibleCard>
        <SectionHeading title="Precisa configurar o celular?" description="Cadastre o bloqueio ou a biometria no Android. Ao voltar, desbloqueie seu cofre e confira as opções novamente." />
        <View style={{ gap: spacing.sm }}>
          <AccessibleButton label="Abrir segurança do Android" icon="settings-outline" variant="secondary" disabled={isLoading} onPress={() => void settings()} />
          <AccessibleButton label="Verificar opções novamente" icon="refresh-outline" variant="quiet" disabled={isLoading} onPress={() => void refreshBiometrics()} />
        </View>
      </AccessibleCard>
    </>}
    {section === 'password' && <AccessibleCard>
      <SectionHeading title="Trocar sua senha mestra" description="Você precisa de internet. As senhas guardadas no cofre serão preservadas." />
      <AccessibleTextInput label="Senha mestra atual" value={current} onChangeText={setCurrent} secureTextEntry maxLength={128} editable={!isLoading} />
      <AccessibleTextInput label="Nova senha mestra" value={next} onChangeText={setNext} secureTextEntry maxLength={128} autoComplete="new-password" editable={!isLoading} />
      <AccessibleTextInput label="Repetir nova senha mestra" value={confirmation} onChangeText={setConfirmation} secureTextEntry maxLength={128} editable={!isLoading} />
      <AccessibleButton label="Confirmar troca de senha" icon="key-outline" loading={isLoading} disabled={!current || !next || !confirmation} onPress={() => void change()} />
    </AccessibleCard>}
    {section === 'recovery' && <AccessibleCard>
      <SectionHeading title="Substituir o kit de recuperação" description="Use se perdeu o kit ou precisa substituí-lo. Guarde o novo código fora deste aparelho." />
      <Notice tone="warning">O kit anterior deixará de funcionar. Gerar um kit não é necessário para ativar PIN ou biometria.</Notice>
      <AccessibleTextInput label="Senha mestra atual" value={current} onChangeText={setCurrent} secureTextEntry maxLength={128} editable={!isLoading} />
      <AccessibleButton label="Confirmar e gerar novo kit" icon="document-lock-outline" disabled={!current || isLoading} onPress={kit} />
    </AccessibleCard>}
    {section !== 'unlock' && <Notice tone="warning">Alterações da senha ou do kit encerram as outras sessões online. Cópias em aparelhos offline não são apagadas.</Notice>}
  </Screen>;
}
