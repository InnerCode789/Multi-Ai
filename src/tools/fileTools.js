import fs from 'fs/promises';
import path from 'path';
import { toolRegistry } from './toolRegistry.js';
import logger from '../utils/logger.js';

export function setupFileTools(workspaceDir) {
  const sanitizePath = (filePath) => {
    const resolvedPath = path.resolve(workspaceDir, filePath);
    if (!resolvedPath.startsWith(path.resolve(workspaceDir))) {
      throw new Error(`Path traversal detected: ${filePath}`);
    }
    return resolvedPath;
  };

  toolRegistry.registerTool('read_file', 'Read file content', async ({ filePath }) => {
    const safePath = sanitizePath(filePath);
    return await fs.readFile(safePath, 'utf-8');
  }, ['*']);

  toolRegistry.registerTool('write_file', 'Create or overwrite file', async ({ filePath, content }) => {
    const safePath = sanitizePath(filePath);
    await fs.mkdir(path.dirname(safePath), { recursive: true });
    await fs.writeFile(safePath, content, 'utf-8');
    return `File written successfully to ${filePath}`;
  }, ['engineer']);

  toolRegistry.registerTool('list_directory', 'List directory contents', async ({ dirPath = '.' }) => {
    const safePath = sanitizePath(dirPath);
    const readDirRecursive = async (dir, depth = 0) => {
      if (depth > 3) return [];
      const entries = await fs.readdir(dir, { withFileTypes: true });
      let results = [];
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = path.relative(workspaceDir, fullPath);
        if (entry.isDirectory()) {
          results.push(`${relPath}/`);
          results = results.concat(await readDirRecursive(fullPath, depth + 1));
        } else {
          results.push(relPath);
        }
      }
      return results;
    };
    return await readDirRecursive(safePath);
  }, ['*']);

  toolRegistry.registerTool('search_files', 'Search for files matching pattern', async ({ pattern, directory = '.' }) => {
    const safePath = sanitizePath(directory);
    // Basic implementation since we don't have glob package imported, using standard string matching on readdir
    const entries = await fs.readdir(safePath, { recursive: true });
    return entries.filter(e => e.includes(pattern));
  }, ['*']);

  toolRegistry.registerTool('file_exists', 'Check if file exists', async ({ filePath }) => {
    const safePath = sanitizePath(filePath);
    try {
      await fs.access(safePath);
      return true;
    } catch {
      return false;
    }
  }, ['*']);

  toolRegistry.registerTool('delete_file', 'Delete file', async ({ filePath }) => {
    const safePath = sanitizePath(filePath);
    await fs.unlink(safePath);
    return `File ${filePath} deleted`;
  }, ['engineer']);
}
