import type { ComponentProps, ReactNode } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '../../hooks/useThemeColors';
import { radii, spacing, toneColors, type Tone } from '../../theme/theme';
import { AccessibleText } from './AccessibleText';
import { AccessibleButton } from './AccessibleButton';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export function IconBadge({ icon, tone = 'primary', large = false }: { icon: IconName; tone?: Tone; large?: boolean }) {
  const palette = useThemeColors();
  const colors = toneColors(palette, tone);
  return <View accessible={false} aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={{ width: large ? 72 : 48, height: large ? 72 : 48, borderRadius: large ? 24 : 16,
    backgroundColor: colors.background, borderWidth: 1, borderColor: palette.border, alignItems: 'center', justifyContent: 'center' }}>
    <Ionicons name={icon} size={large ? 34 : 24} color={colors.foreground} accessible={false} />
  </View>;
}

export function ScreenHeading({ title, description, eyebrow, onBack, icon }: {
  title: string; description?: string; eyebrow?: string; onBack?: () => void; icon?: IconName;
}) {
  const colors = useThemeColors();
  return <View style={{ marginBottom: spacing.lg, gap: spacing.sm }}>
    {onBack && <View style={{ alignSelf: 'flex-start' }}><AccessibleButton label="Voltar" icon="arrow-back-outline" variant="quiet" onPress={onBack} /></View>}
    {eyebrow && <AccessibleText variant="caption" bold color={colors.primary}>{eyebrow}</AccessibleText>}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
      {icon && <IconBadge icon={icon} />}
      <AccessibleText variant="title" style={{ flex: 1 }}>{title}</AccessibleText>
    </View>
    {description && <AccessibleText color={colors.textSecondary}>{description}</AccessibleText>}
  </View>;
}

export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return <View style={{ marginBottom: spacing.md, gap: spacing.xs }}>
    <AccessibleText variant="bodyLarge" bold accessibilityRole="header">{title}</AccessibleText>
    {description && <AccessibleText variant="caption">{description}</AccessibleText>}
  </View>;
}

export function HeroCard({ title, description, eyebrow, icon = 'key-outline', children, compact = false }: {
  title: string; description: string; eyebrow?: string; icon?: IconName; children?: ReactNode; compact?: boolean;
}) {
  const colors = useThemeColors();
  return <View style={[styles.hero, { backgroundColor: colors.primaryDark }]}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.orbit, { borderColor: colors.heroDecoration }]} />
    <View style={{ alignItems: 'flex-start', gap: spacing.md }}>
      <View style={{ flexDirection: compact ? 'row' : 'column', gap: spacing.md, alignSelf: 'stretch', alignItems: compact ? 'center' : 'flex-start' }}>
        <IconBadge icon={icon} tone="warning" />
        <View style={{ gap: compact ? spacing.xs : spacing.md, flexShrink: 1 }}>
          {eyebrow && <AccessibleText variant="caption" color={colors.inverse}>{eyebrow}</AccessibleText>}
          <AccessibleText variant={compact ? 'title' : 'titleLarge'} color={colors.inverse}>{title}</AccessibleText>
        </View>
      </View>
      <AccessibleText color={colors.inverse}>{description}</AccessibleText>
      {children}
    </View>
  </View>;
}

export function StatusPill({ label, tone = 'primary', icon }: { label: string; tone?: Tone; icon?: IconName }) {
  const palette = useThemeColors();
  const colors = toneColors(palette, tone);
  return <View style={[styles.pill, { backgroundColor: colors.background, borderColor: palette.border }]}>
    {icon && <Ionicons name={icon} color={colors.foreground} size={18} accessible={false} aria-hidden />}
    <AccessibleText variant="caption" bold color={colors.foreground} style={{ flexShrink: 1 }}>{label}</AccessibleText>
  </View>;
}

export function Notice({ title, children, tone = 'primary', icon = 'information-circle-outline' }: {
  title?: string; children: ReactNode; tone?: Tone; icon?: IconName;
}) {
  const palette = useThemeColors();
  const colors = toneColors(palette, tone);
  return <View accessibilityLiveRegion={tone === 'danger' || tone === 'success' ? 'polite' : 'none'}
    style={[styles.notice, { backgroundColor: colors.background, borderColor: colors.foreground }]}>
    <Ionicons name={icon} size={24} color={colors.foreground} accessible={false} aria-hidden />
    <View style={{ flex: 1, gap: spacing.xs }}>
      {title && <AccessibleText bold color={colors.foreground}>{title}</AccessibleText>}
      {typeof children === 'string' ? <AccessibleText variant="caption" color={colors.foreground}>{children}</AccessibleText> : children}
    </View>
  </View>;
}

export function EmptyState({ title, description, icon = 'sparkles-outline', actionLabel, onAction }: {
  title: string; description: string; icon?: IconName; actionLabel?: string; onAction?: () => void;
}) {
  return <View style={{ alignItems: 'center', paddingVertical: spacing.xl, gap: spacing.md }}>
    <IconBadge icon={icon} tone="coral" large />
    <AccessibleText variant="bodyLarge" bold style={{ textAlign: 'center' }}>{title}</AccessibleText>
    <AccessibleText variant="body" style={{ textAlign: 'center' }}>{description}</AccessibleText>
    {actionLabel && onAction && <AccessibleButton label={actionLabel} variant="secondary" onPress={onAction} />}
  </View>;
}

export function LoadingState({ label }: { label: string }) {
  const colors = useThemeColors();
  return <View accessibilityLiveRegion="polite" style={{ padding: spacing.xl, alignItems: 'center', gap: spacing.md }}>
    <ActivityIndicator size="large" color={colors.primary} accessible={false} />
    <AccessibleText style={{ textAlign: 'center' }}>{label}</AccessibleText>
  </View>;
}

const styles = StyleSheet.create({
  hero: { padding: spacing.lg, borderRadius: radii.lg, overflow: 'hidden', marginBottom: spacing.lg },
  orbit: { position: 'absolute', width: 240, height: 240, borderRadius: 120, borderWidth: 34, right: -110, top: -70 },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6,
    borderRadius: radii.sm, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, maxWidth: '100%' },
  notice: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md,
    borderRadius: radii.md, borderLeftWidth: 3, marginBottom: spacing.md },
});
