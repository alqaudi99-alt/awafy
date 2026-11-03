import { Slot } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BottomBar } from '@/components/bottom-bar';
import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <View style={styles.root}>
      <View style={styles.body}>
        <Slot />
      </View>
      <BottomBar />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.background },
  body: { flex: 1 },
});
