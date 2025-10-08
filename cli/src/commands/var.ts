import { Command } from "commander";
import chalk from "chalk";
import { requireAuth } from "../utils/auth";
import { getApiClient, handleApiError } from "../utils/api";
import { Variable } from "../types";

export const varCommand = new Command("var")
  .description("Manage variables")
  .action(() => {
    // Show help if no subcommand
    varCommand.help();
  });

varCommand
  .command("create")
  .description("Create a new variable")
  .requiredOption("-p, --project <name>", "Project name or ID")
  .requiredOption("-e, --env <name>", "Environment name")
  .requiredOption("-k, --key <key>", "Variable key")
  .requiredOption("-v, --value <value>", "Variable value")
  .option("-s, --secret", "Mark as secret", false)
  .action(async (options) => {
    requireAuth();

    try {
      await createVariable(options);
    } catch (error) {
      handleApiError(error);
    }
  });

varCommand
  .command("list")
  .alias("ls")
  .description("List variables in an environment")
  .requiredOption("-p, --project <name>", "Project name or ID")
  .requiredOption("-e, --env <name>", "Environment name")
  .option("--show-secrets", "Show secret values", false)
  .action(async (options) => {
    requireAuth();

    try {
      await listVariables(options);
    } catch (error) {
      handleApiError(error);
    }
  });

varCommand
  .command("delete")
  .alias("rm")
  .description("Delete a variable")
  .requiredOption("-p, --project <name>", "Project name or ID")
  .requiredOption("-e, --env <name>", "Environment name")
  .requiredOption("-k, --key <key>", "Variable key")
  .action(async (options) => {
    requireAuth();

    try {
      await deleteVariable(options);
    } catch (error) {
      handleApiError(error);
    }
  });

async function createVariable(options: any): Promise<void> {
  const client = getApiClient();

  // Get project and environment
  const { project, environment } = await getProjectAndEnvironment(
    options.project,
    options.env
  );

  console.log(chalk.blue(`Creating variable "${options.key}"...`));

  const response = await client.post<Variable>(
    `/environments/${environment.id}/variables`,
    {
      key: options.key,
      value: options.value,
      isSecret: options.secret,
    }
  );

  const variable = response.data;

  console.log(chalk.green(`✓ Variable created successfully`));
  console.log(chalk.white(`  Key: ${variable.key}`));
  console.log(chalk.gray(`  Secret: ${variable.isSecret ? "Yes" : "No"}`));
}

async function listVariables(options: any): Promise<void> {
  const client = getApiClient();

  // Get project and environment
  const { project, environment } = await getProjectAndEnvironment(
    options.project,
    options.env
  );

  console.log(
    chalk.blue(`Fetching variables from ${project.name}/${environment.name}...`)
  );

  const response = await client.get<Variable[]>(
    `/environments/${environment.id}/variables`
  );
  const variables = response.data;

  if (variables.length === 0) {
    console.log(chalk.yellow("No variables found"));
    return;
  }

  console.log(chalk.green(`\nFound ${variables.length} variable(s):\n`));

  for (const variable of variables) {
    const value =
      variable.isSecret && !options.showSecrets
        ? "***********"
        : variable.value;

    console.log(chalk.white(`  ${variable.key}=${value}`));
    if (variable.isSecret) {
      console.log(chalk.gray(`    (secret)`));
    }
  }
}

async function deleteVariable(options: any): Promise<void> {
  const client = getApiClient();

  // Get project and environment
  const { project, environment } = await getProjectAndEnvironment(
    options.project,
    options.env
  );

  // Find variable by key
  const varsResponse = await client.get<Variable[]>(
    `/environments/${environment.id}/variables`
  );
  const variable = varsResponse.data.find((v) => v.key === options.key);

  if (!variable) {
    throw new Error(`Variable "${options.key}" not found`);
  }

  console.log(chalk.blue(`Deleting variable "${options.key}"...`));

  await client.delete(`/variables/${variable.id}`);

  console.log(chalk.green(`✓ Variable deleted successfully`));
}

async function getProjectAndEnvironment(
  projectNameOrId: string,
  envNameOrId: string
): Promise<{ project: any; environment: any }> {
  const client = getApiClient();

  // Get project
  const projectsResponse = await client.get("/projects");
  const project = projectsResponse.data.find(
    (p: any) => p.name === projectNameOrId || p.id === projectNameOrId
  );

  if (!project) {
    throw new Error(`Project "${projectNameOrId}" not found`);
  }

  // Get environment
  const envsResponse = await client.get(`/projects/${project.id}/environments`);
  const environment = envsResponse.data.find(
    (e: any) => e.name === envNameOrId || e.id === envNameOrId
  );

  if (!environment) {
    throw new Error(
      `Environment "${envNameOrId}" not found in project "${project.name}"`
    );
  }

  return { project, environment };
}
