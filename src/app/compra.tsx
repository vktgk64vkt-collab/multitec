import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mensajeError } from '@/accion';
import { Alert } from '@/alert';
import { leerFacturaProveedor, leerClave } from '@/claude';
import { listarCatalogo, registrarCompra, type Producto } from '@/db/catalogo';
import { moneda, precioDesdeCosto } from '@/dinero';
import { tomarImagen } from '@/imagenIA';
import { separarApodos } from '@/pedido';
import { color } from '@/tema';
import { Aparece, Boton, Chip, Etiqueta, Tarjeta } from '@/ui';

interface LineaCompra {
  clave: number;
  texto: string;
  item: Producto | null;
  cantidad: number;
  costo_cts: number;
  incluir: boolean;
}

/**
 * Compra a un proveedor: fotografías la factura, Claude lee los artículos y los relaciona con tu inventario.
 * Tú revisas y, al confirmar, suma el stock y actualiza el costo (y el precio, si el artículo tiene margen).
 */
export default function Compra() {
  const db = useSQLiteContext();
  const [inventario, setInventario] = useState<Producto[]>([]);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [proveedor, setProveedor] = useState<string | null>(null);
  const [lineas, setLineas] = useState<LineaCompra[] | null>(null);

  useFocusEffect(
    useCallback(() => {
      listarCatalogo(db).then(setInventario);
    }, [db])
  );

  async function leer(origen: 'camara' | 'galeria') {
    if (!(await leerClave())) return Alert.alert('Falta la clave de Claude', 'Leer facturas lo hace Claude. Agrégala en Más, Asistente Claude.');
    if (inventario.length === 0) return Alert.alert('El inventario está vacío', 'Primero agrega tus equipos en el menú, Inventario.');
    const imagen = await tomarImagen(origen);
    if (!imagen) return;
    setAviso(null);
    setLineas(null);
    setLeyendo(true);
    try {
      const porId = new Map(inventario.map((p) => [p.id, p]));
      const c = await leerFacturaProveedor(
        imagen,
        inventario.map((p) => ({ id: p.id, nombre: p.nombre, apodos: separarApodos(p.apodos), tipo: p.tipo }))
      );
      setProveedor(c.proveedor);
      setAviso(c.notas);
      setLineas(c.lineas.map((l, i) => ({ clave: i, texto: l.texto, item: l.id !== null ? (porId.get(l.id) ?? null) : null, cantidad: l.cantidad, costo_cts: l.costo_cts, incluir: l.id !== null })));
      if (c.lineas.length === 0) setAviso('No pude leer artículos en la foto. Prueba con otra más cercana y con buena luz.');
    } catch (e) {
      setAviso(mensajeError(e));
    } finally {
      setLeyendo(false);
    }
  }

  const cambiar = (clave: number, cambio: Partial<LineaCompra>) => setLineas((ls) => ls && ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
  const aRegistrar = (lineas ?? []).filter((l) => l.incluir && l.item);
  const sinInventario = (lineas ?? []).filter((l) => !l.item).length;

  async function registrar() {
    if (aRegistrar.length === 0) return Alert.alert('Nada que registrar', 'Marca al menos un artículo del inventario.');
    for (const l of aRegistrar) await registrarCompra(db, (l.item as Producto).id, l.cantidad, l.costo_cts);
    Alert.alert('Compra registrada', `Se actualizaron ${aRegistrar.length} artículo${aRegistrar.length === 1 ? '' : 's'} del inventario.`);
    router.back();
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor}>
      <Stack.Screen options={{ title: 'Compra a proveedor' }} />
      <Tarjeta>
        <Etiqueta>Factura del proveedor</Etiqueta>
        <Text style={estilos.detalle}>Toma una foto de la factura (completa, derecha y con buena luz). Claude lee los artículos y tú confirmas antes de tocar el inventario.</Text>
        <View style={estilos.fila}>
          <View style={{ flex: 1 }}>
            <Boton icono="camera" texto="Tomar foto" onPress={() => leer('camara')} />
          </View>
          <View style={{ flex: 1 }}>
            <Boton tipo="secundario" icono="photo" texto="De la galería" onPress={() => leer('galeria')} />
          </View>
        </View>
        {leyendo ? <ActivityIndicator color={color.primario} /> : null}
        {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : null}
      </Tarjeta>

      {lineas && lineas.length > 0 ? (
        <>
          <Etiqueta>{proveedor ? `Revisa la compra a ${proveedor}` : 'Revisa la compra'}</Etiqueta>
          {lineas.map((l, i) => {
            const nuevoPrecio = l.item && l.costo_cts > 0 && l.item.margen1_pct !== null ? precioDesdeCosto(l.costo_cts, l.item.margen1_pct) : null;
            return (
              <Aparece key={l.clave} indice={i}>
                <Tarjeta style={{ gap: 6, opacity: l.incluir || !l.item ? 1 : 0.5 }}>
                  {l.item ? (
                    <>
                      <Text style={estilos.nombre}>{l.item.nombre}</Text>
                      <Text style={estilos.detalle}>
                        Factura: «{l.texto}» · Stock {l.item.stock ?? 0} → {l.item.tipo === 'servicio' ? '—' : (l.item.stock ?? 0) + l.cantidad}
                      </Text>
                      <Text style={estilos.detalle}>
                        {l.costo_cts > 0 ? `Costo ${moneda(l.item.costo_cts)} → ${moneda(l.costo_cts)}` : 'Costo no leído: no se cambia'}
                        {nuevoPrecio !== null ? ` · Precio ${moneda(l.item.precio_cts)} → ${moneda(nuevoPrecio)}` : ''}
                      </Text>
                      <View style={estilos.fila}>
                        <Chip borde texto="−" onPress={() => cambiar(l.clave, { cantidad: Math.max(1, l.cantidad - 1) })} />
                        <Text style={estilos.cantidad}>{l.cantidad}</Text>
                        <Chip borde texto="+" onPress={() => cambiar(l.clave, { cantidad: l.cantidad + 1 })} />
                        <View style={{ flex: 1 }} />
                        <Chip borde activo={l.incluir} texto={l.incluir ? 'Incluido' : 'Omitido'} onPress={() => cambiar(l.clave, { incluir: !l.incluir })} />
                      </View>
                    </>
                  ) : (
                    <>
                      <Text style={[estilos.nombre, { color: color.alerta }]}>No está en tu inventario: «{l.texto}»</Text>
                      <Text style={estilos.detalle}>Cantidad {l.cantidad}. Agrégalo al inventario (puedes dictarlo en Dictar pedido) y vuelve a leer la factura.</Text>
                    </>
                  )}
                </Tarjeta>
              </Aparece>
            );
          })}
          {sinInventario > 0 ? <Text style={estilos.aviso}>{sinInventario} línea(s) no están en el inventario y no se registrarán.</Text> : null}
          <Boton icono="checkmark.circle.fill" texto={`Registrar ${aRegistrar.length} artículo${aRegistrar.length === 1 ? '' : 's'}`} onPress={registrar} />
        </>
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 13, color: color.suave },
  aviso: { fontSize: 13, color: color.alerta, fontWeight: '600' },
  cantidad: { minWidth: 28, textAlign: 'center', fontSize: 17, fontWeight: '700', color: color.texto },
});
