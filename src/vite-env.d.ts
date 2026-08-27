/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GH_DISPATCH_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
