#!/usr/bin/env node

import { Command } from "commander";
import { loginCommand } from "./commands/login";
import { pullCommand } from "./commands/pull";
import { pushCommand } from "./commands/push";
import { syncCommand } from "./commands/sync";
import { projectsCommand } from "./commands/projects";
import { varCommand } from "./commands/var";

const program = new Command();

program
  .name("env-config")
  .description("CLI tool for Environment Configuration Manager")
  .version("1.0.0");

// Register commands
program.addCommand(loginCommand);
program.addCommand(pullCommand);
program.addCommand(pushCommand);
program.addCommand(syncCommand);
program.addCommand(projectsCommand);
program.addCommand(varCommand);

program.parse(process.argv);
