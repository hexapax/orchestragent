import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import simpleGit from "simple-git";

export type CommitMode = "none" | "commit" | "commit-push";

export interface CreatePlanOptions {
  workspacePath: string;
  name: string;
  content: string;
  branch?: string;
  commitMode: CommitMode;
}

export class PlanManager {
  private getPlansDir(workspacePath: string): string {
    return join(workspacePath, "docs", "plans");
  }

  private getDatePrefix(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async createPlan(options: CreatePlanOptions): Promise<string> {
    const { workspacePath, name, content, commitMode } = options;
    const plansDir = this.getPlansDir(workspacePath);
    mkdirSync(plansDir, { recursive: true });

    const fileName = `${this.getDatePrefix()}-${name}.md`;
    const filePath = join(plansDir, fileName);
    writeFileSync(filePath, content, "utf-8");

    if (commitMode === "none") return filePath;

    const git = simpleGit(workspacePath);
    const relativePath = `docs/plans/${fileName}`;
    await git.add(relativePath);
    await git.commit(`plan: add ${name}`, [relativePath]);

    if (commitMode === "commit-push") {
      await git.push();
    }

    return filePath;
  }

  async listPlans(workspacePath: string): Promise<string[]> {
    const plansDir = this.getPlansDir(workspacePath);
    if (!existsSync(plansDir)) return [];
    return readdirSync(plansDir)
      .filter((f) => f.endsWith(".md"))
      .sort();
  }

  async getPlan(workspacePath: string, name: string): Promise<string | null> {
    const plansDir = this.getPlansDir(workspacePath);
    if (!existsSync(plansDir)) return null;
    const files = readdirSync(plansDir).filter(
      (f) => f.includes(name) && f.endsWith(".md")
    );
    if (files.length === 0) return null;
    return readFileSync(join(plansDir, files[0]), "utf-8");
  }
}
