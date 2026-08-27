import { exec } from 'child_process';
import util from 'util';
import path from 'path';
import { toolRegistry } from './toolRegistry.js';
import logger from '../utils/logger.js';

const execAsync = util.promisify(exec);

export function setupTerminalTools(workspaceDir) {
  const ALLOWED_COMMANDS = ['node', 'npm', 'npx', 'git', 'ls', 'dir', 'cat', 'type', 'find', 'grep', 'echo', 'mkdir'];
  const MAX_OUTPUT_SIZE = 1024 * 1024; // 1MB

  const isCommandAllowed = (command) => {
    const baseCommand = command.trim().split(' ')[0];
    return ALLOWED_COMMANDS.includes(baseCommand);
  };

  const executeSafely = async (command, cwd, timeout = 30000) => {
    if (!isCommandAllowed(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }
    
    if (command.includes('|') || command.includes('>')) {
       // A simplistic check, real implementation needs proper shell parsing
       if (command.includes('rm -rf /') || command.toLowerCase().includes('powershell')) {
           throw new Error('Dangerous command sequence detected');
       }
    }

    const safeCwd = path.resolve(workspaceDir, cwd || '.');
    if (!safeCwd.startsWith(path.resolve(workspaceDir))) {
      throw new Error(`Working directory outside workspace: ${cwd}`);
    }

    try {
      const { stdout, stderr } = await execAsync(command, { 
        cwd: safeCwd, 
        timeout: Math.min(timeout, 120000),
        maxBuffer: MAX_OUTPUT_SIZE 
      });
      return { stdout, stderr, exitCode: 0, timedOut: false };
    } catch (error) {
      return { 
        stdout: error.stdout || '', 
        stderr: error.stderr || error.message, 
        exitCode: error.code || 1, 
        timedOut: error.killed 
      };
    }
  };

  toolRegistry.registerTool('run_command', 'Run a command', async ({ command, cwd, timeout }) => {
    return await executeSafely(command, cwd, timeout);
  }, ['engineer', 'qa']);

  toolRegistry.registerTool('run_tests', 'Run tests', async ({ testCommand, cwd }) => {
    return await executeSafely(testCommand || 'npm test', cwd, 60000);
  }, ['engineer', 'qa']);

  toolRegistry.registerTool('install_packages', 'Install packages', async ({ packages, cwd }) => {
    const pkgString = Array.isArray(packages) ? packages.join(' ') : packages;
    return await executeSafely(`npm install ${pkgString}`, cwd, 120000);
  }, ['engineer', 'qa']);
}
