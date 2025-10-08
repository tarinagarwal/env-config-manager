import { Command } from "commander";
import chalk from "chalk";
import { requireAuth } from "../utils/auth";
import { getApiClient, handleApiError } from "../utils/api";

export const syncCommand = new Command("sync")
  .description("Trigger platform synchronization")
  .requiredOption("-p, --project <name>", "Project name or ID")
  .requiredOption("-e, --env <name>", "Environment name")
  .option("--platform <platform>", "Specific platform to sync (optional)")
  .action(async (options) => {
    requireAuth();

    try {
      await syncEnvironment(options);
    } catch (error) {
      handleApiError(error);
    }
  });

async function syncEnvironment(options: any): Promise<void> {
  const client = getApiClient();

  console.log(chalk.blue(`Syncing ${options.project}/${options.env}...`));

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

  // Get connections
  const connectionsResponse = await client.get(
    `/projects/${project.id}/connections`
  );
  const connections = connectionsResponse.data;

  if (connections.length === 0) {
    console.log(
      chalk.yellow("No platform connections configured for this project")
    );
    return;
  }

  // Filter by platform if specified
  const connectionsToSync = options.platform
    ? connections.filter((c: any) => c.platform === options.platform)
    : connections;

  if (connectionsToSync.length === 0) {
    console.log(
      chalk.yellow(`No connections found for platform "${options.platform}"`)
    );
    return;
  }

  console.log(
    chalk.blue(`Syncing to ${connectionsToSync.length} platform(s)...`)
  );

  // Trigger sync for each connection
  for (const connection of connectionsToSync) {
    try {
      await client.post(`/connections/${connection.id}/sync`, {
        environmentId: environment.id,
      });
      console.log(chalk.green(`✓ Synced to ${connection.platform}`));
    } catch (error: any) {
      console.log(
        chalk.red(
          `✗ Failed to sync to ${connection.platform}: ${error.message}`
        )
      );
    }
  }

  console.log(chalk.green("✓ Sync complete"));
}
