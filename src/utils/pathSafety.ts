import * as path from 'path';

/**
 * Sanitizes a filename/directory name to prevent path traversal attacks
 * and ensures it follows kebab-case convention.
 *
 * Based on vercel-labs/skills sanitizeName pattern.
 *
 * @param name - The name to sanitize
 * @returns Sanitized name safe for use in file paths
 */
export function sanitizeName(name: string): string {
  const sanitized = name
    .toLowerCase()
    // Replace any sequence of characters that are NOT lowercase letters (a-z),
    // digits (0-9), dots (.), or underscores (_) with a single hyphen.
    // This converts spaces, special chars, and path traversal attempts (../) into hyphens.
    .replace(/[^a-z0-9._]+/g, '-')
    // Remove leading/trailing dots and hyphens to prevent hidden files (.) and
    // ensure clean directory names.
    .replace(/^[.\-]+|[.\-]+$/g, '');

  // Limit to 255 chars (common filesystem limit), fallback to 'unnamed-skill' if empty
  return sanitized.substring(0, 255) || 'unnamed-skill';
}

/**
 * Validates that a path is within an expected base directory.
 * Prevents path traversal attacks like `../../etc/passwd`.
 *
 * @param basePath - The expected base directory
 * @param targetPath - The path to validate
 * @returns true if targetPath is within basePath
 */
export function isPathSafe(basePath: string, targetPath: string): boolean {
  const normalizedBase = path.normalize(path.resolve(basePath));
  const normalizedTarget = path.normalize(path.resolve(targetPath));

  return (
    normalizedTarget.startsWith(normalizedBase + path.sep) ||
    normalizedTarget === normalizedBase
  );
}
