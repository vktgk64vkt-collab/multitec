import { Link, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { listarClientes, type Cliente } from '@/db/clientes';
import { crearProyecto, PRIORIDAD_MEDIA, PRIORIDADES, TIPOS } from '@/db/proyectos';
import { color } from '@/tema';
import { Boton, Campo, Chip, Etiqueta, Tarjeta } from '@/ui';

export default function NuevoProyecto() {
  const db = useSQLiteContext();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<string>(TIPOS[0]);
  const [prioridad, setPrioridad] = useState(PRIORIDAD_MEDIA);

  useFocusEffect(
    useCallback(() => {
      listarClientes(db).then(setClientes);
    }, [db])
  );

  async function guardar() {
    if (clienteId === null || !nombre.trim()) {
      return Alert.alert('Faltan datos', 'Elige un cliente y escribe el nombre del proyecto.');
    }
    await crearProyecto(db, clienteId, nombre.trim(), tipo, prioridad);
    router.back();
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Tarjeta>
        <Campo placeholder="Nombre del proyecto" value={nombre} onChangeText={setNombre} />
      </Tarjeta>

      <Etiqueta>Cliente</Etiqueta>
      {clientes.length === 0 && (
        <Link href="/clientes/formulario" style={estilos.enlace}>
          No hay clientes. Crea el primero.
        </Link>
      )}
      {clientes.map((c) => (
        <Pressable
          key={c.id}
          style={[estilos.opcion, c.id === clienteId && estilos.activa]}
          onPress={() => setClienteId(c.id)}>
          <Text style={[estilos.texto, c.id === clienteId && estilos.textoActivo]}>{c.nombre}</Text>
        </Pressable>
      ))}

      <Etiqueta>Tipo</Etiqueta>
      {TIPOS.map((t) => (
        <Pressable key={t} style={[estilos.opcion, t === tipo && estilos.activa]} onPress={() => setTipo(t)}>
          <Text style={[estilos.texto, t === tipo && estilos.textoActivo]}>{t}</Text>
        </Pressable>
      ))}

      <Etiqueta>Prioridad (los más urgentes salen primero en Inicio)</Etiqueta>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {[2, 1, 0].map((n) => (
          <Chip key={n} texto={PRIORIDADES[n]} activo={prioridad === n} onPress={() => setPrioridad(n)} />
        ))}
      </View>

      <Boton texto="Guardar proyecto" onPress={guardar} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 10 },
  enlace: { color: color.primario, fontSize: 16 },
  opcion: { padding: 14, borderRadius: 14, backgroundColor: color.tarjeta },
  activa: { backgroundColor: color.primario },
  texto: { fontSize: 16, color: color.texto },
  textoActivo: { color: '#fff', fontWeight: '600' },
});
