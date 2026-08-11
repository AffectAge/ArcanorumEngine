import { useTranslation } from 'react-i18next';
import type { WorldHex, WorldMapResponse } from '@arcanorum/shared';

type HexTooltipProps = {
  readonly hex: WorldHex;
  readonly world: WorldMapResponse;
};

export function HexTooltip({ hex, world }: HexTooltipProps) {
  const { i18n, t } = useTranslation();
  const number = new Intl.NumberFormat(i18n.language);
  const landmass = world.map.landmasses.find((candidate) => candidate.id === hex.landmassId);
  const waterBody = world.map.waterBodies.find((candidate) => candidate.id === hex.waterBodyId);

  return (
    <aside className="hex-tooltip" aria-live="polite" aria-label={t('game.hex.ariaLabel')} role="status">
      <p className="hex-tooltip__eyebrow">{t('game.hex.eyebrow')}</p>
      <h2 className="hex-tooltip__title">{t('game.hex.title', { q: hex.q, r: hex.r })}</h2>
      <dl className="hex-tooltip__details">
        <HexTooltipRow
          label={t('game.hex.terrain')}
          value={t(`game.hex.terrainTypes.${terrainRole(hex.terrainId)}`)}
        />
        <HexTooltipRow label={t('game.hex.elevation')} value={number.format(hex.elevation)} />
        <HexTooltipRow label={t('game.hex.temperature')} value={number.format(hex.temperature)} />
        <HexTooltipRow label={t('game.hex.rainfall')} value={number.format(hex.rainfall)} />
        <HexTooltipRow label={t('game.hex.flow')} value={number.format(hex.flowAccumulation)} />
        <HexTooltipRow
          label={t('game.hex.landmass')}
          value={
            landmass === undefined ? t('game.hex.none') : describeLandmass(landmass.kind, landmass.id, t)
          }
        />
        <HexTooltipRow
          label={t('game.hex.waterBody')}
          value={
            waterBody === undefined ? t('game.hex.none') : describeWaterBody(waterBody.kind, waterBody.id, t)
          }
        />
      </dl>
    </aside>
  );
}

function HexTooltipRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="hex-tooltip__row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function terrainRole(terrainId: string): 'ocean' | 'coastal_water' | 'sea' | 'lake' | 'land' {
  switch (terrainId) {
    case 'terrain.ocean':
      return 'ocean';
    case 'terrain.coastal_water':
      return 'coastal_water';
    case 'terrain.sea':
      return 'sea';
    case 'terrain.lake':
      return 'lake';
    default:
      return 'land';
  }
}

function describeLandmass(
  kind: 'continent' | 'island',
  id: string,
  t: (key: string, options: { readonly number: string }) => string,
): string {
  return t(`game.hex.landmassTypes.${kind}`, { number: entityNumber(id) });
}

function describeWaterBody(
  kind: 'ocean' | 'sea' | 'lake',
  id: string,
  t: (key: string, options: { readonly number: string }) => string,
): string {
  return t(`game.hex.waterBodyTypes.${kind}`, { number: entityNumber(id) });
}

function entityNumber(id: string): string {
  return id.split('.').at(-1) ?? id;
}
