import { useEffect, useMemo } from 'react';
import { useI18n } from '../../../i18n';
import { useSessionStore } from '../../../store/sessionStore';
import { useGameStore } from '../../../store/gameStore';
import { loadRoster, buildInitialDevices, emitSnapshot } from '../../../utils/setupHelpers';
import { useSetupStore } from '../../../store/setupStore';
import { useShallow } from 'zustand/shallow';
import socket from '../../../services/socket';
import DevicesTable from './SetupScreen/DevicesTable';
import SetupSidebar from './SetupScreen/SetupSidebar';
import DevDock from '../../DevDock';

export default function SetupScreen() {
  const { t } = useI18n();  
  const initialMqttMap = useGameStore(s => s.mqttClientIpMap);
  const { devices, addonSel, setDevices } = useSetupStore(useShallow(s => ({ devices: s.devices, addonSel: s.addonSel, setDevices: s.setDevices, ledfxDevices: s.ledfxDevices })));
  const initialDevices = buildInitialDevices(loadRoster(), initialMqttMap);
  const activeBuzzers = useMemo(() => Object.values(devices).filter(d => d.hexId && d.active), [devices]);
  const canStart = activeBuzzers.length > 0;

  useEffect(() => {
    setDevices(initialDevices);
    useSetupStore.getState().init(initialDevices);
    return () => useSetupStore.getState().stopListeners();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scan on mount + every 30s
  useEffect(() => {
    socket.emit('discoverWleds');
    const interval = setInterval(() => socket.emit('discoverWleds'), 30_000);
    return () => clearInterval(interval);
  }, []);


  const handleStart = () => {
    // Send full snapshot (including colors) to all clients before starting
    const colorMap = useSetupStore.getState().colorMap;
    emitSnapshot(devices, socket, colorMap);
    useSessionStore.getState().startFromSetup(devices, addonSel, colorMap, socket);
  };

  return (
    <div className="setup-screen">
      <div className="setup-frame">
        <DevDock />
        <DevicesTable />
        <SetupSidebar title={t('app_title')} onStart={handleStart} activeCount={activeBuzzers.length} canStart={canStart} />
      </div>
    </div>
  );
}
