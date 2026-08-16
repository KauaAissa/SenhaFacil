import { useState } from 'react';
import { View, Switch, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Screen } from '../../../components/ui/Screen';
import { AccessibleText } from '../../../components/ui/AccessibleText';
import { AccessibleTextInput } from '../../../components/ui/AccessibleTextInput';
import { AccessibleButton } from '../../../components/ui/AccessibleButton';
import { vaultService } from '../../../services/vault.service';
import { colors, spacing, touchTarget } from '../../../theme/theme';

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

  const [label, setLabel] = useState('');
  const [category, setCategory] = useState<Category>('OTHER');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [url, setUrl] = useState('');
  const [notes, setNotes] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handleSave() {
    if (!label.trim() || !password) {
      Alert.alert('Preencha ao menos o nome e a senha.');
      return;
    }

    setSubmitting(true);
    try {
      await vaultService.createItem({
        label: label.trim(),
        category,
        plaintext: {
          login: login.trim() || undefined,
          password,
          url: url.trim() || undefined,
          notes: notes.trim() || undefined,
        },
        requiresApproval,
      });
      router.back();
    } catch (err) {
      Alert.alert('Não foi possível salvar', err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
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
      <AccessibleTextInput
        label="Site (opcional)"
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        keyboardType="url"
      />
      <AccessibleTextInput label="Observações (opcional)" value={notes} onChangeText={setNotes} multiline />

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <AccessibleText variant="body" bold>
            Exigir aprovação de um familiar
          </AccessibleText>
          <AccessibleText variant="caption">
            Um familiar de confiança precisará autorizar antes que esta senha seja exibida.
          </AccessibleText>
        </View>
        <Switch value={requiresApproval} onValueChange={setRequiresApproval} />
      </View>

      <AccessibleButton label="Salvar senha" onPress={handleSave} loading={submitting} />
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
