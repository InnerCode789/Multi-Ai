import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import util from 'util';
import { toolRegistry } from './toolRegistry.js';

const execAsync = util.promisify(exec);

export function setupSearchTools(workspaceDir) {
  const sanitizePath = (filePath) => {
    const resolvedPath = path.resolve(workspaceDir, filePath);
    if (!resolvedPath.startsWith(path.resolve(workspaceDir))) {
      throw new Error(`Path traversal detected: ${filePath}`);
    }
    return resolvedPath;
  };

  toolRegistry.registerTool('grep_search', 'Search file contents', async ({ query, directory = '.' }) => {
    const safePath = sanitizePath(directory);
    try {
      const { stdout } = await execAsync(`git grep -n "${query}"`, { cwd: safePath });
      return stdout;
    } catch (error) {
      if (error.code === 1) return 'No matches found';
      throw error;
    }
  }, ['*']);

  toolRegistry.registerTool('find_files', 'Find files by name', async ({ pattern, directory = '.' }) => {
    const safePath = sanitizePath(directory);
    try {
      const { stdout } = await execAsync(`find . -name "${pattern}"`, { cwd: safePath });
      return stdout;
    } catch (error) {
      // Basic fallback
      const entries = await fs.readdir(safePath, { recursive: true });
      return entries.filter(e => e.includes(pattern.replace(/\*/g, ''))).join('\n');
    }
  }, ['*']);

  toolRegistry.registerTool('read_file_lines', 'Read specific line range', async ({ filePath, startLine, endLine }) => {
    const safePath = sanitizePath(filePath);
    const content = await fs.readFile(safePath, 'utf-8');
    const lines = content.split('\n');
    return lines.slice(Math.max(0, startLine - 1), endLine).join('\n');
  }, ['*']);
}
