import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Alert } from '@/alert';
import { actualizarCliente, crearCliente, obtenerCliente, type DatosCliente } from '@/db/clientes';

type Campo = keyof DatosCliente;

const CAMPOS: { campo: Campo; etiqueta: string; teclado?: 'phone-pad' | 'email-address'; multilinea?: boolean }[] = [
  { campo: 'nombre', etiqueta: 'Nombre *' },
  { campo: 'empresa', etiqueta: 'Empresa' },
  { campo: 'telefono', etiqueta: 'Teléfono', teclado: 'phone-pad' },
  { campo: 'correo', etiqueta: 'Correo', teclado: 'email-address' },
  { campo: 'direccion', etiqueta: 'Dirección', multilinea: true },
  { campo: 'id_fiscal', etiqueta: 'ID fiscal (RFC, NIT, etc.)' },
  { campo: 'notas', etiqueta: 'Notas', multilinea: true },
];

const VACIO: Record<Campo, string> = {
  nombre: '', empresa: '', telefono: '', correo: '', direccion: '', id_fiscal: '', notas: '',
};

export default function FormularioCliente() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const idCliente = id ? Number(id) : null;
  const [valores, setValores] = useState(VACIO);

  useEffect(() => {
    if (idCliente === null) return;
    obtenerCliente(db, idCliente).then((c) => {
      if (!c) return;
      setValores({
        nombre: c.nombre,
        empresa: c.empresa ?? '',
        telefono: c.telefono ?? '',
        correo: c.correo ?? '',
        direccion: c.direccion ?? '',
        id_fiscal: c.id_fiscal ?? '',
        notas: c.notas ?? '',
      });
    });
  }, [db, idCliente]);

  async function guardar() {
    const nombre = valores.nombre.trim();
    if (!nombre) {
      Alert.alert('Falta el nombre', 'El nombre del cliente es obligatorio.');
      return;
    }
    const datos: DatosCliente = {
      nombre,
      empresa: valores.empresa.trim() || null,
      telefono: valores.telefono.trim() || null,
      correo: valores.correo.trim() || null,
      direccion: valores.direccion.trim() || null,
      id_fiscal: valores.id_fiscal.trim() || null,
      notas: valores.notas.trim() || null,
    };
    if (idCliente === null) await crearCliente(db, datos);
    else await actualizarCliente(db, idCliente, datos);
    router.back();
  }

  return (
    <ScrollView contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen
        options={{
          title: idCliente === null ? 'Nuevo cliente' : 'Editar cliente',
          headerRight: () => (
            <Text style={estilos.guardar} onPress={guardar}>
              Guardar
            </Text>
          ),
        }}
      />
      {CAMPOS.map(({ campo, etiqueta, teclado, multilinea }) => (
        <View key={campo} style={estilos.grupo}>
          <Text style={estilos.etiqueta}>{etiqueta}</Text>
          <TextInput
            style={[estilos.input, multilinea && estilos.multilinea]}
            value={valores[campo]}
            onChangeText={(t) => setValores((v) => ({ ...v, [campo]: t }))}
            keyboardType={teclado}
            autoCapitalize={teclado === 'email-address' ? 'none' : 'sentences'}
            multiline={multilinea}
          />
        </View>
      ))}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 14 },
  grupo: { gap: 4 },
  etiqueta: { fontSize: 13, fontWeight: '600', opacity: 0.7 },
  input: {
    padding: 12,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#999',
    fontSize: 16,
  },
  multilinea: { minHeight: 80, textAlignVertical: 'top' },
  guardar: { color: '#1e6fa8', fontSize: 17, fontWeight: '600' },
});
