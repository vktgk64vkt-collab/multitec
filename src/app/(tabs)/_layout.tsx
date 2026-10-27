import { NativeTabs } from 'expo-router/native-tabs';

import { color } from '@/tema';

/** Barra de abajo: Inicio, Levantamiento, Cotización, Facturas y, de último, Proyectos. Todo lo demás está en el menú flotante. */
export default function Pestanas() {
  return (
    <NativeTabs tintColor={color.primario}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="levantamientos">
        <NativeTabs.Trigger.Icon sf={{ default: 'checklist', selected: 'checklist' }} md="checklist" />
        <NativeTabs.Trigger.Label>Levantamiento</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="cotizaciones">
        <NativeTabs.Trigger.Icon sf={{ default: 'doc.text', selected: 'doc.text.fill' }} md="description" />
        <NativeTabs.Trigger.Label>Cotización</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="facturas">
        <NativeTabs.Trigger.Icon sf={{ default: 'dollarsign.circle', selected: 'dollarsign.circle.fill' }} md="receipt_long" />
        <NativeTabs.Trigger.Label>Facturas</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="proyectos">
        <NativeTabs.Trigger.Icon sf={{ default: 'folder', selected: 'folder.fill' }} md="folder" />
        <NativeTabs.Trigger.Label>Proyectos</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
