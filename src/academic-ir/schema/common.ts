export type PersistenceClass =
  | 'ephemeral-local'
  | 'local-project'
  | 'sanitized-cloud'
  | 'public';

export interface EntityBase {
  id: string;
  persistence: PersistenceClass;
}
