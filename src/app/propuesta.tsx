import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { listarLineas, obtenerOpciones, type Linea } from '@/db/cotizacion';
import { listarAreas } from '@/db/levantamiento';
import {
  guardarCondiciones,
  guardarPropuestaIntro,
  obtenerCondiciones,
  obtenerProyecto,
  obtenerPropuestaIntro,
} from '@/db/proyectos';
import { moneda, totales } from '@/dinero';
import { compartirPdf, negocioParaPdf } from '@/pdf';
import { color } from '@/tema';
import { Boton, Campo, Etiqueta, Tarjeta } from '@/ui';

const SECCIONES = [
  { tipo: 'equipo', titulo: 'Equipos' },
  { tipo: 'servicio', titulo: 'Mano de obra y servicios' },
] as const;

/** Propuesta al cliente: alcance completo (equipos y servicios) pero solo el monto total, sin precios por artículo. */
export default function Propuesta() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);
  const [lineas, setLineas] = useState<Linea[]>([]);
  const [total, setTotal] = useState(0);
  const [intro, setIntro] = useState('');
  const [condiciones, setCondiciones] = useState('');

  useEffect(() => {
    listarLineas(db, proyectoId).then(async (ls) => {
      setLineas(ls);
      const op = await obtenerOpciones(db, proyectoId);
      setTotal(totales(ls, op.impuesto_pct, op.con_itbis).total);
    });
    obtenerPropuestaIntro(db, proyectoId).then(setIntro);
    obtenerCondiciones(db, proyectoId).then(setCondiciones);
  }, [db, proyectoId]);

  async function pdf() {
    const p = await obtenerProyecto(db, proyectoId);
    if (!p || lineas.length === 0) return Alert.alert('Nada que compartir', 'Agrega equipos o servicios a la cotización primero.');
    const ok = await compartirPdf({
      titulo: `Propuesta #${p.id}`,
      fecha: new Date().toLocaleDateString('en-CA'),
      cliente: p.cliente,
      proyecto: p.nombre,
      negocio: await negocioParaPdf(db),
      areas: await listarAreas(db, proyectoId),
      lineas,
      intro,
      condiciones,
      sinPrecios: true,
      subtotal: 0,
      impuesto: 0,
      total,
    });
    if (!ok) Alert.alert('No disponible', 'El PDF solo funciona en el iPhone.');
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={estilos.contenedor} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Propuesta' }} />
      <Text style={estilos.texto}>
        Lleva todo lo que vas a instalar, pero el cliente solo ve el monto total, sin precios por artículo. Sale de la cotización.
      </Text>

      <Tarjeta>
        <Etiqueta>Resumen del trabajo (opcional)</Etiqueta>
        <Campo
          placeholder="Ej. Instalación de sistema de videovigilancia para oficinas y bodega, con visualización remota."
          value={intro}
          onChangeText={setIntro}
          onEndEditing={() => guardarPropuestaIntro(db, proyectoId, intro)}
          multilinea
        />
      </Tarjeta>

      {lineas.length === 0 && <Text style={estilos.vacio}>La cotización está vacía. Agrega equipos o servicios para armar la propuesta.</Text>}
      {SECCIONES.map(({ tipo, titulo }) => {
        const delTipo = lineas.filter((l) => l.tipo === tipo);
        if (delTipo.length === 0) return null;
        return (
          <Tarjeta key={tipo}>
            <Etiqueta>{titulo}</Etiqueta>
            {delTipo.map((l) => (
              <View key={l.id} style={estilos.linea}>
                <Text style={estilos.cantidad}>{l.cantidad}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={estilos.nombre}>{l.descripcion}</Text>
                  {l.detalle ? <Text style={estilos.detalle}>{l.detalle}</Text> : null}
                </View>
              </View>
            ))}
          </Tarjeta>
        );
      })}

      <Tarjeta>
        <Etiqueta>Monto total de la propuesta (ITBIS incluido)</Etiqueta>
        <Text style={estilos.total}>{moneda(total)}</Text>
      </Tarjeta>

      <Tarjeta>
        <Etiqueta>Condiciones (las mismas de la cotización)</Etiqueta>
        <Campo
          multilinea
          value={condiciones}
          onChangeText={setCondiciones}
          onEndEditing={() => guardarCondiciones(db, proyectoId, condiciones)}
        />
        <Boton texto="Compartir propuesta en PDF" onPress={pdf} />
      </Tarjeta>
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  texto: { fontSize: 14, color: color.suave },
  vacio: { textAlign: 'center', color: color.suave },
  linea: { flexDirection: 'row', gap: 10, paddingVertical: 4 },
  cantidad: { width: 32, fontSize: 16, fontWeight: '700', color: color.primario, textAlign: 'right' },
  nombre: { fontSize: 16, fontWeight: '600', color: color.texto },
  detalle: { fontSize: 14, color: color.suave },
  total: { fontSize: 28, fontWeight: '800', color: color.texto },
});
