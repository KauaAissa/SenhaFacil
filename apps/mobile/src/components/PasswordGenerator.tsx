import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { generatePassphrase, generatePassword } from '@senha-facil/crypto';
import { AccessibleButton } from './ui/AccessibleButton';
import { AccessibleSwitch } from './ui/AccessibleSwitch';
import { AccessibleText } from './ui/AccessibleText';
import { ChoiceChip } from './ui/ChoiceChip';
import { IconBadge, LoadingState, Notice, SectionHeading, StatusPill } from './ui/Presentation';
import { useThemeColors } from '../hooks/useThemeColors';
import { spacing } from '../theme/theme';
import { connectivityService } from '../services/connectivity.service';
import { getErrorMessage } from '../services/error-messages';
import { passwordAiService, type PasswordPreferences, type PasswordSuggestion } from '../services/password-ai.service';
import { useAuthStore } from '../stores/auth.store';

const initialPreferences: PasswordPreferences = { usage: 'TYPE', symbols: 'ALLOWED', maxLength: 32 };
type GeneratorMode = 'words' | 'characters' | 'ai';

export function PasswordGenerator({ disabled, hasPassword, onGenerated }: {
  disabled: boolean; hasPassword: boolean; onGenerated: (password: string) => void;
}) {
  const colors = useThemeColors();
  const [length, setLength] = useState(20);
  const [mode, setMode] = useState<GeneratorMode>('words');
  const [wordSymbols, setWordSymbols] = useState(true);
  const [lastLength, setLastLength] = useState<number | null>(null);
  const [step, setStep] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const [consent, setConsent] = useState(false);
  const [preferences, setPreferences] = useState(initialPreferences);
  const [suggestion, setSuggestion] = useState<PasswordSuggestion | null>(null);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [online, setOnline] = useState(connectivityService.isOnline);
  const focused = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  useEffect(() => connectivityService.subscribe(setOnline), []);

  const cancel = useCallback(() => {
    generation.current += 1;
    controller.current?.abort();
    controller.current = null;
    inFlight.current = false;
  }, []);
  useFocusEffect(useCallback(() => {
    focused.current = true;
    return () => {
      focused.current = false;
      cancel();
      setSuggestion(null); setConsent(false); setExpanded(false); setLoading(false); setMode('words'); setStep(0);
    };
  }, [cancel]));
  useEffect(() => {
    if (disabled) { cancel(); setLoading(false); setSuggestion(null); }
  }, [disabled, cancel]);

  function updatePreferences(patch: Partial<PasswordPreferences>) {
    cancel();
    setPreferences((current) => ({ ...current, ...patch }));
    setSuggestion(null); setError(''); setLoading(false);
  }
  function currentCheck() {
    const expected = generation.current;
    const owner = useAuthStore.getState().user?.id;
    return () => focused.current && expected === generation.current && !disabledRef.current
      && !useAuthStore.getState().isLocked && useAuthStore.getState().user?.id === owner;
  }

  async function checkAvailability() {
    cancel();
    setError(''); setAvailable(null);
    if (!connectivityService.isOnline) return;
    const isCurrent = currentCheck();
    const request = new AbortController();
    controller.current = request;
    setLoading(true); inFlight.current = true;
    try {
      const status = await passwordAiService.status(request.signal);
      if (isCurrent()) setAvailable(status.available);
    } catch (error) {
      if (isCurrent()) setError(getErrorMessage(error, 'Não foi possível conferir a ajuda da IA. O gerador no aparelho continua disponível.'));
    } finally {
      if (isCurrent()) { setLoading(false); inFlight.current = false; controller.current = null; }
    }
  }
  function chooseMode(value: GeneratorMode) {
    cancel();
    setMode(value); setError(''); setLastLength(null); setLoading(false);
    setSuggestion(null); setConsent(false); setStep(0); setExpanded(value === 'ai');
    if (value === 'ai') void checkAvailability();
  }
  async function consult() {
    if (!consent || disabled || inFlight.current) return;
    cancel();
    const isCurrent = currentCheck();
    const request = new AbortController();
    controller.current = request;
    inFlight.current = true; setLoading(true); setSuggestion(null); setError('');
    try {
      const result = await passwordAiService.suggest(preferences, isCurrent, request.signal);
      if (isCurrent()) setSuggestion(result);
    } catch (error) {
      if (isCurrent()) setError(getErrorMessage(error, 'Não foi possível consultar a IA. Use o gerador no aparelho ou tente novamente.'));
    } finally {
      if (isCurrent()) { setLoading(false); inFlight.current = false; controller.current = null; }
    }
  }
  function generate(selectedMode: GeneratorMode) {
    const isCurrent = currentCheck();
    const selected = suggestion;
    const choices = preferences;
    function apply() {
      if (!isCurrent()) return;
      try {
        const password = selectedMode === 'ai' && selected ? passwordAiService.generate(selected, choices)
          : selectedMode === 'words' ? generatePassphrase({ symbols: wordSymbols }) : generatePassword(length);
        onGenerated(password); setLastLength(password.length); setError('');
      } catch (error) { setError(getErrorMessage(error, 'Não foi possível gerar uma senha segura. Tente novamente.')); }
    }
    if (selectedMode === 'ai' && !selected) return;
    if (hasPassword) {
      Alert.alert('Substituir a senha do formulário?', 'A nova senha será gerada neste aparelho. Nada será salvo até você confirmar o formulário.',
        [{ text: 'Cancelar', style: 'cancel' }, { text: 'Gerar e substituir', onPress: apply }]);
    } else apply();
  }

  return <View style={{ backgroundColor: colors.primarySoft, borderRadius: 18, borderWidth: 1,
    borderColor: colors.border, padding: spacing.md, gap: spacing.md, minWidth: 0 }}>
    <IconBadge icon={mode === 'ai' ? 'sparkles-outline' : 'key-outline'} />
    <SectionHeading title="Vamos criar uma senha?" description="Escolha o jeito mais confortável. Nenhuma senha será salva sem você confirmar." />
    <View style={{ gap: spacing.sm }}>
      <ChoiceChip label="Palavras fáceis de ler" icon="book-outline" selected={mode === 'words'} disabled={disabled} onPress={() => chooseMode('words')} />
      <ChoiceChip label="Letras, números e símbolos" icon="key-outline" selected={mode === 'characters'} disabled={disabled} onPress={() => chooseMode('characters')} />
      <ChoiceChip label="Ajuda da IA, passo a passo" icon="sparkles-outline" selected={mode === 'ai' && expanded} disabled={disabled} onPress={() => chooseMode('ai')} />
    </View>
    {mode === 'words' && <>
      <StatusPill label="No celular · sem internet" icon="phone-portrait-outline" />
      <SectionHeading title="Uma pequena história para lembrar" description="Sorteamos seis palavras em português e dois números. Você pode imaginar uma história com elas." />
      <AccessibleText variant="caption">Não usamos nomes, datas nem gostos pessoais. As palavras podem se repetir: cada escolha é um novo sorteio seguro.</AccessibleText>
      <AccessibleSwitch label="Incluir símbolos" value={wordSymbols} disabled={disabled}
        description="Desative se o site não aceitar símbolos. As seis palavras e os números continuam."
        onValueChange={(value) => { cancel(); setWordSymbols(value); setLastLength(null); }} />
      <Notice tone="neutral">Essa senha é mais longa. Confira o limite do site. Se não couber, escolha “Letras, números e símbolos”. Não corte palavras da senha.</Notice>
      <AccessibleButton label="Criar senha com palavras" icon="book-outline" disabled={disabled} onPress={() => generate('words')} />
    </>}
    {mode === 'characters' && <>
      <StatusPill label="No celular · sem internet" icon="phone-portrait-outline" />
      <AccessibleText bold>Quantos caracteres o site aceita?</AccessibleText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
        {[12, 16, 20, 24, 32].map((size) => <ChoiceChip key={size} label={`${size}`}
          selected={length === size} disabled={disabled} onPress={() => { cancel(); setLength(size); setLastLength(null); }} />)}
      </View>
      <AccessibleText variant="caption">São {length} caracteres. Uma boa opção para copiar e colar.</AccessibleText>
      <AccessibleButton label="Gerar senha no aparelho" icon="key-outline" disabled={disabled} onPress={() => generate('characters')} />
    </>}
    {mode === 'ai' && expanded && <>
      <StatusPill label={`Passo ${step + 1} de 4`} icon="sparkles-outline" />
      {step === 0 && <>
        <SectionHeading title="Como prefere usar a senha?" description="Escolha o que será mais prático no dia a dia." />
        <ChoiceChip label="Vou digitar" selected={preferences.usage === 'TYPE'} disabled={disabled || loading} onPress={() => updatePreferences({ usage: 'TYPE' })} />
        <ChoiceChip label="Vou copiar e colar" selected={preferences.usage === 'COPY'} disabled={disabled || loading} onPress={() => updatePreferences({ usage: 'COPY' })} />
      </>}
      {step === 1 && <>
        <SectionHeading title="O site aceita símbolos?" description="Símbolos são sinais como !, @ e %. Confira a regra no site." />
        {([{ value: 'ALLOWED', label: 'Aceita símbolos' }, { value: 'FORBIDDEN', label: 'Não aceita símbolos' },
          { value: 'REQUIRED', label: 'Exige símbolos' }] as const).map((option) =>
          <ChoiceChip key={option.value} label={option.label} selected={preferences.symbols === option.value}
            disabled={disabled || loading} onPress={() => updatePreferences({ symbols: option.value })} />)}
      </>}
      {step === 2 && <>
        <SectionHeading title="Qual é o limite de tamanho?" description="Escolha o máximo que o site permite. A IA não consulta o site." />
        <View style={{ gap: spacing.sm }}>
          {([16, 20, 32, 64] as const).map((size) => <ChoiceChip key={size} label={`Até ${size} caracteres`}
            selected={preferences.maxLength === size} disabled={disabled || loading}
            onPress={() => updatePreferences({ maxLength: size })} />)}
        </View>
        <AccessibleText variant="caption">Não sabe? Confira no site antes de continuar. Esta ajuda usa no mínimo 16 caracteres.</AccessibleText>
      </>}
      {step < 3 && <AccessibleButton label="Continuar" icon="arrow-forward-outline" disabled={disabled || loading} onPress={() => setStep((current) => current + 1)} />}
      {step === 3 && <>
        <SectionHeading title="Tudo pronto para pedir ajuda" description="A IA sugere tamanho e símbolos. Só este celular cria a senha de verdade." />
        <AccessibleText>{preferences.usage === 'TYPE' ? 'Você vai digitar.' : 'Você vai copiar e colar.'} Até {preferences.maxLength} caracteres. {preferences.symbols === 'FORBIDDEN' ? 'Sem símbolos.' : preferences.symbols === 'REQUIRED' ? 'Símbolos obrigatórios.' : 'Símbolos permitidos.'}</AccessibleText>
        <Notice tone="warning">Somente essas três escolhas serão enviadas ao Google Gemini. Nenhuma senha, nome, login, site, localização ou conteúdo do cofre. Na modalidade gratuita, o Google pode usar escolhas e respostas para melhorar produtos e realizar revisão humana.</Notice>
        <AccessibleSwitch label="Permitir o envio destas escolhas à IA" value={consent} disabled={disabled || loading}
          description="É opcional. Você pode voltar e criar uma senha só no celular."
          onValueChange={(value) => { setConsent(value); if (!value) { cancel(); setSuggestion(null); } }} />
        {!online && <Notice tone="warning">Você está sem internet. Nenhuma escolha será enviada à IA. Os outros dois modos continuam disponíveis.</Notice>}
        {available === false && <Notice tone="warning">A ajuda da IA ainda não foi ativada no servidor.</Notice>}
        <AccessibleButton label={available !== true ? 'Verificar disponibilidade da IA' : 'Consultar sugestão da IA'}
          icon="sparkles-outline" loading={loading} disabled={disabled || !online || (available === true && !consent)}
          onPress={() => { if (available !== true) void checkAvailability(); else void consult(); }} />
        {suggestion && <View style={{ backgroundColor: colors.surface, borderRadius: 12, padding: spacing.md, gap: spacing.md }} accessibilityLiveRegion="polite">
          <SectionHeading title="Uma combinação para você" description={`${suggestion.policy.length} caracteres, ${suggestion.policy.symbols ? 'com símbolos' : 'sem símbolos'}.`} />
          <AccessibleText>{passwordAiService.explanation(suggestion)}</AccessibleText>
          <AccessibleText variant="caption">Conferimos a recomendação. Agora você decide se quer gerar a senha no celular.</AccessibleText>
          <AccessibleButton label="Gerar com essas opções" icon="key-outline" disabled={disabled} onPress={() => generate('ai')} />
        </View>}
      </>}
      {step > 0 && <AccessibleButton label="Voltar uma etapa" variant="quiet" disabled={disabled || loading} onPress={() => setStep((current) => current - 1)} />}
      {loading && step < 3 && <LoadingState label="Conferindo a disponibilidade da IA..." />}
      <AccessibleButton label="Fechar ajuda da IA" variant="quiet" disabled={disabled} onPress={() => chooseMode('words')} />
    </>}
    {Boolean(error) && <Notice tone="warning">{error}</Notice>}
    {lastLength !== null && <Notice tone="success" title="Senha criada no formulário">{`${lastLength} caracteres. Confira usando “Ver” no campo Senha. Salve o formulário quando estiver pronto.`}</Notice>}
    <AccessibleText variant="caption">Use uma senha diferente para cada conta. As senhas e as palavras geradas nunca são enviadas à IA.</AccessibleText>
  </View>;
}
