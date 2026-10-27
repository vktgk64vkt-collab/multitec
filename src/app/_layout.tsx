import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { migrarBaseDeDatos } from '@/db/migraciones';
import { color } from '@/tema';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="multitec.db" onInit={migrarBaseDeDatos}>
      <Stack screenOptions={{ contentStyle: { backgroundColor: color.fondo }, headerTintColor: color.primario, headerBackButtonDisplayMode: 'minimal' }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="proyecto/nuevo" options={{ title: 'Nuevo proyecto', presentation: 'modal' }} />
        <Stack.Screen name="proyecto/[id]" options={{ title: 'Proyecto' }} />
        <Stack.Screen name="levantamiento" />
        <Stack.Screen name="cotizacion" />
        <Stack.Screen name="propuesta" />
        <Stack.Screen name="pedido" options={{ title: 'Dictar pedido' }} />
        <Stack.Screen name="asistente" />
        <Stack.Screen name="bitacora" />
        <Stack.Screen name="factura" />
        <Stack.Screen name="clientes/index" options={{ title: 'Clientes' }} />
        <Stack.Screen name="clientes/[id]" options={{ title: 'Cliente' }} />
        <Stack.Screen name="clientes/formulario" />
        <Stack.Screen name="respaldo" />
        <Stack.Screen name="negocio" />
        <Stack.Screen name="inventario" />
        <Stack.Screen name="inventario/articulo" />
        <Stack.Screen name="reportes" />
      </Stack>
    </SQLiteProvider>
  );
}
