import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptico } from '@/accion';
import { color } from '@/tema';
import { Icono, Presionable } from '@/ui';

const OPCIONES: { ruta: string; titulo: string; icono: Parameters<typeof Icono>[0]['nombre'] }[] = [
  { ruta: '/clientes', titulo: 'Clientes', icono: 'person.2' },
  { ruta: '/inventario', titulo: 'Inventario', icono: 'shippingbox' },
  { ruta: '/preguntar', titulo: 'Pregúntale a Claude', icono: 'bubble.left.and.text.bubble.right' },
  { ruta: '/compra', titulo: 'Compra a proveedor', icono: 'doc.text.viewfinder' },
  { ruta: '/importar-pedido', titulo: 'Pedido del suplidor (PDF o foto)', icono: 'doc.richtext' },
  { ruta: '/reportes', titulo: 'Reportes', icono: 'chart.bar' },
  { ruta: '/negocio', titulo: 'Mi empresa', icono: 'building.2' },
  { ruta: '/asistente', titulo: 'Asistente Claude', icono: 'sparkles' },
  { ruta: '/respaldo', titulo: 'Respaldo de datos', icono: 'externaldrive' },
  { ruta: '/avisos', titulo: 'Avisos y errores', icono: 'exclamationmark.triangle' },
];

/**
 * Botón flotante arriba a la derecha con todo lo que no va en la barra de abajo: clientes, inventario, reportes,
 * configuración y respaldo. Se pone al final de cada pantalla de pestaña; se posiciona solo bajo la barra de estado.
 */
export function BotonMenu() {
  const { top } = useSafeAreaInsets();
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Presionable
        accessibilityRole="button"
        accessibilityLabel="Menú: clientes, inventario, reportes y configuración"
        hundir={0.9}
        posicion={{ position: 'absolute', right: 16, top: top + 8, zIndex: 10 }}
        style={estilos.boton}
        onPress={() => {
          haptico();
          setAbierto(true);
        }}>
        <Icono nombre="ellipsis" tam={18} />
      </Presionable>

      <Modal transparent animationType="fade" visible={abierto} onRequestClose={() => setAbierto(false)}>
        <Pressable accessibilityLabel="Cerrar menú" style={estilos.fondo} onPress={() => setAbierto(false)}>
          <View style={[estilos.panel, { top: top + 56 }]}>
            {OPCIONES.map((o, i) => (
              <Pressable
                key={o.ruta}
                accessibilityRole="button"
                style={[estilos.fila, i > 0 && estilos.separador]}
                onPress={() => {
                  setAbierto(false);
                  router.push(o.ruta as never);
                }}>
                <Icono nombre={o.icono} tam={18} tinte={color.primario} />
                <Text style={estilos.titulo}>{o.titulo}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const estilos = StyleSheet.create({
  boton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  panel: {
    position: 'absolute',
    right: 16,
    width: 230,
    borderRadius: 16,
    backgroundColor: color.tarjeta,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fila: { paddingHorizontal: 16, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12 },
  separador: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borde },
  titulo: { fontSize: 16, fontWeight: '600', color: color.texto },
});
