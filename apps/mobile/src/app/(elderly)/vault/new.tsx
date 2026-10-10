import { useCallback, useDeferredValue, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { generatePassword } from '@senha-facil/crypto';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleTextInput } from '../../../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { vaultService } from '../../../services/vault.service';
import { colors, spacing, touchTarget } from '../../../theme/theme';
import { passwordAdvice } from '../../../services/password-advice.service';
import { AccessibleSwitch } from '../../../components/ui/AccessibleSwitch';

const CATEGORIES = [
  { value: 'BANKING', label: 'Banco' },
  { value: 'SOCIAL_MEDIA', label: 'Rede Social' },
  { value: 'EMAIL', label: 'E-mail' },
  { value: 'HEALTH', label: 'Saúde' },
  { value: 'GOVERNMENT', label: 'Governo' },
  { value: 'SHOPPING', label: 'Compras' },
  { value: 'OTHER', label: 'Outro' },
] as const;

type Category = (typeof CATEGORIES)[number]['value'];

export default function NewVaultItemScreen() {
  const router = useRouter();
  const { id, accessLogId } = useLocalSearchParams<{ id?: string; accessLogId?: string }>();

  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<Category>('OTHER');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [ready, setReady] = useState(!id);
  const [isFavorite, setIsFavorite] = useState(false);
  const deferredPassword = useDeferredValue(password);
  const advice = passwordAdvice(deferredPassword, [label, login]);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (id) void vaultService.revealItem(id, accessLogId).then((item) => {
      if (!active) return;
      setLabel(item.label); setCategory(item.category); setLogin(item.plaintext.login ?? '');
      setPassword(item.plaintext.password); setUrl(item.plaintext.url ?? ''); setNotes(item.plaintext.notes ?? '');
      setRequiresApproval(item.requiresApproval); setIsFavorite(item.isFavorite); setReady(true);
    }).catch((error) => Alert.alert('Edicao indisponivel', error instanceof Error ? error.message : 'Tente novamente.'));
    return () => { active = false; setPassword(''); setLogin(''); setNotes(''); setUrl(''); };
  }, [id, accessLogId]));

  async function handleSave() {
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
      setPassword(''); setLogin(''); setNotes(''); setUrl('');
      router.back();
    } catch (err) {
      Alert.alert('Não foi possível salvar', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      {!ready ? <AccessibleText variant="body">Preparando edicao...</AccessibleText> : <>
      <AccessibleText variant="title" style={{ marginBottom: spacing.lg }}>{id ? 'Editar senha' : 'Adicionar senha'}</AccessibleText>
      <AccessibleTextInput label="Nome (ex: Banco do Brasil)" value={label} onChangeText={setLabel} />

      <AccessibleText variant="body" bold style={{ marginBottom: spacing.xs }}>
        Categoria
      </AccessibleText>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: spacing.md }}>
        {CATEGORIES.map((c) => (
          <Pressable
            key={c.value}
            onPress={() => setCategory(c.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: category === c.value }}
            style={[styles.chip, category === c.value && styles.chipSelected]}
          >
            <AccessibleText
              variant="body"
              color={category === c.value ? '#FFFFFF' : colors.textPrimary}
              bold={category === c.value}
            >
              {c.label}
            </AccessibleText>
          </Pressable>
        ))}
      </ScrollView>

      <AccessibleTextInput label="Login / usuário" value={login} onChangeText={setLogin} autoCapitalize="none" />
      <AccessibleTextInput
        label="Senha"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        autoCapitalize="none"
      />
      <AccessibleButton label="Gerar senha" icon="refresh-outline" variant="secondary" onPress={() => setPassword(generatePassword())} />
      {advice && <View style={{ marginVertical: spacing.md, gap: spacing.sm }}>
        <AccessibleText bold color={advice.score < 3 ? colors.warning : colors.success}>Forca estimada: {advice.label}</AccessibleText>
        <AccessibleText variant="caption">{advice.advice}</AccessibleText>
      </View>}
      <AccessibleTextInput
        label="Site (opcional)"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      <AccessibleTextInput label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline />

      <View style={styles.switchRow}>
        <AccessibleSwitch label="Exigir aprovacao de um familiar" value={requiresApproval} onValueChange={setRequiresApproval}
          disabled={submitting} description="Um familiar de confianca precisara autorizar antes que esta senha seja exibida." />
      </View>

      <AccessibleButton label="Salvar senha" icon="save-outline" onPress={handleSave} loading={submitting} />
      </>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chip: {
    minHeight: touchTarget.minHeight,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    marginRight: spacing.sm,
    borderRadius: touchTarget.borderRadius,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  chipSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.lg,
  },
});
