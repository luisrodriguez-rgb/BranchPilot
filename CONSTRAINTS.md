# Constraints

Barra de calidad escrita del proyecto. No se baja sin decisión explícita del autor.

| Dimensión | Umbral |
|---|---|
| Tipado | TypeScript `strict`, sin `any`, sin `@ts-ignore` |
| Lint | `npm run lint` sin errores ni `eslint-disable` |
| Tests | Nunca saltar ni borrar tests para llegar a verde |
| Cobertura (lógica `src/git`, `src/shared`) | ≥ 80 % (objetivo F11) |
| Lectura de 200 ramas | < 500 ms en CI |
| Activación de la extensión | < 200 ms (objetivo F11) |
| Tamaño del bundle | < 500 KB (objetivo F11) |
| Seguridad | La vista es de solo lectura; acciones destructivas siempre con confirmación; sin telemetría |
| Compatibilidad | Solo API estándar de VS Code; Git por CLI |
