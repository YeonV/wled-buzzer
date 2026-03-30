import React from 'react';
import { Search } from 'lucide-react';
import { useI18n } from '../../../../i18n';
import { useSetupStore, selectMqttDevices, selectScanOnly, selectAllAssignedAliases } from '../../../../store/setupStore';
import { useSessionStore } from '../../../../store/sessionStore';
import DeviceRow from './DeviceRow';
import ScanOnlyRow from './ScanOnlyRow';
import QuickActions from '../SettingsScreen/QuickActions';
import SelectsRow from '../SettingsScreen/SelectsRow';
import AvatarSettings from '../SettingsScreen/AvatarSettings';
import { IS_MODERATOR } from '../../../../utils/viewMode';

export default function DevicesTable() {
  const { t } = useI18n();
  const mqttDevices = useSetupStore(selectMqttDevices);
  const scanOnly = useSetupStore(selectScanOnly);
  const allAssignedAliases = useSetupStore(selectAllAssignedAliases);
  const ledfxDevices = useSetupStore(s => s.ledfxDevices);
  const hasLedfx = Array.isArray(ledfxDevices) && ledfxDevices.length > 0;
  const showSetupSettings = useSessionStore(s => s.showSetupSettings);
  const colSpanMain = (hasLedfx ? 8 : 7) - (IS_MODERATOR ? 1 : 0);

  return (
    <div className="setup-left">
      <div className="setup-header">
        <h2>{t('setup_title')}</h2>
        <QuickActions />
      </div>

      {showSetupSettings && (
        <div className="setup-settings-collapse">
          <SelectsRow />
          <AvatarSettings />
        </div>
      )}

      <p className="setup-hint">{t('setup_hint')}</p>

      <table className="setup-table">
        <thead>
          <tr>
            <th title={t('col_include')}>✓</th>
            <th>{t('col_player_name')}</th>
            {!IS_MODERATOR && <th>IP</th>}
            <th>{t('col_wled_name')}</th>
            <th title="Secondary buzzers that forward to this player">{t('col_aliases')}</th>
            <th title="Individual buzzer colour">Color</th>
            {hasLedfx && <th>{t('col_addon')}</th>}
            <th>Avatar</th>
          </tr>
        </thead>
        <tbody>
          {mqttDevices.length === 0 && (
            <tr>
              <td colSpan={colSpanMain} className="setup-empty">
                {t('setup_no_buzzers').split('\n').map((line, i) => <span key={i}>{line}{i === 0 && <br />}</span>)}
              </td>
            </tr>
          )}

          {mqttDevices.map(([key, d], i) => {
            if (allAssignedAliases.has(key)) return null;
            return (
              <DeviceRow key={key} id={key} d={d} i={i} />
            );
          })}

          {scanOnly.length > 0 && (
            <tr className="setup-section-divider">
              <td colSpan={colSpanMain}>
                <Search size={13} /> {t('scan_only_header')}
                <span className="setup-divider-hint">{t('hijack_hint')}</span>
              </td>
            </tr>
          )}

          {scanOnly.map(([key, d]) => (
            <ScanOnlyRow key={key} keyId={key} d={d} hasLedfx={hasLedfx} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
