/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Address of the database server through the internet, fixed at build time; empty means the address the app is served from. */
  readonly VITE_SERVER_DOMAIN_URL?: string;
  /** Address of the database server inside the shop network; used when the domain cannot be reached. Optional. */
  readonly VITE_SERVER_LOCAL_URL?: string;
  /** API token of the database server fixed at build time; when set, the app always uses the server. */
  readonly VITE_SERVER_API_TOKEN?: string;
}
