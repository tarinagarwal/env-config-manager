import { isAuthenticated } from "./config";
import chalk from "chalk";

export function requireAuth(): void {
  if (!isAuthenticated()) {
    console.error(
      chalk.red('Not authenticated. Please run "env-config login" first.')
    );
    process.exit(1);
  }
}
