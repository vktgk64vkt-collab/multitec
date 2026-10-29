import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { listarProyectos, type FiltroProyectos, type Proyecto } from '@/db/proyectos';
import { normalizar } from '@/pedido';
import { confirmarEliminarProyecto, FilaProyecto } from '@/proyectoUi';
import { PantallaTab } from '@/pestanas';
import { color } from '@/tema';
import { Buscador, Chip, PROPS_TECLADO } from '@/ui';

const FILTROS: { id: FiltroProyectos; texto: string }[] = [
  { id: 'activos', texto: 'En curso' },
  { id: 'cerrados', texto: 'Cerrados' },
  { id: 'todos', texto: 'Todos' },
];

/** Proyectos: todos tus proyectos, para buscar uno, ver los cerrados o crear uno nuevo. */
export default function Proyectos() {
  const db = useSQLiteContext();
  const [filtro, setFiltro] = useState<FiltroProyectos>('activos');
  const [busqueda, setBusqueda] = useState('');
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargado, setCargado] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listarProyectos(db, filtro).then((p) => {
        setProyectos(p);
        setCargado(true);
      });
    }, [db, filtro])
  );

  const q = normalizar(busqueda);
  const visibles = q ? proyectos.filter((p) => normalizar(`${p.nombre} ${p.cliente} ${p.tipo}`).includes(q)) : proyectos;

  return (
    <PantallaTab titulo="Proyectos">
      <FlatList {...PROPS_TECLADO}
        data={visibles}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={estilos.lista}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={{ gap: 10 }}>
            <Buscador placeholder="Buscar por proyecto, cliente o tipo" value={busqueda} onChangeText={setBusqueda} clearButtonMode="while-editing" autoCorrect={false} />
            <View style={estilos.filtros}>
              {FILTROS.map((f) => (
                <Chip key={f.id} texto={f.texto} activo={filtro === f.id} onPress={() => setFiltro(f.id)} />
              ))}
              <View style={{ flex: 1 }} />
              <Link href="/proyecto/nuevo" asChild>
                <Pressable accessibilityRole="button" style={estilos.nuevo}>
                  <Text style={estilos.textoNuevo}>+ Levantamiento</Text>
                </Pressable>
              </Link>
            </View>
          </View>
        }
        ListEmptyComponent={cargado ? <Text style={estilos.vacio}>{busqueda ? 'Sin resultados.' : filtro === 'cerrados' ? 'Aún no hay proyectos cerrados.' : 'No hay proyectos.'}</Text> : undefined}
        renderItem={({ item }) => (
          <FilaProyecto
            proyecto={item}
            href={{ pathname: '/proyecto/[id]', params: { id: item.id } }}
            onEliminar={() => confirmarEliminarProyecto(db, item, () => listarProyectos(db, filtro).then(setProyectos))}
          />
        )}
      />
    </PantallaTab>
  );
}

const estilos = StyleSheet.create({
  lista: { padding: 16, paddingTop: 8, paddingBottom: 24, gap: 10 },
  filtros: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  nuevo: { minHeight: 44, justifyContent: 'center' },
  textoNuevo: { color: color.primario, fontSize: 16, fontWeight: '600' },
  vacio: { textAlign: 'center', color: color.suave, marginTop: 24 },
});
