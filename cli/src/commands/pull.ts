import { Command } from "commander";
import chalk from "chalk";
import { requireAuth } from "../utils/auth";
import { getApiClient, handleApiError } from "../utils/api";
import { Variable } from "../types";
import * as fs from "fs";
import * as path from "path";

export const pullCommand = new Command("pull")
  .description("Pull environment variables from the server")
  .requiredOption("-p, --project <name>", "Project name or ID")
  .requiredOption("-e, --env <name>", "Environment name")
  .option("-o, --output <file>", "Output file path", ".env")
  .option("--format <format>", "Output format (env|json)", "env")
  .option("--non-interactive", "Non-interactive mode for CI/CD", false)
  .action(async (options) => {
    requireAuth();

    try {
      await pullVariables(options);
    } catch (error) {
      handleApiError(error);
    }
  });

async function pullVariables(options: any): Promise<void> {
  const client = getApiClient();

  if (!options.nonInteractive) {
    console.log(
      chalk.blue(`Pulling variables from ${options.project}/${options.env}...`)
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

  // Get variables
  const varsResponse = await client.get<Variable[]>(
    `/environments/${environment.id}/variables`
  );
  const variables = varsResponse.data;

  if (!options.nonInteractive) {
    console.log(chalk.green(`✓ Fetched ${variables.length} variables`));
  }

  // Write to file
  const outputPath = path.resolve(options.output);

  if (options.format === "json") {
    const jsonOutput = variables.reduce((acc, v) => {
      acc[v.key] = v.value;
      return acc;
    }, {} as Record<string, string>);

    fs.writeFileSync(outputPath, JSON.stringify(jsonOutput, null, 2));
  } else {
    const envOutput = variables.map((v) => `${v.key}=${v.value}`).join("\n");

    fs.writeFileSync(outputPath, envOutput);
  }

  if (!options.nonInteractive) {
    console.log(chalk.green(`✓ Variables written to ${outputPath}`));
  }
}
