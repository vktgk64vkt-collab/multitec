import { router } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { haptico } from '@/accion';
import { color } from '@/tema';

const OPCIONES = [
  { ruta: '/clientes', titulo: 'Clientes', detalle: 'Tus clientes y sus proyectos' },
  { ruta: '/inventario', titulo: 'Inventario', detalle: 'Equipos y servicios, precios y stock' },
  { ruta: '/reportes', titulo: 'Reportes', detalle: 'Facturado por mes y mejores clientes' },
  { ruta: '/negocio', titulo: 'Mi empresa', detalle: 'Logo, color y datos de tus documentos' },
  { ruta: '/asistente', titulo: 'Asistente Claude', detalle: 'Clave de API para dictar pedidos' },
  { ruta: '/respaldo', titulo: 'Respaldo de datos', detalle: 'Exportar o restaurar tu información' },
] as const;

/**
 * Botón flotante arriba a la derecha con todo lo que no va en la barra de abajo: clientes, inventario, reportes,
 * configuración y respaldo. Se pone al final de cada pantalla de pestaña; se posiciona solo bajo la barra de estado.
 */
export function BotonMenu() {
  const { top } = useSafeAreaInsets();
  const [abierto, setAbierto] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Menú: clientes, inventario, reportes y configuración"
        style={[estilos.boton, { top: top + 8 }]}
        onPress={() => {
          haptico();
          setAbierto(true);
        }}>
        <Text style={estilos.puntos}>•••</Text>
      </Pressable>

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
                  router.push(o.ruta);
                }}>
                <Text style={estilos.titulo}>{o.titulo}</Text>
                <Text style={estilos.detalle}>{o.detalle}</Text>
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
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    zIndex: 10,
  },
  puntos: { fontSize: 14, fontWeight: '800', color: color.texto, letterSpacing: 1 },
  fondo: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  panel: {
    position: 'absolute',
    right: 16,
    width: 290,
    borderRadius: 16,
    backgroundColor: color.tarjeta,
    paddingVertical: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  fila: { paddingHorizontal: 16, paddingVertical: 12, minHeight: 56, justifyContent: 'center' },
  separador: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: color.borde },
  titulo: { fontSize: 16, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 12, color: color.suave, marginTop: 1 },
});
