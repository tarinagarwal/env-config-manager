import { Command } from "commander";
import chalk from "chalk";
import { requireAuth } from "../utils/auth";
import { getApiClient, handleApiError } from "../utils/api";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";

export const pushCommand = new Command("push")
  .description("Push environment variables to the server")
  .requiredOption("-p, --project <name>", "Project name or ID")
  .requiredOption("-e, --env <name>", "Environment name")
  .option("-f, --file <file>", "Input file path", ".env")
  .option("--format <format>", "Input format (env|json)", "env")
  .option("--overwrite", "Overwrite existing variables", false)
  .option("--non-interactive", "Non-interactive mode for CI/CD", false)
  .action(async (options) => {
    requireAuth();

    try {
      await pushVariables(options);
    } catch (error) {
      handleApiError(error);
    }
  });

async function pushVariables(options: any): Promise<void> {
  const client = getApiClient();

  // Read variables from file
  const filePath = path.resolve(options.file);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const fileContent = fs.readFileSync(filePath, "utf-8");
  let variables: Record<string, string>;

  if (options.format === "json") {
    variables = JSON.parse(fileContent);
  } else {
    variables = dotenv.parse(fileContent);
  }

  if (!options.nonInteractive) {
    console.log(
      chalk.blue(
        `Pushing ${Object.keys(variables).length} variables to ${
          options.project
        }/${options.env}...`
      )
    );
  }

  // Get project by name
  const projectsResponse = await client.get("/projects");
  const project = projectsResponse.data.find(
    (p: any) => p.name === options.project || p.id === options.project
  );

  if (!project) {
    throw new Error(`Project "${options.project}" not found`);
  }

  // Get environment by name
  const envsResponse = await client.get(`/projects/${project.id}/environments`);
  const environment = envsResponse.data.find(
    (e: any) => e.name === options.env || e.id === options.env
  );

  if (!environment) {
    throw new Error(
      `Environment "${options.env}" not found in project "${options.project}"`
    );
  }

  // Get existing variables
  const existingVarsResponse = await client.get(
    `/environments/${environment.id}/variables`
  );
  const existingVars = existingVarsResponse.data;
  const existingVarsMap = new Map<string, any>(
    existingVars.map((v: any) => [v.key, v])
  );

  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const [key, value] of Object.entries(variables)) {
    const existing = existingVarsMap.get(key);

    if (existing) {
      if (options.overwrite) {
        await client.patch(`/variables/${existing.id}`, { value });
        updated++;
      } else {
        skipped++;
      }
    } else {
      await client.post(`/environments/${environment.id}/variables`, {
        key,
        value,
        isSecret: false,
      });
      created++;
    }
  }

  if (!options.nonInteractive) {
    console.log(chalk.green(`✓ Push complete:`));
    console.log(chalk.white(`  Created: ${created}`));
    console.log(chalk.white(`  Updated: ${updated}`));
    if (skipped > 0) {
      console.log(
        chalk.yellow(
          `  Skipped: ${skipped} (use --overwrite to update existing)`
        )
      );
    }
  }
}
