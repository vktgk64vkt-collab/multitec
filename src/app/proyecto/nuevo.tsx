import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { buscarOCrearCliente, listarClientes, type Cliente } from '@/db/clientes';
import { crearProyecto, nombreAutomatico, PRIORIDAD_MEDIA, PRIORIDADES, TIPOS } from '@/db/proyectos';
import { normalizar } from '@/pedido';
import { color } from '@/tema';
import { Boton, Campo, Chip, Etiqueta, Tarjeta, PROPS_TECLADO } from '@/ui';

const MAX_SUGERENCIAS = 5;

/**
 * Empezar un levantamiento con lo mínimo: el cliente (se busca, o se crea ahí mismo escribiendo su nombre) y el tipo.
 * El nombre sale solo y se puede cambiar; la prioridad queda en "Más opciones".
 */
export default function NuevoLevantamiento() {
  const db = useSQLiteContext();
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [cliente, setCliente] = useState('');
  const [elegido, setElegido] = useState<Cliente | null>(null);
  const [nombre, setNombre] = useState('');
  const [tipo, setTipo] = useState<string>(TIPOS[0]);
  const [prioridad, setPrioridad] = useState(PRIORIDAD_MEDIA);
  const [mas, setMas] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listarClientes(db).then(setClientes);
    }, [db])
  );

  const q = normalizar(cliente);
  const coincidencias = q && !elegido ? clientes.filter((c) => normalizar(`${c.nombre} ${c.empresa ?? ''}`).includes(q)).slice(0, MAX_SUGERENCIAS) : [];
  const existe = clientes.some((c) => normalizar(c.nombre) === q);

  async function empezar() {
    const texto = (elegido?.nombre ?? cliente).trim();
    if (!texto) return Alert.alert('Falta el cliente', 'Escribe el nombre del cliente. Si es nuevo, se crea al empezar.');
    const clienteId = elegido?.id ?? (await buscarOCrearCliente(db, texto));
    const id = await crearProyecto(db, clienteId, nombre.trim() || nombreAutomatico(tipo, texto), tipo, prioridad);
    router.replace({ pathname: '/levantamiento', params: { proyecto: id } }); // directo a levantar equipos
  }

  return (
    <ScrollView {...PROPS_TECLADO} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Tarjeta>
        <Etiqueta>Cliente</Etiqueta>
        <Campo
          placeholder="Escribe para buscar o crear"
          value={cliente}
          onChangeText={(t) => {
            setCliente(t);
            setElegido(null);
          }}
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
        {coincidencias.map((c) => (
          <Pressable
            key={c.id}
            accessibilityRole="button"
            style={estilos.opcion}
            onPress={() => {
              setElegido(c);
              setCliente(c.nombre);
            }}>
            <Text style={estilos.nombre}>{c.nombre}</Text>
            {c.empresa || c.telefono ? <Text style={estilos.detalle}>{[c.empresa, c.telefono].filter(Boolean).join(' · ')}</Text> : null}
          </Pressable>
        ))}
        {q && !elegido && !existe ? <Text style={estilos.detalle}>«{cliente.trim()}» es un cliente nuevo: se crea al empezar.</Text> : null}
      </Tarjeta>

      <Etiqueta>Tipo</Etiqueta>
      <View style={estilos.chips}>
        {TIPOS.map((t) => (
          <Chip key={t} texto={t} activo={t === tipo} onPress={() => setTipo(t)} />
        ))}
      </View>

      <Boton texto="Empezar levantamiento" onPress={empezar} />

      <Chip borde texto={mas ? 'Menos opciones' : 'Más opciones'} onPress={() => setMas((v) => !v)} />
      {mas ? (
        <Tarjeta>
          <Etiqueta>Nombre (si lo dejas vacío se arma solo)</Etiqueta>
          <Campo placeholder={nombreAutomatico(tipo, cliente.trim() || 'Cliente')} value={nombre} onChangeText={setNombre} />
          <Etiqueta>Prioridad (los más urgentes salen primero en Inicio)</Etiqueta>
          <View style={estilos.chips}>
            {[2, 1, 0].map((n) => (
              <Chip key={n} texto={PRIORIDADES[n]} activo={prioridad === n} onPress={() => setPrioridad(n)} />
            ))}
          </View>
        </Tarjeta>
      ) : null}
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  opcion: { minHeight: 44, justifyContent: 'center', paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.borde },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 13, color: color.suave },
});
