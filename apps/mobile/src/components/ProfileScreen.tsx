import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Screen } from './ui/Screen';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleTextInput } from './ui/AccessibleTextInput';
import { AccessibleButton } from './ui/AccessibleButton';
import { useAuthStore } from '../stores/auth.store';
import { spacing } from '../theme/theme';
import { useRouter } from 'expo-router';
import { AccessibleCard } from './ui/AccessibleCard';
import { ScreenHeading, SectionHeading, Notice, StatusPill } from './ui/Presentation';
import { ReadingPreferences, SupportTools } from './SupportTools';
import { getErrorMessage } from '../services/error-messages';
import { accountLogin } from '../services/input-validation';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, updateProfile, deleteAccount, logout, lock, isLoading } = useAuthStore();
  const [name, setName] = useState(user?.name ?? '');
  const [surname, setSurname] = useState(user?.surname ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [birth, setBirth] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [saving, setSaving] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showDeletion, setShowDeletion] = useState(false);
  useEffect(() => {
    const date = user?.dateOfBirth?.slice(0, 10).split('-');
    setBirth(date ? `${date[2]}/${date[1]}/${date[0]}` : '');
    return () => setPassword('');
  }, [user?.dateOfBirth]);

  async function save() {
    if (name.trim().length < 2) { Alert.alert('Confira seu nome', 'Use pelo menos 2 caracteres.'); return; }
    const match = birth.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (birth.trim() && !match) { Alert.alert('Data invalida', 'Informe dia/mes/ano.'); return; }
    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), surname: surname.trim(), phone: phone.trim() || null,
        dateOfBirth: match ? `${match[3]}-${match[2]}-${match[1]}` : null });
      Alert.alert('Perfil atualizado.');
    } catch (error) { Alert.alert('Não foi possível salvar', getErrorMessage(error)); }
    finally { setSaving(false); }
  }

  function remove() {
    const entered = password;
    setPassword('');
    Alert.alert('Excluir conta permanentemente?', 'Seu cofre, perfil e vinculos serao removidos. Esta acao nao pode ser desfeita.', [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Excluir conta', style: 'destructive', onPress: async () => {
        try { await deleteAccount(entered); }
        catch (error) { Alert.alert('Não foi possível concluir', getErrorMessage(error, 'Confira sua senha e a conexão. Se a conta foi removida, feche o app e verifique a limpeza local.')); }
      } },
    ]);
  }
  async function signOut() {
    try { await logout(); }
    catch (error) { Alert.alert('Saída não concluída', getErrorMessage(error, 'Não foi possível limpar a sessão deste aparelho. Feche o aplicativo e tente novamente.')); }
  }
  return (
    <Screen>
      <ScreenHeading title="Minha conta" eyebrow="DO SEU JEITO" icon="person-circle-outline" description="Seus dados, suas preferências e seus cuidados." />
      <View style={{ marginBottom: spacing.lg }}><StatusPill label={user?.role === 'CAREGIVER' ? 'Familiar cuidador' : 'Titular do cofre'} icon="person-outline" /></View>
      <AccessibleCard highlight>
        <SectionHeading title="Como você quer abrir o cofre?" description="Ative o bloqueio do celular ou a biometria. Sua senha mestra continua disponível." />
        <AccessibleButton label="Configurar PIN, digital ou rosto" icon="lock-open-outline"
          onPress={() => router.push({ pathname: user?.role === 'CAREGIVER' ? '/(caregiver)/security' : '/(elderly)/security', params: { section: 'unlock' } })} />
      </AccessibleCard>
      <AccessibleCard>
      <SectionHeading title="Seus dados" />
      <AccessibleTextInput label={user?.email ? 'Seu e-mail de entrada' : 'Seu celular de entrada'}
        value={user ? accountLogin(user) : ''} editable={false} autoCapitalize="none"
        hint="Este é o seu login. Alterar o telefone de contato abaixo não muda sua entrada." />
      <AccessibleTextInput label="Nome" value={name} onChangeText={setName} maxLength={100} />
      <AccessibleTextInput label="Sobrenome (opcional)" value={surname} onChangeText={setSurname} maxLength={100} />
      <AccessibleTextInput label={user?.loginPhone ? 'Outro telefone para contato (opcional)' : 'Telefone para contato (opcional)'}
        value={phone} onChangeText={setPhone} keyboardType="phone-pad" hint="Informação de contato. Não é um segundo login nem recuperação por SMS." />
      <AccessibleTextInput label="Nascimento (dia/mes/ano, opcional)" value={birth} onChangeText={setBirth} keyboardType="numbers-and-punctuation" maxLength={10} />
      <AccessibleButton label="Salvar perfil" icon="save-outline" onPress={save} loading={saving} />
      </AccessibleCard>
      <AccessibleCard>
        <SectionHeading title="Conforto de leitura" />
        <ReadingPreferences />
      </AccessibleCard>
      <AccessibleCard>
      <SectionHeading title="Senha, recuperação e sessão" description="Cada ação tem sua própria confirmação." />
      <View style={{ gap: spacing.md }}>
        <AccessibleButton label="Ver avisos de segurança" icon="shield-checkmark-outline" variant="secondary"
          onPress={() => router.push(user?.role === 'CAREGIVER' ? '/(caregiver)/security-activity' : '/(elderly)/security-activity')} />
        <AccessibleButton label="Revisar minhas sessões" icon="phone-portrait-outline" variant="secondary"
          onPress={() => router.push(user?.role === 'CAREGIVER' ? '/(caregiver)/sessions' : '/(elderly)/sessions')} />
        <AccessibleButton label="Trocar minha senha mestra" icon="key-outline" variant="secondary"
          onPress={() => router.push({ pathname: user?.role === 'CAREGIVER' ? '/(caregiver)/security' : '/(elderly)/security', params: { section: 'password' } })} />
        <AccessibleButton label="Cuidar do kit de recuperação" icon="document-lock-outline" variant="secondary"
          onPress={() => router.push({ pathname: user?.role === 'CAREGIVER' ? '/(caregiver)/security' : '/(elderly)/security', params: { section: 'recovery' } })} />
        <AccessibleButton label="Bloquear cofre" icon="lock-closed-outline" variant="secondary" onPress={lock} />
        <AccessibleButton label="Sair da conta" icon="log-out-outline" variant="secondary" onPress={() => void signOut()} disabled={isLoading} />
      </View>
      </AccessibleCard>
      <AccessibleCard>
      <SectionHeading title="Sua privacidade, com clareza" />
      <AccessibleText>Seus familiares podem acompanhar pedidos e histórico, mas não recebem suas senhas.</AccessibleText>
      <AccessibleButton label={showPrivacy ? 'Fechar detalhes de privacidade' : 'Entenda como seus dados são usados'}
        icon={showPrivacy ? 'chevron-up-outline' : 'information-circle-outline'} expanded={showPrivacy} variant="quiet" onPress={() => setShowPrivacy(!showPrivacy)} />
      {showPrivacy && <View style={{ gap: spacing.md }}>
      <AccessibleText variant="body">O conteudo do cofre e cifrado no aparelho. Nomes e categorias dos itens, perfil e historico ficam no servidor. Familiares autorizados veem solicitacoes e historico, nao suas senhas.</AccessibleText>
      <AccessibleText variant="body">Pedidos assistidos podem incluir uma posição pontual. Seu familiar pode escolher carregá-la no OpenStreetMap; nesse caso, o provedor recebe as coordenadas e o endereço de internet de quem abriu o mapa. Não há rastreamento contínuo.</AccessibleText>
      <AccessibleText variant="body">Você pode autorizar guardar o ponto de cada pedido por 30 dias após o envio, somente se autorizado ou negado. Ele ficará no histórico para você e familiares que continuem autorizados. Sem essa escolha, em cancelamentos ou ao expirar, a posição é apagada. Pontos antigos já apagados não podem ser recuperados.</AccessibleText>
      <AccessibleText variant="body">Avisos de segurança ficam por 90 dias, sem senha, kit ou localização. Familiares ativos que podem aprovar acessos também recebem avisos de mudanças e atividades incomuns. Leituras e cópias são relatos do aplicativo, não provas de fraude. Um código aleatório identifica a instalação sem usar IMEI.</AccessibleText>
      <AccessibleText variant="body">Contas com kit de recuperacao usam uma credencial derivada para entrar na API, sem enviar a senha mestra. Contas antigas precisam preparar o kit para migrar. A exclusao remove os dados ativos; backups dependem da politica de hospedagem.</AccessibleText>
      <AccessibleText variant="body">O historico resolvido tem retencao de 365 dias, com limpeza diaria. A exclusao limpa este aparelho; copias offline em outros aparelhos precisam ser apagadas neles.</AccessibleText>
      </View>}
      </AccessibleCard>
      <AccessibleCard>
      <SectionHeading title="Encerrar sua conta" />
      <AccessibleButton label={showDeletion ? 'Cancelar exclusão' : 'Quero excluir minha conta'} icon="trash-outline" variant="quiet"
        expanded={showDeletion} onPress={() => { setShowDeletion(!showDeletion); setPassword(''); setConfirmation(''); }} />
      {showDeletion && <View style={{ marginTop: spacing.md }}>
      <Notice tone="danger" title="Esta ação é permanente">Seu cofre, perfil e vínculos serão removidos. Cópias em outros aparelhos offline precisam ser apagadas neles.</Notice>
      <AccessibleTextInput label="Digite EXCLUIR" value={confirmation} onChangeText={setConfirmation} autoCapitalize="characters" />
      <AccessibleTextInput label="Senha de entrada" value={password} onChangeText={setPassword} secureTextEntry />
      <AccessibleButton label="Excluir minha conta" icon="trash-outline" variant="danger" disabled={confirmation !== 'EXCLUIR' || !password || isLoading} onPress={remove} />
      </View>}
      </AccessibleCard>
      <SupportTools />
    </Screen>
  );
}