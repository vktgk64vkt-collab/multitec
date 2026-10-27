import { Link, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { obtenerNegocio, type Negocio } from '@/db/negocio';
import { listarProyectos, type Proyecto } from '@/db/proyectos';
import { uriFoto } from '@/fotos';
import { paleta } from '@/marca';
import { BotonDictado } from '@/dictado';
import { BotonMenu } from '@/menu';
import { confirmarEliminarProyecto, FilaProyecto } from '@/proyectoUi';
import { color } from '@/tema';

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Inicio: el banner de tu empresa y, debajo, los proyectos que siguen en curso, los más urgentes primero. */
export default function Inicio() {
  const db = useSQLiteContext();
  const { top } = useSafeAreaInsets();
  const [proyectos, setProyectos] = useState<Proyecto[]>([]);
  const [cargado, setCargado] = useState(false);
  const [empresa, setEmpresa] = useState<Negocio | null | undefined>(undefined);

  useFocusEffect(
    useCallback(() => {
      listarProyectos(db, 'activos').then((p) => {
        setProyectos(p);
        setCargado(true);
      });
      obtenerNegocio(db).then(setEmpresa);
    }, [db])
  );

  const p = paleta(empresa?.color);
  const nombre = empresa?.nombre?.trim();
  const configurada = !!(nombre || empresa?.logo_uri);
  const urgentes = proyectos.filter((x) => x.prioridad === 2).length;
  const resumen = !cargado ? ' ' : proyectos.length === 0 ? 'Sin proyectos en curso' : `${plural(proyectos.length, 'proyecto', 'proyectos')} en curso${urgentes ? ` · ${urgentes} de prioridad alta` : ''}`;

  return (
    <View style={estilos.pantalla}>
      <View style={[estilos.banner, { backgroundColor: p.principal, paddingTop: top + 16 }]}>
        {empresa !== undefined && !configurada ? (
          <Link href="/negocio" asChild>
            <Pressable accessibilityRole="button" accessibilityLabel="Configurar mi empresa" style={{ gap: 2 }}>
              <Text style={[estilos.nombre, { color: p.sobrePrincipal }]}>Configura tu empresa</Text>
              <Text style={[estilos.sub, { color: p.sobrePrincipal }]}>Agrega tu logo, nombre y color para ver tu banner aquí</Text>
            </Pressable>
          </Link>
        ) : (
          <View style={estilos.cabecera}>
            {empresa?.logo_uri ? (
              <View style={estilos.placa}>
                <Image source={{ uri: uriFoto(empresa.logo_uri) }} style={estilos.logo} resizeMode="contain" accessibilityLabel={nombre ?? 'Logo'} />
              </View>
            ) : null}
            <View style={{ flex: 1 }}>
              {nombre ? (
                <Text style={[estilos.nombre, { color: p.sobrePrincipal }]} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">
                  {nombre}
                </Text>
              ) : null}
              {empresa?.lema?.trim() ? <Text style={[estilos.sub, { color: p.sobrePrincipal }]}>{empresa.lema.trim()}</Text> : null}
            </View>
          </View>
        )}
        <Text style={[estilos.resumen, { color: p.sobrePrincipal }]}>{resumen}</Text>
      </View>

      <FlatList
        data={proyectos}
        keyExtractor={(x) => String(x.id)}
        contentContainerStyle={estilos.lista}
        ListHeaderComponent={
          <View style={estilos.encabezadoLista}>
            <Text style={estilos.seccion}>En curso</Text>
            <Link href="/proyecto/nuevo" asChild>
              <Pressable accessibilityRole="button" style={estilos.nuevo}>
                <Text style={estilos.textoNuevo}>+ Nuevo proyecto</Text>
              </Pressable>
            </Link>
          </View>
        }
        ListEmptyComponent={cargado ? <Text style={estilos.vacio}>No hay proyectos en curso. Toca &quot;+ Nuevo proyecto&quot; para empezar uno.</Text> : undefined}
        renderItem={({ item }) => (
          <FilaProyecto
            proyecto={item}
            href={{ pathname: '/proyecto/[id]', params: { id: item.id } }}
            onEliminar={() => confirmarEliminarProyecto(db, item, () => listarProyectos(db, 'activos').then(setProyectos))}
          />
        )}
      />

      <BotonMenu />
      <BotonDictado sobreBarra />
    </View>
  );
}

const estilos = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: color.fondo },
  banner: { paddingHorizontal: 16, paddingBottom: 16, paddingRight: 72, gap: 10, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  cabecera: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  placa: { backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 6 },
  logo: { width: 120, height: 44 },
  nombre: { fontSize: 24, fontWeight: '800' },
  sub: { fontSize: 13, opacity: 0.85 },
  resumen: { fontSize: 14, fontWeight: '600', opacity: 0.9 },
  lista: { padding: 16, paddingBottom: 24, gap: 10 },
  encabezadoLista: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 },
  seccion: { fontSize: 20, fontWeight: '700', color: color.texto },
  nuevo: { minHeight: 44, justifyContent: 'center' },
  textoNuevo: { color: color.primario, fontSize: 16, fontWeight: '600' },
  vacio: { textAlign: 'center', color: color.suave, marginTop: 24 },
});
