import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { Alert } from '@/alert';
import { guardarNema, leerNemaGuardado } from '@/ajustes';
import { agregarMateriales } from '@/db/materiales';
import {
  calcularMateriales,
  LETRAS,
  DIAMETROS,
  leerMedidasNema,
  NEMA_MEDIDAS,
  NEMA_TIPOS,
  REGISTROS,
  type Canalizacion,
  type Letra,
  type Diametro,
  type Material,
  type RegistroPedido,
} from '@/materiales';
import { color } from '@/tema';
import { Boton, Campo, Chip, Etiqueta, PROPS_TECLADO, Tarjeta } from '@/ui';

const GRUPOS: Material['grupo'][] = ['Tubería', 'Accesorios', 'Fijación', 'Registros', 'Letras'];
const entero = (t: string) => Math.max(0, Math.floor(Number(t.replace(',', '.')) || 0));

/** Calcula todo el material de ferretería de una canalización y deja revisarlo antes de pasarlo a la cotización. */
export default function Materiales() {
  const db = useSQLiteContext();
  const proyectoId = Number(useLocalSearchParams<{ proyecto: string }>().proyecto);

  const [canal, setCanal] = useState<Canalizacion>('EMT');
  const [diametro, setDiametro] = useState<Diametro>('3/4');
  const [metros, setMetros] = useState('');
  const [interiores, setInteriores] = useState('');
  const [exteriores, setExteriores] = useState('');
  const [exterior, setExterior] = useState<'letra' | 'registro'>('letra');
  const [letraEsquina, setLetraEsquina] = useState<Letra>('LB');

  const [nemaTexto, setNemaTexto] = useState(NEMA_MEDIDAS.join(', '));
  const medidasNema = useMemo(() => {
    const m = leerMedidasNema(nemaTexto);
    return m.length ? m : NEMA_MEDIDAS;
  }, [nemaTexto]);
  const [modelo, setModelo] = useState<string>('4x4');
  const [nemaTipo, setNemaTipo] = useState<string | null>(null);
  const [nemaMedida, setNemaMedida] = useState('12x12');
  const [pasoSel, setPasoSel] = useState<string>('4x4'); // modelo de los registros de paso automáticos
  const [extremoSel, setExtremoSel] = useState<string>('4x4'); // modelo de los registros de inicio y final
  const [funcion, setFuncion] = useState<RegistroPedido['funcion']>('final');
  const [cantRegistro, setCantRegistro] = useState('1');
  const [registros, setRegistros] = useState<RegistroPedido[]>([]);
  const [letras, setLetras] = useState<Partial<Record<Letra, string>>>({});

  // cantidades que el usuario corrigió a mano; valen mientras el cálculo no cambie
  const [cambios, setCambios] = useState<Record<string, { base: number; valor: string }>>({});
  const [quitados, setQuitados] = useState<Record<string, boolean>>({});

  useEffect(() => {
    leerNemaGuardado().then((t) => t && setNemaTexto(t));
  }, []);

  const filas = useMemo(
    () =>
      calcularMateriales({
        tipo: canal,
        diametro,
        metros: Number(metros.replace(',', '.')),
        esquinasInteriores: entero(interiores),
        esquinasExteriores: entero(exteriores),
        exterior,
        letraEsquina,
        modeloPaso: pasoSel.startsWith('NEMA') ? `${pasoSel} ${nemaMedida}` : pasoSel,
        modeloExtremos: extremoSel.startsWith('NEMA') ? `${extremoSel} ${nemaMedida}` : extremoSel,
        registros,
        letras: Object.fromEntries(Object.entries(letras).map(([l, n]) => [l, entero(n ?? '')])),
      }),
    [canal, diametro, metros, interiores, exteriores, exterior, letraEsquina, pasoSel, extremoSel, nemaMedida, registros, letras]
  );
  const cantidadDe = (f: Material) => {
    const c = cambios[f.clave];
    return c && c.base === f.cantidad ? entero(c.valor) : f.cantidad;
  };
  const elegidas = filas.filter((f) => !quitados[f.clave] && cantidadDe(f) > 0);

  function agregarRegistro() {
    const n = entero(cantRegistro);
    if (n <= 0) return Alert.alert('Cantidad', 'Escribe cuántos registros son.');
    const m = nemaTipo ? `NEMA ${nemaTipo} ${nemaMedida}` : modelo;
    setRegistros((r) => [...r, { modelo: m, funcion, cantidad: n }]);
  }

  async function guardarNemaEditado() {
    await guardarNema(medidasNema.join(', '));
    setNemaTexto(medidasNema.join(', '));
    if (!medidasNema.includes(nemaMedida)) setNemaMedida(medidasNema[0]);
    Alert.alert('Guardado', 'Estas medidas NEMA quedan en el teléfono.');
  }

  async function agregar() {
    if (elegidas.length === 0) return Alert.alert('Nada que agregar', 'Escribe los metros del recorrido.');
    const sinPrecio = await agregarMateriales(db, proyectoId, elegidas.map((f) => ({ ...f, cantidad: cantidadDe(f) })), null);
    Alert.alert(
      'Agregado a la cotización',
      sinPrecio ? `${sinPrecio} de ${elegidas.length} líneas no están en tu inventario: quedaron sin precio para que lo llenes en la cotización.` : `${elegidas.length} líneas con los precios de tu inventario.`
    );
    router.back();
  }

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" {...PROPS_TECLADO} contentContainerStyle={estilos.contenedor}>
      <Stack.Screen options={{ title: 'Materiales de ferretería' }} />

      <Etiqueta>Recorrido</Etiqueta>
      <Tarjeta>
        <View style={estilos.fila}>
          {(['EMT', 'PVC'] as const).map((t) => (
            <Chip key={t} texto={t} activo={canal === t} onPress={() => setCanal(t)} />
          ))}
        </View>
        <View style={estilos.fila}>
          {DIAMETROS.map((d) => (
            <Chip key={d} texto={`${d}"`} activo={diametro === d} onPress={() => setDiametro(d)} />
          ))}
        </View>
        <Campo placeholder="Metros del recorrido" keyboardType="decimal-pad" value={metros} onChangeText={setMetros} />
        <View style={estilos.dos}>
          <Campo style={estilos.mitad} placeholder="Esquinas interiores" keyboardType="number-pad" value={interiores} onChangeText={setInteriores} />
          <Campo style={estilos.mitad} placeholder="Esquinas exteriores" keyboardType="number-pad" value={exteriores} onChangeText={setExteriores} />
        </View>
        {canal === 'EMT' ? (
          <>
            <Text style={estilos.nota}>En EMT las esquinas interiores se doblan (sin accesorio). Las exteriores llevan:</Text>
            <View style={estilos.fila}>
              <Chip texto="Letra" activo={exterior === 'letra'} onPress={() => setExterior('letra')} />
              <Chip texto="Registro" activo={exterior === 'registro'} onPress={() => setExterior('registro')} />
            </View>
            {exterior === 'letra' ? (
              <View style={estilos.fila}>
                {(Object.keys(LETRAS) as Letra[]).map((l) => (
                  <Chip key={l} texto={l} activo={letraEsquina === l} onPress={() => setLetraEsquina(l)} />
                ))}
              </View>
            ) : null}
          </>
        ) : (
          <Text style={estilos.nota}>En PVC cada esquina lleva un codo.</Text>
        )}
        <Text style={estilos.nota}>Tubo de 3 m con 10 % de sobrante, un coupling por empalme, un registro de paso cada 5 tubos y abrazadera cada 1,5 m (con tarugo y tornillo).</Text>
      </Tarjeta>

      <Etiqueta>Registros</Etiqueta>
      <Tarjeta>
        <Text style={estilos.nota}>Cada tubería lleva un registro de inicio y uno de final (1 conector cada uno) y uno de paso cada 5 tubos (2 conectores). Salen solos con el modelo que elijas. Cada registro lleva tornillos y tarugos.</Text>
        <Text style={estilos.nota}>Registros de inicio y final:</Text>
        <View style={estilos.fila}>
          {[...REGISTROS, ...NEMA_TIPOS.map((t) => `NEMA ${t}`)].map((m) => (
            <Chip key={m} texto={m} activo={extremoSel === m} onPress={() => setExtremoSel(m)} />
          ))}
        </View>
        <Text style={estilos.nota}>Registro de paso:</Text>
        <View style={estilos.fila}>
          {[...REGISTROS, ...NEMA_TIPOS.map((t) => `NEMA ${t}`)].map((m) => (
            <Chip key={m} texto={m} activo={pasoSel === m} onPress={() => setPasoSel(m)} />
          ))}
        </View>
        <Text style={estilos.nota}>Agregar más registros a mano (de inicio/final, o de paso extra):</Text>
        <View style={estilos.fila}>
          {REGISTROS.map((r) => (
            <Chip key={r} texto={r} activo={!nemaTipo && modelo === r} onPress={() => { setNemaTipo(null); setModelo(r); }} />
          ))}
          {NEMA_TIPOS.map((t) => (
            <Chip key={t} texto={`NEMA ${t}`} activo={nemaTipo === t} onPress={() => setNemaTipo(t)} />
          ))}
        </View>
        {nemaTipo || pasoSel.startsWith('NEMA') || extremoSel.startsWith('NEMA') ? (
          <View style={estilos.fila}>
            {medidasNema.map((m) => (
              <Chip key={m} texto={m} activo={nemaMedida === m} onPress={() => setNemaMedida(m)} />
            ))}
          </View>
        ) : null}
        <View style={estilos.fila}>
          <Chip texto="Inicio/final" activo={funcion === 'final'} onPress={() => setFuncion('final')} />
          <Chip texto="De paso" activo={funcion === 'paso'} onPress={() => setFuncion('paso')} />
        </View>
        <View style={estilos.dos}>
          <Campo style={estilos.mitad} placeholder="Cantidad" keyboardType="number-pad" value={cantRegistro} onChangeText={setCantRegistro} />
          <Chip borde texto="Agregar registro" onPress={agregarRegistro} />
        </View>
        {registros.map((r, i) => (
          <View key={i} style={estilos.dos}>
            <Text style={estilos.texto}>
              {r.cantidad} × Registro {r.modelo} · {r.funcion === 'paso' ? 'de paso' : 'inicio/final'}
            </Text>
            <Chip borde texto="Quitar" onPress={() => setRegistros((l) => l.filter((_, j) => j !== i))} />
          </View>
        ))}
        <Text style={estilos.nota}>Medidas NEMA (editables, separadas por coma):</Text>
        <Campo value={nemaTexto} onChangeText={setNemaTexto} autoCapitalize="none" autoCorrect={false} />
        <Chip borde texto="Guardar medidas NEMA" onPress={guardarNemaEditado} />
      </Tarjeta>

      <Etiqueta>Letras</Etiqueta>
      <Tarjeta>
        <Text style={estilos.nota}>Letras extra, además de las de las esquinas. Cada letra suma un conector por entrada (LB, LL, LR, C: 2; T: 3; E: 1; X: 4).</Text>
        <View style={estilos.fila}>
          {(Object.keys(LETRAS) as Letra[]).map((l) => (
            <View key={l} style={estilos.letra}>
              <Text style={estilos.texto}>{l}</Text>
              <Campo style={{ minWidth: 56 }} placeholder="0" keyboardType="number-pad" value={letras[l] ?? ''} onChangeText={(t) => setLetras((c) => ({ ...c, [l]: t }))} />
            </View>
          ))}
        </View>
      </Tarjeta>

      <Etiqueta>Lista de materiales</Etiqueta>
      <Tarjeta>
        {filas.length === 0 ? <Text style={estilos.nota}>Escribe los metros y aquí aparece todo lo que lleva.</Text> : null}
        {GRUPOS.map((g) => {
          const delGrupo = filas.filter((f) => f.grupo === g);
          if (delGrupo.length === 0) return null;
          return (
            <View key={g} style={{ gap: 6 }}>
              <Text style={estilos.grupo}>{g}</Text>
              {delGrupo.map((f) => (
                <View key={f.clave + f.descripcion} style={estilos.dos}>
                  <Switch value={!quitados[f.clave]} onValueChange={(v) => setQuitados((q) => ({ ...q, [f.clave]: !v }))} trackColor={{ true: color.primario }} />
                  <Text style={[estilos.texto, { flex: 1 }, quitados[f.clave] && { opacity: 0.4 }]}>{f.descripcion}</Text>
                  <Campo
                    style={{ minWidth: 64, textAlign: 'center' }}
                    keyboardType="number-pad"
                    value={cambios[f.clave] && cambios[f.clave].base === f.cantidad ? cambios[f.clave].valor : String(f.cantidad)}
                    onChangeText={(t) => setCambios((c) => ({ ...c, [f.clave]: { base: f.cantidad, valor: t } }))}
                  />
                </View>
              ))}
            </View>
          );
        })}
      </Tarjeta>

      <Boton texto={elegidas.length ? `Agregar ${elegidas.length} líneas a la cotización` : 'Agregar a la cotización'} onPress={agregar} />
    </ScrollView>
  );
}

const estilos = StyleSheet.create({
  contenedor: { padding: 16, gap: 12 },
  fila: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dos: { flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'space-between' },
  mitad: { flex: 1 },
  letra: { alignItems: 'center', gap: 4 },
  texto: { fontSize: 15, color: color.texto },
  nota: { fontSize: 13, color: color.suave },
  grupo: { fontSize: 14, fontWeight: '700', color: color.primario },
});
