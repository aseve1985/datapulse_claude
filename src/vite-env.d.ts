/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GEMINI_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __GEMINI_API_KEY__: string;

declare module "*?url" {
  const content: string;
  export default content;
}
