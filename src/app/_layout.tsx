import { Stack } from 'expo-router';
import { SQLiteProvider } from 'expo-sqlite';

import { migrarBaseDeDatos } from '@/db/migraciones';

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName="multitec.db" onInit={migrarBaseDeDatos}>
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Proyectos' }} />
        <Stack.Screen name="proyecto/nuevo" options={{ title: 'Nuevo proyecto', presentation: 'modal' }} />
        <Stack.Screen name="proyecto/[id]" options={{ title: 'Proyecto' }} />
        <Stack.Screen name="levantamiento" />
        <Stack.Screen name="cotizacion" />
        <Stack.Screen name="bitacora" />
        <Stack.Screen name="factura" />
        <Stack.Screen name="respaldo" />
        <Stack.Screen name="clientes/index" options={{ title: 'Clientes' }} />
        <Stack.Screen name="clientes/[id]" options={{ title: 'Cliente' }} />
        <Stack.Screen name="clientes/formulario" />
      </Stack>
    </SQLiteProvider>
  );
}
