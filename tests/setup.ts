import * as fs from 'fs';
import * as path from 'path';

// Clean up test artifacts before/after tests
export function setupTestEnvironment(): { testDir: string; testDb: string } {
  const testId = Math.random().toString(36).substring(7);
  const testDir = path.join(__dirname, `test-migrations-${testId}`);
  const testDb = path.join(__dirname, `test-${testId}.db`);

  // Create test directory
  fs.mkdirSync(testDir, { recursive: true });

  return { testDir, testDb };
}

export function cleanupTestEnvironment(): void {
  // Clean all test directories and databases
  const files = fs.readdirSync(__dirname);

  files.forEach((file) => {
    const fullPath = path.join(__dirname, file);

    if (file.startsWith('test-migrations-') && fs.statSync(fullPath).isDirectory()) {
      try {
        fs.rmSync(fullPath, { recursive: true, force: true, maxRetries: 3 });
      } catch (e) {
        // Ignore cleanup errors
      }
    }

    if (file.startsWith('test-') && file.endsWith('.db')) {
      try {
        fs.unlinkSync(fullPath);
      } catch (e) {
        // Ignore cleanup errors
      }
    }
  });
}

// Clean everything on module load
cleanupTestEnvironment();
