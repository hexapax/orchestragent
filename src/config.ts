import { readFileSync } from "node:fs";
import { load as loadYaml } from "js-yaml";
import { z } from "zod";

const ConfigSchema = z.object({
  workspacePaths: z.array(z.string()).min(1, "At least one workspace path required"),
  server: z
    .object({
      port: z.number().default(3100),
      host: z.string().default("0.0.0.0"),
    })
    .default({ port: 3100, host: "0.0.0.0" }),
  auth: z
    .object({
      oauth: z
        .object({
          enabled: z.boolean().default(false),
          issuer: z.string().optional(),
        })
        .default({ enabled: false }),
      token: z
        .object({
          enabled: z.boolean().default(false),
        })
        .default({ enabled: false }),
    })
    .default({ oauth: { enabled: false }, token: { enabled: false } }),
});

export type Config = z.infer<typeof ConfigSchema> & {
  auth: { tokenValue?: string };
};

export function loadConfig(configPath: string): Config {
  const raw = readFileSync(configPath, "utf-8");
  const parsed = loadYaml(raw) as Record<string, unknown>;
  const config = ConfigSchema.parse(parsed);

  // Env overrides
  const port = process.env.ORCHESTRAGENT_PORT;
  if (port) config.server.port = parseInt(port, 10);

  const host = process.env.ORCHESTRAGENT_HOST;
  if (host) config.server.host = host;

  const token = process.env.ORCHESTRAGENT_AUTH_TOKEN;
  const result: Config = { ...config, auth: { ...config.auth, tokenValue: token } };

  if (token) {
    result.auth.token = { enabled: true };
  }

  return result;
}
