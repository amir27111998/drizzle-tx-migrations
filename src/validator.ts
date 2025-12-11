import * as fs from 'fs';
import * as path from 'path';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface CheckResult {
  valid: boolean;
  hasPendingMigrations: boolean;
  hasValidationErrors: boolean;
  executed: number;
  pending: number;
  errors: string[];
  warnings: string[];
}

export class MigrationValidator {
  constructor(private migrationsFolder: string) {}

  async validate(): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!fs.existsSync(this.migrationsFolder)) {
      return {
        valid: true,
        errors: [],
        warnings: ['Migrations folder does not exist yet. Run generate to create your first migration.'],
      };
    }

    const files = fs
      .readdirSync(this.migrationsFolder)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .sort();

    if (files.length === 0) {
      return {
        valid: true,
        errors: [],
        warnings: ['No migration files found.'],
      };
    }

    // Check for duplicate timestamps
    const timestamps = new Map<string, string[]>();
    for (const file of files) {
      const timestamp = file.split('_')[0];
      if (!timestamps.has(timestamp)) {
        timestamps.set(timestamp, []);
      }
      timestamps.get(timestamp)!.push(file);
    }

    for (const [timestamp, fileList] of timestamps) {
      if (fileList.length > 1) {
        errors.push(`Duplicate timestamp ${timestamp} found in files: ${fileList.join(', ')}`);
      }
    }

    // Validate each migration file
    for (const file of files) {
      const filePath = path.join(this.migrationsFolder, file);
      const validation = await this.validateMigrationFile(filePath, file);

      errors.push(...validation.errors);
      warnings.push(...validation.warnings);
    }

    // Check for naming conventions
    for (const file of files) {
      const nameWithoutExt = path.basename(file, path.extname(file));
      const parts = nameWithoutExt.split('_');

      if (parts.length < 2) {
        warnings.push(`${file}: Migration name should follow format TIMESTAMP_description`);
      }

      const timestamp = parts[0];
      if (!/^\d+$/.test(timestamp)) {
        errors.push(`${file}: Invalid timestamp format. Should be numeric.`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private async validateMigrationFile(filePath: string, fileName: string): Promise<ValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if file is readable
      const content = fs.readFileSync(filePath, 'utf-8');

      // Basic syntax checks before importing
      if (!content.includes('up') || !content.includes('down')) {
        errors.push(`${fileName}: Missing up() or down() function`);
        return { valid: false, errors, warnings };
      }

      // Try to import the migration
      const migrationModule = await import(filePath);
      const migration = migrationModule.default || migrationModule;

      // Check if up function exists and is a function
      if (!migration.up || typeof migration.up !== 'function') {
        errors.push(`${fileName}: Missing or invalid up() function`);
      }

      // Check if down function exists and is a function
      if (!migration.down || typeof migration.down !== 'function') {
        errors.push(`${fileName}: Missing or invalid down() function`);
      }

      // Check function signatures (they should accept MigrationContext)
      if (migration.up) {
        const upStr = migration.up.toString();
        const hasDbParam = upStr.includes('db') || upStr.match(/\{\s*db\s*[,}]/);
        const hasSqlParam = upStr.includes('sql') || upStr.match(/\{\s*sql\s*[,}]/);

        if (!hasDbParam && !hasSqlParam) {
          warnings.push(`${fileName}: up() function may not be using MigrationContext parameters (db, sql)`);
        }
      }

      if (migration.down) {
        const downStr = migration.down.toString();
        const hasDbParam = downStr.includes('db') || downStr.match(/\{\s*db\s*[,}]/);
        const hasSqlParam = downStr.includes('sql') || downStr.match(/\{\s*sql\s*[,}]/);

        if (!hasDbParam && !hasSqlParam) {
          warnings.push(`${fileName}: down() function may not be using MigrationContext parameters (db, sql)`);
        }
      }

      // Check if functions return Promise
      if (migration.up) {
        const upStr = migration.up.toString();
        if (!upStr.includes('async') && !upStr.includes('Promise')) {
          warnings.push(`${fileName}: up() function should return Promise<void>`);
        }
      }

      if (migration.down) {
        const downStr = migration.down.toString();
        if (!downStr.includes('async') && !downStr.includes('Promise')) {
          warnings.push(`${fileName}: down() function should return Promise<void>`);
        }
      }

    } catch (error) {
      errors.push(`${fileName}: Failed to load migration: ${error}`);
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  checkForConflicts(executedMigrations: string[]): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!fs.existsSync(this.migrationsFolder)) {
      return { valid: true, errors: [], warnings: [] };
    }

    const files = fs
      .readdirSync(this.migrationsFolder)
      .filter((f) => f.endsWith('.ts') || f.endsWith('.js'))
      .map((f) => path.basename(f, path.extname(f)))
      .sort();

    const executedSet = new Set(executedMigrations);

    // Check if there are new migrations inserted before executed ones
    let lastExecutedIndex = -1;
    for (let i = 0; i < files.length; i++) {
      if (executedSet.has(files[i])) {
        lastExecutedIndex = i;
      }
    }

    for (let i = 0; i < lastExecutedIndex; i++) {
      if (!executedSet.has(files[i])) {
        warnings.push(
          `Migration ${files[i]} has an earlier timestamp than executed migrations. ` +
            `This may cause issues in other environments.`
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Comprehensive check for CI/CD pipelines
   * Returns exit code 1 if:
   * - There are validation errors
   * - There are pending migrations (when failOnPending is true)
   */
  async check(
    getStatus: () => Promise<{ executed: any[]; pending: string[] }>,
    options: { failOnPending?: boolean } = {}
  ): Promise<CheckResult> {
    const { failOnPending = true } = options;

    // Validate migration files
    const validation = await this.validate();

    let status: { executed: any[]; pending: string[] } | null = null;
    let conflictCheck: ValidationResult | null = null;

    try {
      // Check database status
      status = await getStatus();

      // Check for conflicts
      conflictCheck = this.checkForConflicts(status.executed.map((m) => m.name));
    } catch (error) {
      // Database might not be available
      return {
        valid: false,
        hasPendingMigrations: false,
        hasValidationErrors: validation.errors.length > 0,
        executed: 0,
        pending: 0,
        errors: [...validation.errors, `Failed to connect to database: ${error}`],
        warnings: validation.warnings,
      };
    }

    const allErrors = [
      ...validation.errors,
      ...(conflictCheck?.errors || []),
    ];

    const allWarnings = [
      ...validation.warnings,
      ...(conflictCheck?.warnings || []),
    ];

    const hasPendingMigrations = (status?.pending.length || 0) > 0;
    const hasValidationErrors = allErrors.length > 0;

    const isValid = !hasValidationErrors && (!failOnPending || !hasPendingMigrations);

    return {
      valid: isValid,
      hasPendingMigrations,
      hasValidationErrors,
      executed: status?.executed.length || 0,
      pending: status?.pending.length || 0,
      errors: allErrors,
      warnings: allWarnings,
    };
  }
}
