import { Link, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { Alert } from '@/alert';
import { listarClientes, type Cliente } from '@/db/clientes';
import { crearProyecto, TIPOS } from '@/db/proyectos';

export default function NuevoProyecto() {
  const db = useSQLiteContext();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [clienteId, setClienteId] = useState<number | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<string>(TIPOS[0]);

  useFocusEffect(
    useCallback(() => {
      listarClientes(db).then(setClientes);
    }, [db])
  );

  async function guardar() {
    if (clienteId === null || !nombre.trim()) {
      return Alert.alert('Faltan datos', 'Elige un cliente y escribe el nombre del proyecto.');
    }
    await crearProyecto(db, clienteId, nombre.trim(), tipo);
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <TextInput style={estilos.campo} placeholder="Nombre del proyecto" value={nombre} onChangeText={setNombre} />

      <Text style={estilos.etiqueta}>Cliente</Text>
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
          <Text style={c.id === clienteId && estilos.textoActivo}>{c.nombre}</Text>
        </Pressable>
      ))}

      <Text style={estilos.etiqueta}>Tipo</Text>
      {TIPOS.map((t) => (
        <Pressable key={t} style={[estilos.opcion, t === tipo && estilos.activa]} onPress={() => setTipo(t)}>
          <Text style={t === tipo && estilos.textoActivo}>{t}</Text>
        </Pressable>
      ))}

      <Pressable style={estilos.boton} onPress={guardar}>
        <Text style={estilos.textoBoton}>Guardar</Text>
      </Pressable>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 10 },
  campo: {
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    fontSize: 16,
  },
  etiqueta: { fontSize: 13, fontWeight: '600', opacity: 0.6, marginTop: 6 },
  enlace: { color: '#1e6fa8', fontSize: 16 },
  opcion: { padding: 12, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: '#999' },
  activa: { backgroundColor: '#12292d' },
  textoActivo: { color: '#fff', fontWeight: '600' },
  boton: { padding: 14, borderRadius: 10, backgroundColor: '#12292d', alignItems: 'center', marginTop: 8 },
  textoBoton: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
