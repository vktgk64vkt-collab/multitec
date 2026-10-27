import { Link, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { eliminarProducto, listarCatalogo, type Producto } from '@/db/catalogo';
import { formatear, preciosArticulo } from '@/dinero';
import { color } from '@/tema';
import { Campo, Tarjeta } from '@/ui';

const STOCK_BAJO = 2;

/** Lista del inventario: buscar, ver precios y stock. Crear y editar se hace en su propia pantalla. */
export default function Inventario() {
  const db = useSQLiteContext();
  const [productos, setProductos] = useState<Producto[]>([]);
  const [busqueda, setBusqueda] = useState('');

  useFocusEffect(
    useCallback(() => {
      listarCatalogo(db, busqueda).then(setProductos);
    }, [db, busqueda])
  );

  function confirmarEliminar(p: Producto) {
    Alert.alert('Eliminar del inventario', `¿Eliminar ${p.nombre}? Las cotizaciones que ya lo usan no cambian.`, [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar',
        style: 'destructive',
        onPress: async () => {
          await eliminarProducto(db, p.id);
          listarCatalogo(db, busqueda).then(setProductos);
        },
      },
    ]);
  }

  return (
    <FlatList
      data={productos}
      keyExtractor={(p) => String(p.id)}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={estilos.contenedor}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Stack.Screen
            options={{
              title: 'Inventario',
              headerRight: () => (
                <Link href="/inventario/articulo" asChild>
                  <Pressable accessibilityRole="button" hitSlop={12} style={estilos.nuevo}>
                    <Text style={estilos.textoNuevo}>+ Nuevo</Text>
                  </Pressable>
                </Link>
              ),
            }}
          />
          <Campo placeholder="Buscar por nombre, código o familia" value={busqueda} onChangeText={setBusqueda} clearButtonMode="while-editing" />
          <Text style={estilos.contador}>
            {productos.length} {productos.length === 1 ? 'artículo' : 'artículos'}
          </Text>
        </View>
      }
      ListEmptyComponent={
        <Text style={estilos.vacio}>
          {busqueda ? 'Sin resultados.' : 'El inventario está vacío. Toca "+ Nuevo" para agregar tu primer equipo o servicio.'}
        </Text>
      }
      ListFooterComponent={productos.length > 0 ? <Text style={estilos.pista}>Toca un artículo para editarlo. Mantén presionado para eliminarlo.</Text> : undefined}
      renderItem={({ item: p }) => {
        const [p1, p2, p3] = preciosArticulo(p);
        const auto = p.costo_cts > 0 && p.margen1_pct !== null;
        return (
          <Link href={{ pathname: '/inventario/articulo', params: { id: p.id } }} asChild>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={p.nombre}
              accessibilityHint="Toca para editar. Mantén presionado para eliminar."
              onLongPress={() => confirmarEliminar(p)}>
              <Tarjeta style={{ gap: 2 }}>
                <Text style={estilos.nombre}>{p.nombre}</Text>
                <Text style={estilos.detalle}>
                  {p.codigo ? `${p.codigo} · ` : ''}
                  {p.categoria ?? 'Sin familia'}
                  {p.stock !== null ? ` · ${p.stock === 0 ? 'sin stock' : `stock ${p.stock}`}` : ''}
                </Text>
                {p.apodos ? <Text style={estilos.detalle}>Apodos: {p.apodos}</Text> : null}
                {p.stock !== null && p.stock > 0 && p.stock <= STOCK_BAJO ? <Text style={estilos.bajo}>Stock bajo</Text> : null}
                <Text style={estilos.precios}>{auto ? `P1 ${formatear(p1)} · P2 ${formatear(p2)} · P3 ${formatear(p3)}` : `Precio ${formatear(p.precio_cts)}`}</Text>
              </Tarjeta>
            </Pressable>
          </Link>
        );
      }}
    />
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 10 },
  nuevo: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'flex-end' },
  textoNuevo: { color: color.primario, fontSize: 17, fontWeight: '600' },
  contador: { fontSize: 13, color: color.suave },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 13, color: color.suave },
  precios: { fontSize: 14, fontWeight: '600', color: color.texto, marginTop: 2 },
  bajo: { fontSize: 13, color: '#c0262d', fontWeight: '600' },
  vacio: { textAlign: 'center', color: color.suave, marginVertical: 24 },
  pista: { fontSize: 12, color: color.suave, textAlign: 'center', marginTop: 8 },
});
