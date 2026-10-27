import { NativeTabs } from 'expo-router/native-tabs';

import { color } from '@/tema';

export default function Pestanas() {
  return (
    <NativeTabs tintColor={color.primario}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Inicio</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="clientes">
        <NativeTabs.Trigger.Icon sf={{ default: 'person.2', selected: 'person.2.fill' }} md="group" />
        <NativeTabs.Trigger.Label>Clientes</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="respaldo">
        <NativeTabs.Trigger.Icon sf={{ default: 'externaldrive', selected: 'externaldrive.fill' }} md="backup" />
        <NativeTabs.Trigger.Label>Respaldo</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
