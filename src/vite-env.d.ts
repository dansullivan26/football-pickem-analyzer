/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GH_DISPATCH_TOKEN?: string
  readonly VITE_GROKBOT_WEBHOOK_URL?: string
  readonly VITE_GROKBOT_WEBHOOK_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
