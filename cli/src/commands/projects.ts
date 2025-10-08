import { Command } from "commander";
import chalk from "chalk";
import { requireAuth } from "../utils/auth";
import { getApiClient, handleApiError } from "../utils/api";
import { Project } from "../types";

export const projectsCommand = new Command("projects")
  .description("Manage projects")
  .action(() => {
    // Show help if no subcommand
    projectsCommand.help();
  });

projectsCommand
  .command("list")
  .alias("ls")
  .description("List all projects")
  .action(async () => {
    requireAuth();

    try {
      await listProjects();
    } catch (error) {
      handleApiError(error);
    }
  });

projectsCommand
  .command("create")
  .description("Create a new project")
  .requiredOption("-n, --name <name>", "Project name")
  .option("-d, --description <description>", "Project description")
  .action(async (options) => {
    requireAuth();

    try {
      await createProject(options);
    } catch (error) {
      handleApiError(error);
    }
  });

async function listProjects(): Promise<void> {
  const client = getApiClient();

  console.log(chalk.blue("Fetching projects..."));

  const response = await client.get<Project[]>("/projects");
  const projects = response.data;

  if (projects.length === 0) {
    console.log(chalk.yellow("No projects found"));
    return;
  }

  console.log(chalk.green(`\nFound ${projects.length} project(s):\n`));

  for (const project of projects) {
    console.log(chalk.white(`  ${project.name}`));
    console.log(chalk.gray(`    ID: ${project.id}`));
    if (project.description) {
      console.log(chalk.gray(`    Description: ${project.description}`));
    }
    console.log();
  }
}

async function createProject(options: any): Promise<void> {
  const client = getApiClient();

  console.log(chalk.blue(`Creating project "${options.name}"...`));

  const response = await client.post<Project>("/projects", {
    name: options.name,
    description: options.description || "",
  });

  const project = response.data;

  console.log(chalk.green(`✓ Project created successfully`));
  console.log(chalk.white(`  Name: ${project.name}`));
  console.log(chalk.gray(`  ID: ${project.id}`));
}
