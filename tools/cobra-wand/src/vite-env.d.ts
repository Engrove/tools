/// <reference types="vite/client" />

// Vite ?url-suffix: importerar tillgångens URL som sträng (löses av Vite vid bygge).
declare module "*?url" {
  const url: string;
  export default url;
}
