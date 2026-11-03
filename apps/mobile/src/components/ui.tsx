import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useI18n } from '@/lib/i18n';

type Variant = 'title' | 'heading' | 'body' | 'small' | 'label';

/** Text that aligns to the reading direction (right in Arabic, left in English). */
export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  const { lang } = useI18n();
  return (
    <Text
      {...props}
      // `lang` helps screen readers and the browser pick the right voice and shaping on web
      {...(Platform.OS === 'web' ? { lang } : {})}
      style={[styles.textBase, textVariants[variant], style]}
    />
  );
}

export function Screen({
  children,
  scroll = true,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { lang } = useI18n();
  const content = <View style={[styles.content, style]}>{children}</View>;
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* `dir` makes the web build lay out right-to-left for Arabic */}
      <View style={styles.flex} {...(Platform.OS === 'web' ? { dir: lang === 'ar' ? 'rtl' : 'ltr' } : {})}>
        {scroll ? (
          <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
            {content}
          </ScrollView>
        ) : (
          content
        )}
      </View>
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Button({
  title,
  variant = 'primary',
  loading,
  disabled,
  style,
  ...props
}: PressableProps & {
  title: string;
  variant?: 'primary' | 'secondary' | 'danger';
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!isDisabled, busy: !!loading }}
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.button,
        buttonVariants[variant],
        pressed && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      {...props}>
      {loading ? (
        <ActivityIndicator color={variant === 'secondary' ? Colors.primary : Colors.onPrimary} />
      ) : (
        <AppText variant="label" style={{ color: variant === 'secondary' ? Colors.primary : Colors.onPrimary }}>
          {title}
        </AppText>
      )}
    </Pressable>
  );
}

export function Field({ label, style, ...props }: TextInputProps & { label: string }) {
  return (
    <View style={styles.field}>
      <AppText variant="small" style={styles.fieldLabel}>
        {label}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={Colors.outline}
        style={[styles.input, style as StyleProp<TextStyle>]}
        {...props}
      />
    </View>
  );
}

export function Badge({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warning' | 'danger' }) {
  const palette = {
    info: { bg: Colors.secondaryContainer, fg: Colors.brandDark },
    warning: { bg: Colors.goldContainer, fg: Colors.gold },
    danger: { bg: Colors.errorContainer, fg: Colors.error },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      <AppText variant="small" style={{ color: palette.fg, fontWeight: '600' }}>
        {text}
      </AppText>
    </View>
  );
}

export function Notice({ text, tone = 'info' }: { text: string; tone?: 'info' | 'warning' }) {
  return (
    <View style={[styles.notice, tone === 'warning' && { backgroundColor: Colors.goldContainer }]}>
      <AppText variant="small" style={{ color: tone === 'warning' ? Colors.gold : Colors.brandDark }}>
        {text}
      </AppText>
    </View>
  );
}

export function Loading() {
  const { t } = useI18n();
  return (
    <View style={styles.centered} accessibilityLabel={t('loading')}>
      <ActivityIndicator color={Colors.primary} size="large" />
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const { t } = useI18n();
  return (
    <View style={styles.centered}>
      <AppText style={{ marginBottom: Spacing.md }}>{t('loadError')}</AppText>
      <Button title={t('retry')} variant="secondary" onPress={onRetry} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingBottom: 96 },
  content: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center', padding: Spacing.lg, gap: Spacing.md },
  // textAlign 'left' means "start" in React Native: right-aligned in RTL, left-aligned in LTR.
  textBase: { color: Colors.text, textAlign: 'left', writingDirection: 'auto' },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    gap: Spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.outlineVariant,
  },
  button: {
    minHeight: 48,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
  field: { gap: Spacing.xs },
  fieldLabel: { color: Colors.textSecondary },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.md,
    backgroundColor: Colors.surface,
    color: Colors.text,
    fontSize: 16,
    textAlign: 'left',
  },
  badge: { alignSelf: 'flex-start', paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: Radius.pill },
  notice: { backgroundColor: Colors.secondaryContainer, borderRadius: Radius.md, padding: Spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.xl, minHeight: 240 },
});

const textVariants = StyleSheet.create({
  title: { fontSize: 26, fontWeight: '800' },
  heading: { fontSize: 18, fontWeight: '700' },
  body: { fontSize: 16, lineHeight: 24 },
  small: { fontSize: 13, lineHeight: 19 },
  label: { fontSize: 16, fontWeight: '700' },
});

const buttonVariants = StyleSheet.create({
  primary: { backgroundColor: Colors.primary },
  secondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.primary },
  danger: { backgroundColor: Colors.error },
});
