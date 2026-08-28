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
    if (!command || typeof command !== 'string') {
      throw new Error('Command string is required');
    }

    if (!isCommandAllowed(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }
    
    if (command.includes('rm -rf /') || command.toLowerCase().includes('powershell -command')) {
      throw new Error('Dangerous command sequence detected');
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

  toolRegistry.registerTool(
    'run_command',
    'Execute a safe development command in the workspace terminal',
    async (args = {}) => {
      const cmd = args.command || args.cmd;
      return await executeSafely(cmd, args.cwd, args.timeout);
    },
    ['engineer', 'qa'],
    { command: 'string (command to run, e.g. "node --check index.js")' }
  );

  toolRegistry.registerTool(
    'run_tests',
    'Execute project test suite in the workspace',
    async (args = {}) => {
      const cmd = args.testCommand || args.command || args.cmd || 'npm test';
      return await executeSafely(cmd, args.cwd, 60000);
    },
    ['engineer', 'qa'],
    { testCommand: 'string (optional test command, defaults to "npm test")' }
  );

  toolRegistry.registerTool(
    'install_packages',
    'Install npm packages in the workspace',
    async (args = {}) => {
      const pkgString = Array.isArray(args.packages) ? args.packages.join(' ') : (args.packages || args.package || '');
      return await executeSafely(`npm install ${pkgString}`, args.cwd, 120000);
    },
    ['engineer', 'qa'],
    { packages: 'string | string[] (package names to install)' }
  );
}
