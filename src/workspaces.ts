import { existsSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import simpleGit, { type SimpleGit } from "simple-git";

export interface Workspace {
  id: string;
  path: string;
}

function isGitRepo(dirPath: string): boolean {
  return existsSync(join(dirPath, ".git"));
}

export async function discoverWorkspaces(
  workspacePaths: string[]
): Promise<Workspace[]> {
  const seen = new Set<string>();
  const workspaces: Workspace[] = [];

  for (const rawPath of workspacePaths) {
    const absPath = resolve(rawPath);

    if (!existsSync(absPath)) continue;

    if (isGitRepo(absPath)) {
      if (!seen.has(absPath)) {
        seen.add(absPath);
        workspaces.push({ id: basename(absPath), path: absPath });
      }
      continue;
    }

    // Scan children
    const entries = readdirSync(absPath, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const childPath = join(absPath, entry.name);
      if (isGitRepo(childPath) && !seen.has(childPath)) {
        seen.add(childPath);
        workspaces.push({ id: entry.name, path: childPath });
      }
    }
  }

  return workspaces;
}

export async function getWorkspaceDetails(workspace: Workspace) {
  const git: SimpleGit = simpleGit(workspace.path);
  const [branchSummary, status] = await Promise.all([
    git.branch(),
    git.status(),
  ]);

  return {
    ...workspace,
    currentBranch: branchSummary.current,
    branches: branchSummary.all,
    isDirty: !status.isClean(),
    modifiedFiles: status.modified.length + status.not_added.length,
  };
}
