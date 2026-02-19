/**
 * Blocked file extensions from spec Section 9.2.
 * All dangerous executable / script file types.
 */
export const BLOCKED_FILE_EXTENSIONS: readonly string[] = [
  '.exe',
  '.bat',
  '.sh',
  '.cmd',
  '.msi',
  '.scr',
  '.ps1',
  '.vbs',
  '.js',
  '.jar',
  '.com',
  '.pif',
  '.wsf',
  '.hta',
  '.cpl',
  '.inf',
  '.reg',
  '.rgs',
  '.sct',
  '.shb',
  '.sys',
  '.dll',
] as const;
