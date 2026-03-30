import React from 'react';
import { useI18n } from '../../../../i18n';
import { IS_MODERATOR } from '../../../../utils/viewMode';
import ColorCell from './ColorCell';
import AvatarCell from './AvatarCell';
import InfoButton from '../../../InfoButton';
import { useSetupStore } from '../../../../store/setupStore';
import { useShallow } from 'zustand/shallow';

function DeviceRow({ id, d, i }) {
  const { t } = useI18n();
  const defaultName = d.wledName || id;
  const displayName = d.name || defaultName;
  const { ledfxDevices, devices, setName, toggleActive, addAlias, removeAlias, setAddonSel, setIcon, addonSel, clientNameMap } = useSetupStore(useShallow(s => ({
    ledfxDevices: s.ledfxDevices,
    devices: s.devices,
    setName: s.setName,
    toggleActive: s.toggleActive,
    addAlias: s.addAlias,
    removeAlias: s.removeAlias,
    setAddonSel: s.setAddonSel,
    setIcon: s.setIcon,
    addonSel: s.addonSel,
    clientNameMap: s.clientNameMap,
  })));
  const hasLedfx = Array.isArray(ledfxDevices) && ledfxDevices.length > 0;
  const anyAliasBuzzing = (d.aliases ?? []).some(a => devices[a]?.buzzing);
  const mqttDevices = Object.entries(devices).filter(([k]) => !k.startsWith('ip:'));
  const allAssignedAliases = new Set(Object.values(devices).flatMap(x => x.aliases ?? []));

  return (
    <tr
      key={id}
      className={[
        'setup-row',
        (d.buzzing || anyAliasBuzzing) ? 'setup-buzzing' : '',
        d.active ? 'setup-active' : '',
      ].filter(Boolean).join(' ')}
    >
      <td>
        <input type="checkbox" checked={!!d.active} onChange={() => toggleActive(id)} />
      </td>
      <td>
        <input className="setup-name-input" key={`${id}-${displayName}`} defaultValue={displayName} onBlur={(e) => setName(id, e.target.value)} tabIndex={1} />
      </td>
      {!IS_MODERATOR && (
        <td className="setup-ip">
          {d.ip ? <a href={`http://${d.ip}`} target="_blank" rel="noopener noreferrer">{d.ip}</a> : <span className="setup-unknown">{t('offline')}</span>}
        </td>
      )}
      <td className="setup-wled-name">
        {d.wledName ? <>{d.wledName}{!IS_MODERATOR && <button className="setup-copy-btn" title={t('copy_to_name')} onClick={() => setName(id, d.wledName)}>⬅</button>}</> : <span className="setup-unknown">—</span>}
      </td>
      <td className="setup-aliases">
        {(d.aliases ?? []).map(alias => {
          const aliasLabel = (devices[alias]?.wledName || alias).slice(0, 8);
          const aliasBuzzing = !!devices[alias]?.buzzing;
          return (
            <span key={alias} className={`setup-alias-chip${aliasBuzzing ? ' setup-alias-chip--buzzing' : ''}`} title={alias}>
              {aliasLabel}
              <button className="setup-alias-remove" title="Remove alias" onClick={() => removeAlias(id, alias)}>×</button>
            </span>
          );
        })}
        <select className="setup-alias-add" value="" style={{ width: '2em', padding: 0, textAlign: 'center' }} onChange={e => { if (e.target.value) addAlias(id, e.target.value); }}>
          <option value="">＋</option>
          {mqttDevices.filter(([k, dd]) => k !== id && !allAssignedAliases.has(k) && !dd.active).map(([k, dd]) => (
            <option key={k} value={k}>{dd.wledName || clientNameMap[k] || k}</option>
          ))}
        </select>
      </td>
        <td className="setup-color-cell">
        <ColorCell id={id} index={i} />
      </td>
      {hasLedfx && (
          <td className="setup-aliases">
          {(addonSel[id] ?? []).map(aid => {
            const ld = ledfxDevices.find(x => x.id === aid);
            return (
              <span key={aid} className="setup-alias-chip" title={aid}>
                {(ld?.name || aid).slice(0, 10)}
                <button className="setup-alias-remove" title="Remove" onClick={() => setAddonSel(prev => ({ ...prev, [id]: (prev[id] ?? []).filter(x => x !== aid) }))}>×</button>
              </span>
            );
          })}
          <select className="setup-alias-add" value="" onChange={e => { if (e.target.value) setAddonSel(prev => ({ ...prev, [id]: [...(prev[id] ?? []), e.target.value] })); }}>
            <option value="">＋</option>
            {ledfxDevices.filter(ld => !(addonSel[id] ?? []).includes(ld.id)).map(ld => <option key={ld.id} value={ld.id}>{ld.name}</option>)}
          </select>
        </td>
      )}
      <td className="setup-avatar-cell">
        <AvatarCell id={id} displayName={displayName} icon={d.icon} setIcon={setIcon} />
      </td>
      <td className="setup-info-cell">
        <InfoButton title={t('info')}> 
          <div style={{ minWidth: 220 }}>
            <div><strong>ID:</strong> {id}</div>
            {d.hexId && <div><strong>Hex:</strong> {d.hexId}</div>}
            {d.ip && <div><strong>IP:</strong> {d.ip}</div>}
            <div><strong>Name:</strong> {displayName}</div>
            {d.wledName && <div><strong>WLED:</strong> {d.wledName} <button className="setup-copy-btn" title={t('copy_to_name')} onClick={() => setName(id, d.wledName)}>⬅</button></div>}
            {clientNameMap[id] && <div><strong>Client:</strong> {clientNameMap[id]} <button className="setup-copy-btn" title={t('copy_to_name')} onClick={() => setName(id, clientNameMap[id])}>⬅</button></div>}
            {d.fw && <div><strong>FW:</strong> {d.fw}</div>}
            {d.mac && <div><strong>MAC:</strong> {d.mac}</div>}
            {d.mqtt && <div><strong>MQTT broker:</strong> {d.mqtt.broker}:{d.mqtt.port} {d.mqtt.correctBroker ? '✓' : '⚠ wrong'}</div>}
            <div><strong>Active:</strong> {d.active ? 'yes' : 'no'}</div>
            <div><strong>Buzzing:</strong> {d.buzzing ? 'yes' : 'no'}</div>
            <div><strong>Aliases:</strong> {(d.aliases ?? []).join(', ') || '—'}</div>
            {hasLedfx && <div><strong>Addons:</strong> {(addonSel[id] ?? []).map(aid => (ledfxDevices.find(x => x.id === aid)?.name || aid)).join(', ') || '—'}</div>}
          </div>
        </InfoButton>
      </td>
    </tr>
  );
}

export default React.memo(DeviceRow);
