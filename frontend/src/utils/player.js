export function getPlayerName(id, nameMap) {
  return nameMap[id]?.trim() || id?.toUpperCase() || '???';
}
