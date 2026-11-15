import { useCallback, useDeferredValue, useRef, useState } from 'react';
import { View, Alert } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleTextInput } from '../../../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { vaultService } from '../../../services/vault.service';
import { spacing } from '../../../theme/theme';
import { useThemeColors } from '../../../hooks/useThemeColors';
import { passwordAdvice } from '../../../services/password-advice.service';
import { AccessibleSwitch } from '../../../components/ui/AccessibleSwitch';
import { AccessibleCard } from '../../../components/ui/AccessibleCard';
import { ChoiceChip } from '../../../components/ui/ChoiceChip';
import { Notice, ScreenHeading, SectionHeading, LoadingState } from '../../../components/ui/Presentation';
import { categories } from '../../../theme/categories';
import type { LocalVaultItem } from '../../../services/offline-vault.service';
import { contactsApiService, canApproveAccess } from '../../../services/contacts-api.service';
import { getErrorMessage } from '../../../services/error-messages';
import { requestLocationService } from '../../../services/request-location.service';
import { PasswordGenerator } from '../../../components/PasswordGenerator';
import { ActivityConfirmationRequired } from '../../../services/vault-activity.service';
import { SensitiveActivityConfirmation } from '../../../components/SensitiveActivityConfirmation';

export default function NewVaultItemScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { id, accessLogId } = useLocalSearchParams<{ id?: string; accessLogId?: string }>();

  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<LocalVaultItem['category']>('OTHER');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const saving = useRef(false);
  const focusGeneration = useRef(0);
  const [ready, setReady] = useState(!id);
  const [needsIdentity, setNeedsIdentity] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const deferredPassword = useDeferredValue(password);
  const advice = passwordAdvice(deferredPassword, [label, login]);
  const [error, setError] = useState('');
  const [approvalReady, setApprovalReady] = useState(false);
  const [checkingContacts, setCheckingContacts] = useState(true);
  const [contactNotice, setContactNotice] = useState('');
  const [checkingLocation, setCheckingLocation] = useState(false);

  async function changeApproval(enabled: boolean) {
    if (!enabled) { setRequiresApproval(false); return; }
    setCheckingLocation(true);
    setError('');
    try {
      await requestLocationService.requirePermission();
      setRequiresApproval(true);
    } catch (error) { Alert.alert('Acesso assistido não ativado', getErrorMessage(error)); }
    finally { setCheckingLocation(false); }
  }

  const checkContacts = useCallback(async () => {
    setCheckingContacts(true);
    try {
      const contacts = await contactsApiService.findAll();
      const available = contacts.some(canApproveAccess);
      setApprovalReady(available);
      setContactNotice(available ? '' : 'Antes de ativar, convide um familiar, aguarde o aceite e ative “Pode aprovar acessos” em “Meus familiares”.');
    } catch (error) {
      setApprovalReady(false);
      setContactNotice(getErrorMessage(error, 'Conecte-se à internet para conferir o familiar. Você ainda pode salvar uma senha comum offline.'));
    } finally { setCheckingContacts(false); }
  }, []);

  useFocusEffect(useCallback(() => { void checkContacts(); }, [checkContacts]));

  const loadEditable = useCallback(async () => {
    if (!id) return;
    const generation = focusGeneration.current;
    const item = await vaultService.revealItem(id, accessLogId);
    if (generation !== focusGeneration.current) return;
    setLabel(item.label); setCategory(item.category); setLogin(item.plaintext.login ?? '');
    setPassword(item.plaintext.password); setUrl(item.plaintext.url ?? ''); setNotes(item.plaintext.notes ?? '');
    setRequiresApproval(item.requiresApproval); setIsFavorite(item.isFavorite); setReady(true); setNeedsIdentity(false);
  }, [id, accessLogId]);

  useFocusEffect(useCallback(() => {
    focusGeneration.current += 1;
    let active = true;
    setNeedsIdentity(false);
    if (id) { setReady(false); void loadEditable().catch((error) => {
      if (!active) return;
      if (error instanceof ActivityConfirmationRequired) { setNeedsIdentity(true); return; }
      setError(getErrorMessage(error, 'Edição indisponível. Tente novamente.'));
    }); }
    return () => { active = false; focusGeneration.current += 1; setPassword(''); setLogin(''); setNotes(''); setUrl(''); };
  }, [id, loadEditable]));

  async function handleSave() {
    if (saving.current || !ready) return;
    if (!label.trim() || !password) {
      Alert.alert('Preencha ao menos o nome e a senha.');
      return;
    }
    if (label.trim().length > 100 || password.length > 1024 || notes.length > 5000) {
      Alert.alert('Texto muito longo', 'Use ate 100 caracteres no nome e ate 5.000 nas observacoes.'); return;
    }
    if (url.trim() && !/^https?:\/\/[^\s]+$/i.test(url.trim())) {
      Alert.alert('Site invalido', 'Informe um endereco com https:// ou http://.'); return;
    }

    saving.current = true;
    const generation = focusGeneration.current;
    setSubmitting(true);
    try {
      const input = {
        label: label.trim(),
        category,
        plaintext: {
          login: login.trim() || undefined,
          password,
          url: url.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        requiresApproval,
        isFavorite,
      };
      if (id) await vaultService.updateItem(id, input, accessLogId);
      else await vaultService.createItem(input);
      if (generation !== focusGeneration.current) return;
      setPassword(''); setLogin(''); setNotes(''); setUrl('');
      router.dismissTo('/(elderly)/vault');
    } catch (err) {
      Alert.alert('Não foi possível salvar', getErrorMessage(err));
    } finally {
      saving.current = false;
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <ScreenHeading title={id ? 'Editar senha' : 'Uma senha bem guardada'} eyebrow={id ? 'SEU COFRE' : 'ADICIONAR SENHA'}
        description="Organize do seu jeito. Só nome e senha são obrigatórios." onBack={() => router.back()} />
      {Boolean(error) && <Notice tone="danger">{error}</Notice>}
      {needsIdentity ? <SensitiveActivityConfirmation onCancel={() => router.back()} onConfirmed={async () => {
        try { await loadEditable(); }
        catch (error) { setNeedsIdentity(false); setError(getErrorMessage(error, 'A edição não está disponível. Volte ao item e confira a autorização.')); }
      }} /> : !ready ? (!error && <LoadingState label="Preparando edição..." />) : <>
      <AccessibleCard>
      <SectionHeading title="1. Como você vai encontrar?" />
      <AccessibleTextInput label="Nome (ex: Banco do Brasil)" value={label} onChangeText={setLabel} />
      <AccessibleText bold style={{ marginBottom: spacing.sm }}>Categoria</AccessibleText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {categories.map((entry) => <ChoiceChip key={entry.value} label={entry.label} icon={entry.icon} selected={category === entry.value}
          disabled={submitting} onPress={() => setCategory(entry.value)} />)}
      </View>
      </AccessibleCard>
      <AccessibleCard>
      <SectionHeading title="2. Os dados dessa conta" />
      <AccessibleTextInput label="Login / usuário" value={login} onChangeText={setLogin} autoCapitalize="none" />
      <AccessibleTextInput
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <PasswordGenerator disabled={submitting} hasPassword={Boolean(password)} onGenerated={setPassword} />
      {advice && <View style={{ marginVertical: spacing.md, gap: spacing.sm }}>
        <AccessibleText bold color={advice.score < 3 ? colors.warning : colors.success}>Força estimada: {advice.label}</AccessibleText>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: 'row', gap: 6 }}>
          {[0, 1, 2, 3, 4].map((level) => <View key={level} style={{ flex: 1, height: 8, borderRadius: 4,
            backgroundColor: level <= advice.score ? (advice.score < 3 ? colors.warning : colors.success) : colors.border }} />)}
        </View>
        <AccessibleText variant="caption">{advice.advice}</AccessibleText>
      </View>}
      </AccessibleCard>
      <AccessibleCard>
      <SectionHeading title="3. Se quiser, complete" description="Estas informações são opcionais." />
      <AccessibleTextInput
        label="Site (opcional)"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      <AccessibleTextInput label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline />

      <AccessibleSwitch label="Exigir aprovação de um familiar" value={requiresApproval} onValueChange={(enabled) => void changeApproval(enabled)}
        disabled={submitting || checkingLocation || (!requiresApproval && (!approvalReady || checkingContacts))}
        description="Exige permissão de localização. Somente no envio de um pedido, uma posição será compartilhada com o familiar. Ele não recebe sua senha." />
      {checkingLocation && <LoadingState label="Conferindo a permissão de localização..." />}
      <AccessibleText variant="caption">Não coletamos sua posição ao cadastrar a senha nem acompanhamos seus trajetos. Ao enviar cada pedido, você poderá autorizar guardar o ponto no histórico por 30 dias. Sem localização disponível, seu familiar verá um aviso. Para ver o mapa, ele poderá autorizar o envio dessas coordenadas ao OpenStreetMap.</AccessibleText>
      {checkingContacts ? <LoadingState label="Conferindo seus familiares..." /> : Boolean(contactNotice) && <>
        <Notice tone="warning" title="Prepare o acesso assistido">{contactNotice}</Notice>
        <AccessibleButton label="Ir para Meus familiares" icon="people-outline" variant="secondary"
          onPress={() => router.push('/(elderly)/contacts')} />
        <AccessibleButton label="Conferir familiares novamente" variant="quiet" onPress={() => void checkContacts()} />
      </>}
      </AccessibleCard>
      <AccessibleButton label="Salvar senha" icon="save-outline" onPress={handleSave} loading={submitting} disabled={checkingLocation} />
      </>}
    </Screen>
  );
}
