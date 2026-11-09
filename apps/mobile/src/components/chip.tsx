import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/ui';
import { Colors } from '@/constants/theme';

export function Chip({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active }}
      onPress={onPress}
      style={[styles.chip, active && { backgroundColor: Colors.primary, borderColor: Colors.primary }]}>
      <AppText variant="small" style={{ color: active ? Colors.onPrimary : Colors.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 100,
    borderWidth: 1,
    borderColor: Colors.outlineVariant,
    backgroundColor: Colors.surface,
  },
});
