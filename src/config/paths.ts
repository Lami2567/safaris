import path from 'path';

/**
 * Returns the primary path for writing or reading a local JSON persistence file.
 * If SAFARIS_TEST_DATA_DIR is set (e.g. during test runs), returns exclusively
 * an isolated temporary path to protect real application and production data.
 */
export function getPrimaryDataFilePath(fileName: string): string {
  if (process.env.SAFARIS_TEST_DATA_DIR && process.env.SAFARIS_TEST_DATA_DIR.trim()) {
    return path.resolve(process.env.SAFARIS_TEST_DATA_DIR.trim(), fileName);
  }
  return path.resolve(__dirname, `../database/${fileName}`);
}

/**
 * Resolves candidate paths for local JSON persistence files.
 * If SAFARIS_TEST_DATA_DIR is set (e.g. during test runs), returns exclusively
 * an isolated temporary path to protect real application and production data.
 */
export function resolveDataFilePaths(fileName: string): string[] {
  if (process.env.SAFARIS_TEST_DATA_DIR && process.env.SAFARIS_TEST_DATA_DIR.trim()) {
    return [path.resolve(process.env.SAFARIS_TEST_DATA_DIR.trim(), fileName)];
  }

  return [
    path.resolve(__dirname, `../database/${fileName}`),
    path.resolve(process.cwd(), `src/database/${fileName}`),
    path.resolve(process.cwd(), `backend/src/database/${fileName}`),
    path.resolve(process.cwd(), fileName),
  ];
}
