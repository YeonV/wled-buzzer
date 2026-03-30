import SelectsRow from './SettingsScreen/SelectsRow';
import AvatarSettings from './SettingsScreen/AvatarSettings';
import NameTable from './SettingsScreen/NameTable';
import SettingsActions from './SettingsScreen/SettingsActions';

export default function SettingsScreen() {
  return (
    <div className="fullscreen state-idle" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="settings-panel">
        <SelectsRow />
        <AvatarSettings />
        <NameTable />
        <SettingsActions />
      </div>
    </div>
  );
}
