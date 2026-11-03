import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Colors } from '@/constants/theme';
import { AuthProvider } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { I18nProvider, useI18n } from '@/lib/i18n';

function RootStack() {
  const { t } = useI18n();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: Colors.background },
        headerTintColor: Colors.brandDark,
        contentStyle: { backgroundColor: Colors.background },
        headerBackButtonDisplayMode: 'minimal',
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: '' }} />
      <Stack.Screen name="order/[id]" options={{ title: t('timeline') }} />
      <Stack.Screen name="checkout" options={{ title: t('checkout') }} />
      <Stack.Screen name="login" options={{ title: t('loginTitle'), presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <CartProvider>
            <StatusBar style="dark" />
            <RootStack />
          </CartProvider>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
