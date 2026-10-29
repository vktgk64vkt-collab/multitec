import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { mensajeError } from '@/accion';
import { Alert } from '@/alert';
import { leerClave, leerPedidoProveedor } from '@/claude';
import { aplicarPedidoProveedor, crearProducto, listarCatalogo, type Producto } from '@/db/catalogo';
import { obtenerMargenes, type Margenes } from '@/db/negocio';
import { moneda } from '@/dinero';
import { tomarImagen } from '@/imagenIA';
import { datosArticuloNuevo, MAX_BASE64_PDF, planificarPedido, type Fuente, type PedidoLeido } from '@/pedidoPdf';
import { color } from '@/tema';
import { Boton, Campo, Chip, Etiqueta, PROPS_TECLADO, Tarjeta } from '@/ui';

const MAX_BYTES = Math.floor((MAX_BASE64_PDF * 3) / 4);

/**
 * Pedido de un suplidor, en PDF o en foto: Claude lo lee y arma cada artículo con el nombre estándar, una descripción breve y su costo.
 * Tú revisas y al confirmar: lo nuevo entra al inventario con tus márgenes; lo que ya existe no se repite y su costo solo
 * se actualiza si el del pedido es mayor.
 */
export default function ImportarPedido() {
  const db = useSQLiteContext();
  const [inventario, setInventario] = useState<Producto[]>([]);
  const [pedido, setPedido] = useState<PedidoLeido | null>(null);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tasa, setTasa] = useState('');
  const [sumarStock, setSumarStock] = useState(true);
  const [omitidas, setOmitidas] = useState<Set<number>>(new Set());
  const [cantidades, setCantidades] = useState<Record<number, number>>({});
  const [guardando, setGuardando] = useState(false);
  const [margenes, setMargenes] = useState<Margenes>([15, 20, 30]);

  useFocusEffect(
    useCallback(() => {
      listarCatalogo(db).then(setInventario);
      obtenerMargenes(db).then(setMargenes);
    }, [db])
  );

  const enPesos = !pedido || pedido.moneda === 'DOP';
  const tasaNum = Number(tasa.trim().replace(',', '.'));
  const tasaValida = enPesos || (Number.isFinite(tasaNum) && tasaNum > 0);
  const plan = useMemo(() => (pedido ? planificarPedido(pedido.lineas, inventario, enPesos ? 1 : tasaValida ? tasaNum : 0) : []), [pedido, inventario, enPesos, tasaValida, tasaNum]);
  const cantidadDe = (clave: number, original: number) => cantidades[clave] ?? original;
  const incluidas = plan.filter((p) => !omitidas.has(p.clave));
  const nuevos = incluidas.filter((p) => !p.existente).length;
  const actualizados = incluidas.length - nuevos;

  /** Manda el pedido (PDF o foto) a Claude y deja el resultado para revisarlo. Nada se guarda todavía. */
  async function analizar(fuente: Fuente, nombre: string) {
    setAviso(null);
    setPedido(null);
    setOmitidas(new Set());
    setCantidades({});
    setTasa('');
    setArchivo(nombre);
    setLeyendo(true);
    try {
      const leido = await leerPedidoProveedor(fuente);
      setPedido(leido);
      setAviso(leido.lineas.length === 0 ? 'No encontré artículos. Revisa que sea un pedido o factura con la lista de artículos, y que se lea bien.' : leido.notas);
    } catch (e) {
      setAviso(mensajeError(e));
    } finally {
      setLeyendo(false);
    }
  }

  const sinClave = async () => {
    if (await leerClave()) return false;
    Alert.alert('Falta la clave de Claude', 'Leer el pedido lo hace Claude. Agrégala en Más, Asistente Claude.');
    return true;
  };

  async function elegirPdf() {
    if (await sinClave()) return;
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (r.canceled) return;
    const doc = r.assets[0];
    if (doc.size !== undefined && doc.size > MAX_BYTES) return Alert.alert('El PDF pesa demasiado', 'Divídelo en partes de menos de 22 MB.');
    // el PDF solo se analiza: se lee a memoria y la copia temporal se borra enseguida, salga bien o mal
    let base64: string;
    try {
      base64 = await new File(doc.uri).base64();
    } finally {
      try {
        new File(doc.uri).delete();
      } catch {
        // ya no estaba: nada que limpiar
      }
    }
    await analizar({ tipo: 'pdf', base64 }, doc.name);
  }

  async function elegirFoto(origen: 'camara' | 'galeria') {
    if (await sinClave()) return;
    const imagen = await tomarImagen(origen, 0.7); // calidad algo mayor: la letra de una factura es pequeña
    if (!imagen) return;
    await analizar({ tipo: 'imagen', ...imagen }, origen === 'camara' ? 'Foto del pedido' : 'Foto de la galería');
  }

  const alternar = (clave: number) =>
    setOmitidas((o) => {
      const n = new Set(o);
      if (n.has(clave)) n.delete(clave);
      else n.add(clave);
      return n;
    });

  async function confirmar() {
    if (!tasaValida) return Alert.alert('Falta la tasa', `El pedido está en ${pedido?.moneda}. Escribe cuántos pesos vale cada ${pedido?.moneda} para convertir los costos.`);
    if (incluidas.length === 0) return Alert.alert('Nada que agregar', 'Marca al menos un artículo.');
    setGuardando(true);
    try {
      await db.withTransactionAsync(async () => {
        for (const p of incluidas) {
          const cantidad = cantidadDe(p.clave, p.cantidad);
          if (p.existente) await aplicarPedidoProveedor(db, p.existente.id, cantidad, p.costo_cts, sumarStock);
          else await crearProducto(db, datosArticuloNuevo({ ...p, cantidad }, sumarStock, margenes));
        }
      });
      Alert.alert('Inventario actualizado', `${nuevos} artículo${nuevos === 1 ? '' : 's'} nuevo${nuevos === 1 ? '' : 's'} y ${actualizados} que ya existía${actualizados === 1 ? '' : 'n'}.`);
      router.back();
    } catch (e) {
      Alert.alert('No se pudo guardar', mensajeError(e));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <ScrollView {...PROPS_TECLADO} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor}>
      <Stack.Screen options={{ title: 'Pedido del suplidor' }} />
      <Tarjeta>
        <Etiqueta>Pedido o factura del suplidor</Etiqueta>
        <Text style={estilos.detalle}>
          Elige un PDF o toma una foto del pedido. Claude lo lee y arma cada artículo (nombre estándar, descripción breve y costo). Ni el PDF ni la foto se guardan en la app, y antes de guardar nada tú lo revisas.
        </Text>
        <Boton icono="doc.text.viewfinder" texto="Elegir PDF" onPress={elegirPdf} />
        <View style={estilos.fila}>
          <View style={{ flex: 1 }}>
            <Boton tipo="secundario" icono="camera" texto="Tomar foto" onPress={() => elegirFoto('camara')} />
          </View>
          <View style={{ flex: 1 }}>
            <Boton tipo="secundario" icono="photo" texto="De la galería" onPress={() => elegirFoto('galeria')} />
          </View>
        </View>
        <Text style={estilos.detalle}>Para la foto: la hoja completa, derecha y con buena luz. Si el pedido tiene varias hojas, una por una.</Text>
        {archivo ? <Text style={estilos.detalle}>{archivo}</Text> : null}
        {leyendo ? <ActivityIndicator color={color.primario} /> : null}
        {aviso ? <Text style={estilos.aviso}>{aviso}</Text> : null}
      </Tarjeta>

      {pedido && pedido.lineas.length > 0 ? (
        <>
          <Etiqueta>{pedido.proveedor ? `Revisa el pedido de ${pedido.proveedor}` : 'Revisa el pedido'}</Etiqueta>

          {!enPesos ? (
            <Tarjeta>
              <Text style={estilos.aviso}>Los precios del pedido están en {pedido.moneda}.</Text>
              <Text style={estilos.detalle}>Escribe cuántos pesos dominicanos vale cada {pedido.moneda} hoy para convertir los costos.</Text>
              <Campo placeholder="Tasa. Ej. 60.50" keyboardType="decimal-pad" value={tasa} onChangeText={setTasa} />
            </Tarjeta>
          ) : null}

          <Tarjeta>
            <Chip borde activo={sumarStock} texto={sumarStock ? 'Sumar las cantidades al stock' : 'No tocar el stock'} onPress={() => setSumarStock((v) => !v)} />
            <Text style={estilos.detalle}>
              Los artículos nuevos usan tus márgenes ({margenes.join(', ')} %). Un artículo que ya existe no se repite: si el costo del pedido es mayor, se actualiza (y su precio con sus márgenes); si es menor, se queda el registrado.
            </Text>
          </Tarjeta>

          {plan.map((p) => {
            const cantidad = cantidadDe(p.clave, p.cantidad);
            const e = p.existente;
            return (
              <Tarjeta key={p.clave} style={{ gap: 6, opacity: omitidas.has(p.clave) ? 0.5 : 1 }}>
                <Text style={estilos.nombre}>{e ? e.nombre : p.nombre}</Text>
                <Text style={[estilos.estado, { color: e ? color.suave : color.ok }]}>
                  {e ? `Ya existe${e.codigo ? ` (${e.codigo})` : ''}` : 'Nuevo en el inventario'}
                </Text>
                {!e && p.borrador.descripcion ? <Text style={estilos.detalle}>{p.borrador.descripcion}</Text> : null}
                {p.costo_cts === 0 ? (
                  <Text style={estilos.detalle}>{e ? 'El pedido no trae el costo: no se cambia.' : 'El pedido no trae el costo: complétalo después en el inventario.'}</Text>
                ) : e ? (
                  <Text style={estilos.detalle}>
                    {p.sube
                      ? `Costo ${moneda(e.costo_cts)} → ${moneda(p.costo_cts)}${p.precio_cts !== null ? ` · Precio ${moneda(e.precio_cts)} → ${moneda(p.precio_cts)}` : ''}`
                      : `Se queda el costo ${moneda(e.costo_cts)} (el del pedido, ${moneda(p.costo_cts)}, no es mayor)`}
                  </Text>
                ) : (
                  <Text style={estilos.detalle}>Costo {moneda(p.costo_cts)}</Text>
                )}
                <Text style={estilos.detalle}>En el pedido: «{p.texto}»</Text>
                <View style={estilos.fila}>
                  <Chip borde texto="−" onPress={() => setCantidades((c) => ({ ...c, [p.clave]: Math.max(1, cantidad - 1) }))} />
                  <Text style={estilos.cantidad}>{cantidad}</Text>
                  <Chip borde texto="+" onPress={() => setCantidades((c) => ({ ...c, [p.clave]: cantidad + 1 }))} />
                  <View style={{ flex: 1 }} />
                  <Chip borde activo={!omitidas.has(p.clave)} texto={omitidas.has(p.clave) ? 'Omitido' : 'Incluido'} onPress={() => alternar(p.clave)} />
                </View>
              </Tarjeta>
            );
          })}

          {pedido.ilegibles.length > 0 ? (
            <Text style={estilos.aviso}>
              {pedido.ilegibles.length} línea(s) no se pudieron interpretar y no se agregarán: {pedido.ilegibles.slice(0, 3).join(' · ')}
              {pedido.ilegibles.length > 3 ? '…' : ''}
            </Text>
          ) : null}

          <Boton
            icono="checkmark.circle.fill"
            texto={guardando ? 'Guardando…' : `Agregar al inventario (${nuevos} nuevo${nuevos === 1 ? '' : 's'}, ${actualizados} existente${actualizados === 1 ? '' : 's'})`}
            onPress={confirmar}
          />
        </>
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  fila: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto },
  estado: { fontSize: 13, fontWeight: '600' },
  detalle: { fontSize: 13, color: color.suave },
  aviso: { fontSize: 13, color: color.alerta, fontWeight: '600' },
  cantidad: { minWidth: 28, textAlign: 'center', fontSize: 17, fontWeight: '700', color: color.texto },
});
