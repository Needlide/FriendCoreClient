/**
 * Shape shared by every environment file. Kept in its own module (NOT listed in
 * angular.json `fileReplacements`) so both environment.ts and environment.development.ts
 * can import it — importing the type from environment.ts itself would break, since the
 * dev build replaces that module's content with environment.development.ts.
 */
export interface Environment {
  production: boolean;
  /** Origin of the API (no trailing slash, no /api path). */
  apiBaseUrl: string;
  /** Versioned REST prefix; all controller routes live under this. */
  apiPrefix: string;
}
