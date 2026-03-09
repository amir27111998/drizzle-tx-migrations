/**
 * Path resolution utilities for drizzle-tx-migrations
 */

import * as path from 'path';
import * as fs from 'fs';

/**
 * Convert a path to an absolute path
 * If already absolute, returns as-is
 * If relative, resolves from current working directory
 */
export function toAbsolutePath(inputPath: string): string {
  return path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
}

/**
 * Ensure a directory exists, creating it if necessary
 */
export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Check if a path is a TypeScript or JavaScript file
 */
export function isSchemaFile(filePath: string): boolean {
  return filePath.endsWith('.ts') || filePath.endsWith('.js');
}

/**
 * Sanitize a name for use in filenames
 * Converts to lowercase, replaces non-alphanumeric with underscores
 */
export function sanitizeFileName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Generate a migration filename with timestamp
 */
export function generateMigrationFileName(name: string, extension: 'ts' | 'js' = 'ts'): string {
  const timestamp = Date.now();
  const sanitized = sanitizeFileName(name);
  return `${timestamp}_${sanitized}.${extension}`;
}
