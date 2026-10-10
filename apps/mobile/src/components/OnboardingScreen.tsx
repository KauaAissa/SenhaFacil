import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from './ui/Screen';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleButton } from './ui/AccessibleButton';
import { useAuthStore } from '../stores/auth.store';
import { colors, spacing } from '../theme/theme';

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const { user, completeOnboarding } = useAuthStore();
  async function finish() {
    setSaving(true);
    try {
      await completeOnboarding();
    } catch { Alert.alert('Nao foi possivel concluir. Tente novamente.'); }
    finally { setSaving(false); }
  }
  return (
    <Screen>
      <AccessibleText variant="title">Senha Facil</AccessibleText>
      <AccessibleText variant="caption">{step + 1} de 2</AccessibleText>
      <View style={{ gap: spacing.lg, marginVertical: spacing.lg }}>
        <Ionicons name={step === 0 ? 'key-outline' : 'people-outline'} size={48} color={colors.primaryDark} accessible={false} />
        <AccessibleText variant="bodyLarge" bold>{step === 0 ? 'Sua senha mestra' : 'Acesso assistido'}</AccessibleText>
        <AccessibleText variant="body">{step === 0
          ? 'Guarde sua senha mestra e seu kit de recuperacao fora deste aparelho. Sem a senha, um kit valido ou uma chave local ainda disponivel, o conteudo do cofre nao pode ser recuperado.'
          : user?.role === 'CAREGIVER'
            ? 'Um convite precisa ser aceito antes de ajudar outra pessoa. A permissao para aprovar acessos e concedida pelo dono do cofre. Voce nao recebe as senhas dele.'
            : 'Um familiar vinculado pode aprovar ou negar pedidos por dois minutos, sem receber suas senhas. Sem conexao, o acesso de emergencia exige sua autenticacao e fica registrado no historico.'}</AccessibleText>
        <AccessibleText variant="body">{step === 0
          ? 'Nomes e categorias de itens, perfil e historico nao sao cifrados no servidor. Contas com kit usam uma credencial derivada, sem enviar a senha mestra para entrar.'
          : 'O cofre bloqueia ao sair do app ou apos dois minutos sem toque. Copiar uma senha a deixa na area de transferencia por ate 30 segundos; outros aplicativos e historicos do sistema podem manter copias.'}</AccessibleText>
      </View>
      {step === 0 ? <AccessibleButton label="Continuar" icon="arrow-forward-outline" onPress={() => setStep(1)} />
        : <AccessibleButton label={user?.role === 'CAREGIVER' ? 'Ver meus convites' : 'Abrir meu cofre'} icon="checkmark-outline" loading={saving} onPress={finish} />}
      {step > 0 && <View style={{ marginTop: spacing.md }}><AccessibleButton label="Voltar" variant="secondary" icon="arrow-back-outline" onPress={() => setStep(0)} /></View>}
    </Screen>
  );
}