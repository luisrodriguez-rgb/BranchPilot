import { evaluateAgentPrecheck } from './ai/taskContext';
import { GitRepository } from './git/repository';
import { probeGitVersion } from './shared/ideCompatibility';
import { DEFAULT_PROTECTION } from './shared/protection';
import { isDirty } from './shared/types';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const checkMode = args.includes('--check');
  const dirArg = args.find((a) => !a.startsWith('-')) ?? process.cwd();

  const repo = await GitRepository.open(dirArg);
  if (!repo) {
    if (jsonMode) {
      console.log(JSON.stringify({ ok: false, error: 'No git repository found', cwd: dirArg }));
    } else {
      console.error(`[BranchPilot] No se encontró un repositorio Git en: ${dirArg}`);
    }
    process.exitCode = 1;
    return;
  }

  const [state, gitVersion] = await Promise.all([repo.snapshot(), probeGitVersion(repo.root)]);
  const precheck = evaluateAgentPrecheck({
    head: state.head,
    workingTree: state.workingTree,
    protection: DEFAULT_PROTECTION,
    baseBranch: state.baseBranch,
  });

  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          ok: precheck.status !== 'blocked',
          repo: state.name,
          root: state.root,
          head: state.head,
          baseBranch: state.baseBranch,
          dirty: isDirty(state.workingTree),
          workingTree: state.workingTree,
          worktreesCount: state.worktrees.length,
          branchesCount: state.branches.length,
          gitVersion: gitVersion?.raw,
          precheck,
        },
        null,
        2,
      ),
    );
  } else {
    const branchLabel = state.head.detached ? `HEAD (${state.head.shortHash ?? 'desacoplado'})` : (state.head.branch ?? 'HEAD');
    console.log(`BranchPilot CLI — ${state.name} (${state.root})`);
    console.log(`  Rama activa : ${branchLabel}`);
    console.log(`  Rama base   : ${state.baseBranch ?? '—'}`);
    console.log(`  Ramas       : ${state.branches.length} totales · Worktrees: ${state.worktrees.length}`);
    console.log(`  Pre-chequeo : [${precheck.status.toUpperCase()}] ${precheck.headline}`);
    for (const d of precheck.details) console.log(`    - ${d}`);
  }

  if (checkMode && (precheck.status === 'blocked' || precheck.suggestNewTaskBranch)) {
    process.exitCode = 2;
  }
}

void main();
