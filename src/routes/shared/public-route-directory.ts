import publicRouteDirectory from './public-route-directory.json';

export type PublicRouteGroupId = 'your-work' | 'rules-trust' | 'free-tools' | 'proof-help';
export type PublicRouteRelease = 'core' | 'personal-space';

export interface PublicRouteDestination {
  readonly id: string;
  readonly label: string;
  readonly href: `/${string}`;
  readonly description: string;
  readonly release: PublicRouteRelease;
}

export interface PublicRouteGroup {
  readonly id: PublicRouteGroupId;
  readonly label: string;
  readonly destinations: readonly PublicRouteDestination[];
}

const groupIds: readonly PublicRouteGroupId[] = ['your-work', 'rules-trust', 'free-tools', 'proof-help'];
const releases: readonly PublicRouteRelease[] = ['core', 'personal-space'];

type JsonRecord = Record<string, unknown>;

function isJsonRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function belongsTo<T extends string>(values: readonly T[], value: string): value is T {
  return values.some((candidate) => candidate === value);
}

function nonEmptyString(record: JsonRecord, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`Javni direktorij: ${context}.${key} mora biti neprazan tekst.`);
  return value;
}

const publicRouteOrigin = 'https://route-directory.invalid';
const unsafePublicHrefCharacters = /[\\\s\u0000-\u001f\u007f-\u009f]/u;
const reservedPublicPath = /^\/(?:admin|verification|qa)(?:[/.]|$)/i;

function isAllowedPublicHref(href: string): href is `/${string}` {
  if (!href.startsWith('/')
    || href.startsWith('//')
    || href.startsWith('/#')
    || unsafePublicHrefCharacters.test(href)) return false;

  try {
    const parsed = new URL(href, publicRouteOrigin);
    if (parsed.origin !== publicRouteOrigin) return false;
    return !reservedPublicPath.test(decodeURIComponent(parsed.pathname));
  } catch {
    return false;
  }
}
export function validatePublicRouteDirectory(value: unknown): readonly PublicRouteGroup[] {
  if (!isJsonRecord(value) || !Array.isArray(value.groups)) throw new Error('Javni direktorij mora imati polje groups.');
  const destinationIds = new Set<string>();
  const knownGroupIds = new Set<string>();
  return value.groups.map((groupValue, groupIndex) => {
    if (!isJsonRecord(groupValue)) throw new Error(`Javni direktorij: groups[${groupIndex}] mora biti objekt.`);
    const id = nonEmptyString(groupValue, 'id', `groups[${groupIndex}]`);
    if (!belongsTo(groupIds, id)) throw new Error(`Javni direktorij: nepoznata skupina ${id}.`);
    if (knownGroupIds.has(id)) throw new Error(`Javni direktorij: duplikat skupine ${id}.`);
    knownGroupIds.add(id);
    const label = nonEmptyString(groupValue, 'label', `groups[${groupIndex}]`);
    if (!Array.isArray(groupValue.destinations)) throw new Error(`Javni direktorij: groups[${groupIndex}].destinations mora biti polje.`);
    const destinations = groupValue.destinations.map((destinationValue, destinationIndex) => {
      const context = `groups[${groupIndex}].destinations[${destinationIndex}]`;
      if (!isJsonRecord(destinationValue)) throw new Error(`Javni direktorij: ${context} mora biti objekt.`);
      const destinationId = nonEmptyString(destinationValue, 'id', context);
      if (destinationIds.has(destinationId)) throw new Error(`Javni direktorij: duplikat odredišta ${destinationId}.`);
      destinationIds.add(destinationId);
      const destinationLabel = nonEmptyString(destinationValue, 'label', context);
      const href = nonEmptyString(destinationValue, 'href', context);
      if (!isAllowedPublicHref(href)) throw new Error(`Javni direktorij: ${context}.href mora biti dopuštena javna root-relative putanja.`);
      const description = nonEmptyString(destinationValue, 'description', context);
      const release = nonEmptyString(destinationValue, 'release', context);
      if (!belongsTo(releases, release)) throw new Error(`Javni direktorij: nepoznati release ${release}.`);
      return { id: destinationId, label: destinationLabel, href: href as `/${string}`, description, release };
    });
    return { id, label, destinations };
  });
}

const publicRouteGroups = validatePublicRouteDirectory(publicRouteDirectory);

export const releasedPublicRouteGroups: readonly PublicRouteGroup[] = publicRouteGroups
  .map((group) => ({ ...group, destinations: group.destinations.filter((destination) => destination.release === 'core') }))
  .filter((group) => group.destinations.length > 0);

const publicRouteIds = new Set(publicRouteGroups.flatMap((group) => group.destinations.map((destination) => destination.id)));

export function isPublicRouteId(value: string): boolean {
  return publicRouteIds.has(value);
}
