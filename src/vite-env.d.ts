/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Database server address fixed at build time; empty means the address the app is served from. */
  readonly VITE_SERVER_URL?: string;
  /** API token of the database server fixed at build time; when set, the app always uses the server. */
  readonly VITE_SERVER_API_TOKEN?: string;
}
