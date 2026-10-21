# BranchPilot

Control visual de ramas de Git para el desarrollo asistido por IA. Funciona en VS Code y en los IDE basados en VS Code (Antigravity, Cursor, Windsurf, Kiro, Trae, VSCodium…).

> Estado: en desarrollo, aún no publicado.

## Qué hace

- **Rama actual siempre visible** en la barra de estado, con aviso si es una rama protegida.
- **Panel de ramas** con búsqueda, filtros (Todas, Locales, Remotas, Fusionadas, Antiguas) y lista virtualizada para repositorios con cientos de ramas.
- Todo es **solo lectura** por ahora; las acciones (cambiar, crear) llegan con sus confirmaciones de seguridad.

## Desarrollo

```bash
npm install
npm run build      # compila extensión y webview a dist/
npm test           # pruebas unitarias
npm run lint
npm run typecheck
```

Pulsa `F5` en VS Code para abrir un Extension Development Host.

## Compatibilidad

Usa solo la API estándar de VS Code y el binario `git` del sistema (≥ 2.30; ≥ 2.41 para ahead/behind en una sola consulta).

## Licencia

MIT
