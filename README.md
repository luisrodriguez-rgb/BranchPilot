# BranchPilot

Control visual y seguro de ramas de Git para el desarrollo asistido por IA. Funciona en **VS Code** y en todos los IDEs basados en VS Code (**Antigravity**, **Cursor**, **Windsurf**, **Qoder/Qwen**, **Kiro**, **Trae**, **VSCodium**), además de ofrecer un **CLI auxiliar** para agentes de terminal (**OpenCode**, **Claude Code**, **Aider**, **Codex**).

---

## Qué hace

- **Rama actual siempre visible** en la barra de estado inferior y en el panel lateral, con resaltado automático en ramas protegidas (`main`, `master`, `develop`, `release/*`) o en `HEAD` desacoplado.
- **Panel de ramas de alto rendimiento**: buscador instantáneo, chips de filtro (*Todas*, *Locales*, *Remotas*, *Fusionadas*, *Antiguas*), lista virtualizada a 60 fps y navegación por teclado.
- **Tarjeta flotante (Hover Card)**: muestra divergencia en lenguaje natural frente a la rama base, estado de integración, seguimiento remoto (`upstream`) e historial de commits recientes cargado bajo demanda.
- **Acciones con Guards de Seguridad**: cambiar de rama, crear rama eligiendo base, renombrar y eliminar ramas locales con bloqueo ante operaciones en curso (`merge`/`rebase`) y resolución asistida de cambios sin guardar (`stash` o llevar cambios).
- **Contexto de Tarea con IA**:
  - Comando **«Crear rama para esta tarea (IA)…»**: infiere el prefijo (`feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `chore/`) y genera un slug limpio a partir de la descripción de la tarea.
  - **Pre-chequeo IA**: verifica si estás en una rama protegida o con cambios pendientes antes de delegar trabajo al agente.
  - **Reglas automáticas (`AGENTS.md`, `.clinerules`, `.cursorrules`)**: inyecta de forma idempotente instrucciones para que los agentes verifiquen la rama activa antes de editar archivos.
- **Soporte de Worktrees Paralelos**: lista, crea, abre en nueva ventana y elimina `git worktree` secundarios para ejecutar múltiples agentes en paralelo sin interferencias.

---

## Tabla de Compatibilidad por IDE y Agente

BranchPilot utiliza exclusivamente la API estándar de VS Code (`engines.vscode >= 1.90.0`) y su propio motor autónomo de Git por CLI (`GIT_OPTIONAL_LOCKS=0`), por lo que **no depende de APIs propietarias ni requiere que `vscode.git` esté presente**.

| IDE / Entorno | Tipo | Estado | Mecanismo de instalación / uso | Notas técnicas |
|---|---|---|---|---|
| **Antigravity (AGY)** | Fork VS Code | Compatible (100 %) | Instalar `.vsix` + reglas en `AGENTS.md` | Detectado como familia `antigravity`; soporta worktrees en ventanas paralelas. |
| **Cursor** | Fork VS Code | Compatible (100 %) | Instalar `.vsix` + reglas en `AGENTS.md` o `.cursorrules` | Funciona con o sin la extensión `vscode.git` habilitada. |
| **Windsurf** | Fork VS Code | Compatible (100 %) | Instalar `.vsix` + reglas en `AGENTS.md` | Variables de tema CSS nativas aplicadas automáticamente. |
| **Qoder / Qwen IDE** | Fork VS Code | Compatible (100 %) | Instalar `.vsix` desde paleta de extensiones | Respaldo CLI completo para ramas y worktrees. |
| **Kiro** | Fork VS Code | Compatible (100 %) | Instalar `.vsix` + reglas en `AGENTS.md` | Compatible con flujos spec-driven y multi-worktree. |
| **Trae** | Fork VS Code | Compatible (100 %) | Instalar `.vsix` + reglas en `AGENTS.md` | Lectura sin bloqueo (`GIT_OPTIONAL_LOCKS=0`) evita choques con Builder. |
| **VSCodium** | Binario libre | Compatible (100 %) | Instalar `.vsix` (sin dependencias propietarias) | Cero telemetría; funciona 100 % offline. |
| **VS Code** | Oficial | Compatible (100 %) | Instalar `.vsix` o ejecutar con `F5` | Entorno base de referencia (`>= 1.90.0`). |
| **OpenCode / Claude Code / Aider** | Agentes CLI / TUI | Compatible vía CLI + `AGENTS.md` | `node dist/cli.js [--json] [--check]` | El CLI devuelve código de salida `2` con `--check` si la rama está protegida o bloqueada. |

### Requisitos de Git
- **Git ≥ 2.30** recomendado (`git worktree list --porcelain -z` disponible desde Git 2.15).
- **Git ≥ 2.41** activa el cálculo de `ahead/behind` en una sola llamada `for-each-ref`; en versiones anteriores de Git, BranchPilot degrada con elegancia listando todas las ramas sin fallar.
- Puedes verificar tu entorno ejecutando el comando **`BranchPilot: Diagnosticar compatibilidad del IDE y Git`** en la paleta de comandos.

---

## Uso del CLI Auxiliar (para OpenCode y hooks de terminal)

```bash
# Resumen legible en terminal
node dist/cli.js

# Salida estructurada JSON para agentes o scripts
node dist/cli.js --json

# Modo guard (sale con código 2 si estás en rama protegida, HEAD desacoplado o conflicto)
node dist/cli.js --check
```

---

## Desarrollo y Empaquetado Local (`.vsix`)

```bash
npm install
npm run build      # compila dist/extension.js, dist/webview.js y dist/cli.js
npm test           # ejecuta suite de pruebas en vitest
npm run lint       # verificación estricta con ESLint
npm run typecheck  # verificación TypeScript strict
npm run package    # genera el paquete instalable branchpilot-0.1.0.vsix
```

## Licencia

MIT
