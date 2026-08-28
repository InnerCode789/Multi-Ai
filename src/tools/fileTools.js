import fs from 'fs/promises';
import path from 'path';
import { toolRegistry } from './toolRegistry.js';
import logger from '../utils/logger.js';

export function setupFileTools(workspaceDir) {
  const sanitizePath = (filePath = '.') => {
    const cleanPath = typeof filePath === 'string' ? filePath : '.';
    const resolvedPath = path.resolve(workspaceDir, cleanPath);
    if (!resolvedPath.startsWith(path.resolve(workspaceDir))) {
      throw new Error(`Path traversal detected: ${cleanPath}`);
    }
    return resolvedPath;
  };

  toolRegistry.registerTool(
    'read_file',
    'Read complete UTF-8 content of a file in the workspace',
    async (args = {}) => {
      const target = args.filePath || args.path || args.file;
      if (!target) throw new Error('read_file requires filePath parameter');
      const safePath = sanitizePath(target);
      return await fs.readFile(safePath, 'utf-8');
    },
    ['*'],
    { filePath: 'string (relative path to file, e.g. "index.js")' }
  );

  toolRegistry.registerTool(
    'write_file',
    'Create or overwrite a file with the given content in the workspace',
    async (args = {}) => {
      const target = args.filePath || args.path || args.file;
      const content = args.content ?? args.code ?? args.text ?? '';
      if (!target) throw new Error('write_file requires filePath parameter');
      const safePath = sanitizePath(target);

      try {
        const stat = await fs.stat(safePath).catch(() => null);
        if (stat && stat.isDirectory()) {
          throw new Error(`Cannot write directly to directory "${target}". Please provide a complete file path (e.g. "${target}/index.js").`);
        }
      } catch (e) {
        if (e.message.includes('Cannot write directly')) throw e;
      }

      await fs.mkdir(path.dirname(safePath), { recursive: true });
      await fs.writeFile(safePath, content, 'utf-8');
      return `File written successfully to ${target}`;
    },
    ['engineer'],
    {
      filePath: 'string (relative path to file, e.g. "index.js")',
      content: 'string (complete source code / content to write)'
    }
  );

  toolRegistry.registerTool(
    'list_directory',
    'List files and subdirectories in the workspace',
    async (args = {}) => {
      const target = args.dirPath || args.path || args.directory || args.dir || '.';
      const safePath = sanitizePath(target);
      const readDirRecursive = async (dir, depth = 0) => {
        if (depth > 3) return [];
        try {
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
        } catch {
          return [];
        }
      };
      const results = await readDirRecursive(safePath);
      return results.length > 0 ? results : ['(workspace directory is currently empty)'];
    },
    ['*'],
    { dirPath: 'string (optional relative path, defaults to ".")' }
  );

  toolRegistry.registerTool(
    'search_files',
    'Search for files matching substring in filename',
    async (args = {}) => {
      const pattern = args.pattern || args.query || '';
      const target = args.directory || args.dirPath || args.path || '.';
      const safePath = sanitizePath(target);
      try {
        const entries = await fs.readdir(safePath, { recursive: true });
        return entries.filter(e => typeof e === 'string' && e.includes(pattern));
      } catch {
        return [];
      }
    },
    ['*'],
    { pattern: 'string (search substring)' }
  );

  toolRegistry.registerTool(
    'file_exists',
    'Check if a file exists in the workspace',
    async (args = {}) => {
      const target = args.filePath || args.path || args.file;
      if (!target) return false;
      const safePath = sanitizePath(target);
      try {
        await fs.access(safePath);
        return true;
      } catch {
        return false;
      }
    },
    ['*'],
    { filePath: 'string (relative path to file)' }
  );

  toolRegistry.registerTool(
    'delete_file',
    'Delete a file from the workspace',
    async (args = {}) => {
      const target = args.filePath || args.path || args.file;
      if (!target) throw new Error('delete_file requires filePath parameter');
      const safePath = sanitizePath(target);
      await fs.unlink(safePath);
      return `File ${target} deleted`;
    },
    ['engineer'],
    { filePath: 'string (relative path to file to delete)' }
  );
}
