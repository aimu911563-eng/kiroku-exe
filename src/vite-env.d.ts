/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Public browser value. Never put a service-role key here.
  readonly VITE_PUBLIC_EMPLOYEES_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
