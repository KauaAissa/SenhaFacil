import { useState } from 'react';
import { Alert, View } from 'react-native';
import { Screen } from './ui/Screen';
import { AccessibleText } from './ui/AccessibleText';
import { AccessibleButton } from './ui/AccessibleButton';
import { useAuthStore } from '../stores/auth.store';
import { spacing } from '../theme/theme';
import { HeroCard, Notice, StatusPill } from './ui/Presentation';
import { AccessibleCard } from './ui/AccessibleCard';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { getErrorMessage } from '../services/error-messages';

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const { user, completeOnboarding } = useAuthStore();
  async function finish() {
    setSaving(true);
    try {
      await completeOnboarding();
    } catch (error) { Alert.alert('Não foi possível concluir', getErrorMessage(error)); }
    finally { setSaving(false); }
  }
  return (
    <Screen style={{ maxWidth: 640 }}>
      <View style={{ marginBottom: spacing.md }}><StatusPill label={`Primeiros passos · ${step + 1} de 2`} icon="compass-outline" /></View>
      <Animated.View key={step} entering={FadeIn.duration(200).reduceMotion(ReduceMotion.System)}>
      <HeroCard title={step === 0 ? 'Um cuidado só seu' : 'Perto de quem importa'}
        icon={step === 0 ? 'key-outline' : 'people-outline'}
        description={step === 0 ? 'Sua senha mestra abre o cofre. Seu kit ajuda a recuperá-lo.' : 'Apoio de alguém de confiança, sem entregar suas senhas.'} />
      <AccessibleCard>
      <View style={{ gap: spacing.lg }}>
        <AccessibleText variant="bodyLarge" bold accessibilityRole="header">{step === 0 ? 'Guarde com cuidado' : 'Você escolhe quem ajuda'}</AccessibleText>
        <AccessibleText variant="body">{step === 0
          ? 'Guarde sua senha mestra e seu kit de recuperacao fora deste aparelho. Sem a senha, um kit valido ou uma chave local ainda disponivel, o conteudo do cofre nao pode ser recuperado.'
          : user?.role === 'CAREGIVER'
            ? 'Um convite precisa ser aceito antes de ajudar outra pessoa. A permissao para aprovar acessos e concedida pelo dono do cofre. Voce nao recebe as senhas dele.'
            : 'Um familiar vinculado pode aprovar ou negar pedidos dentro de dez minutos desde a solicitação, sem receber suas senhas. Sem conexão, o acesso de emergência exige sua autenticação e fica registrado no histórico.'}</AccessibleText>
      </View>
      </AccessibleCard>
      <Notice tone={step === 0 ? 'primary' : 'warning'} icon={step === 0 ? 'information-circle-outline' : 'time-outline'}>{step === 0
        ? 'Nomes e categorias dos itens, perfil e histórico não são cifrados no servidor. Contas com kit usam uma credencial derivada, sem enviar a senha mestra para entrar.'
        : 'O cofre bloqueia ao sair do app ou após dois minutos sem toque. Uma senha copiada fica disponível por até cinco minutos; outros apps e o sistema podem manter cópias.'}</Notice>
      </Animated.View>
      {step === 0 ? <AccessibleButton label="Continuar" icon="arrow-forward-outline" onPress={() => setStep(1)} />
        : <AccessibleButton label={user?.role === 'CAREGIVER' ? 'Ver meus convites' : 'Abrir meu cofre'} icon="checkmark-outline" loading={saving} onPress={finish} />}
      {step > 0 && <View style={{ marginTop: spacing.md }}><AccessibleButton label="Voltar" variant="secondary" icon="arrow-back-outline" onPress={() => setStep(0)} /></View>}
    </Screen>
  );
}