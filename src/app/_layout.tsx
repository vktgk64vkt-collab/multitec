import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { useEffect } from 'react';
import type { ErrorBoundaryProps } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { registrarAviso } from '@/avisos';

import { copiaDiaria, migrarConCopia } from '@/copiaAuto';
import { color } from '@/tema';

// fallos que nadie atrapó: quedan en Avisos con su código
const globalErrors = (globalThis as { ErrorUtils?: { getGlobalHandler(): (e: unknown, fatal?: boolean) => void; setGlobalHandler(f: (e: unknown, fatal?: boolean) => void): void } }).ErrorUtils;
if (globalErrors) {
  const previo = globalErrors.getGlobalHandler();
  globalErrors.setGlobalHandler((e, fatal) => {
    registrarAviso(e, fatal ? 'fallo.fatal' : 'fallo.global');
    previo(e, fatal);
  });
}

/** Pantalla de rescate cuando una pantalla se rompe: muestra el código en vez de cerrar la app. */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  const codigo = registrarAviso(error, 'pantalla');
  return (
    <View style={{ flex: 1, padding: 24, justifyContent: 'center', gap: 12, backgroundColor: color.fondo }}>
      <Text style={{ fontSize: 22, fontWeight: '700', color: color.texto }}>Algo falló en esta pantalla</Text>
      <Text style={{ fontSize: 16, color: color.suave }}>Código {codigo}. Queda guardado en Más, Avisos para corregirlo.</Text>
      <Pressable accessibilityRole="button" onPress={retry} style={{ padding: 14, borderRadius: 14, backgroundColor: color.primario, alignItems: 'center' }}>
        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Reintentar</Text>
      </Pressable>
    </View>
  );
}

function CopiaDiaria() {
  const db = useSQLiteContext();
  useEffect(() => {
    copiaDiaria(db);
  }, [db]);
  return null;
}

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="multitec.db" onInit={migrarConCopia}>
      <CopiaDiaria />
      <Stack screenOptions={{ contentStyle: { backgroundColor: color.fondo }, headerTintColor: color.primario, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="proyecto/nuevo" options={{ title: 'Nuevo levantamiento', presentation: 'modal' }} />
        <Stack.Screen name="proyecto/[id]" options={{ title: 'Proyecto' }} />
        <Stack.Screen name="levantamiento" />
        <Stack.Screen name="cotizacion" />
        <Stack.Screen name="propuesta" />
        <Stack.Screen
          name="pedido"
          options={{ title: 'Dictar pedido', presentation: 'formSheet', sheetGrabberVisible: true, sheetAllowedDetents: [0.6, 1], sheetInitialDetentIndex: 0, sheetCornerRadius: 22 }}
        />
        <Stack.Screen name="vista-previa" options={{ title: 'Vista previa' }} />
        <Stack.Screen name="asistente" />
        <Stack.Screen name="bitacora" />
        <Stack.Screen name="ejecucion" options={{ title: 'Ejecución' }} />
        <Stack.Screen name="factura" />
        <Stack.Screen name="clientes/index" options={{ title: 'Clientes' }} />
        <Stack.Screen name="clientes/[id]" options={{ title: 'Cliente' }} />
        <Stack.Screen name="clientes/formulario" />
        <Stack.Screen name="respaldo" />
        <Stack.Screen name="avisos" options={{ title: 'Avisos' }} />
        <Stack.Screen name="negocio" />
        <Stack.Screen name="inventario" />
        <Stack.Screen name="inventario/articulo" />
        <Stack.Screen name="reportes" />
      </Stack>
    </SQLiteProvider>
  );
}
