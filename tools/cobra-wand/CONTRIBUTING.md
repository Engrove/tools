# Contributing

## Binära gates — inget slängs igenom

Varje commit mot main ska passera:

```bash
npx tsc --noEmit                           # EXIT 0
npx vitest run test/trace.test.ts \
  test/trace-v18.test.ts test/schema.test.ts \
  test/interp.test.ts test/cp11.leak.test.ts \
  test/stl-verifier.test.ts                # 108+ PASS, 0 FAIL
```

Full WASM-gate (geometry.gates.test.ts) körs vid release-build.

## Namngivningskonventioner

- TypeScript-moduler: `camelCase.ts`
- Tester: `{modul}.test.ts`
- Skript: `kebab-case.mjs` / `kebab-case.cjs`

## LT-kontraktet (§1, oförändrat bindande)

Appen skriver/läser ALDRIG LT-mekanikens fält (P1, P2, P3, L23, STATOR, STATOR_TRACK, ENGROVELT, LTMECHANISM). Denylist kontrolleras rekursivt i validator.ts och i promptTypes.ts scrubLtTokens. CP11-testet kör vid varje commit.

## Verified/Assumed-disciplin

Alla defaultvärden ska vara märkta med antingen **Verified** (källa angiven, verifierad mot dok) eller **Assumed** (dokumenterat antagande med motivering). Se README §3.
