import { spawn } from 'node:child_process';
import path from 'node:path';

const PYTHON_DIR = path.join(process.cwd(), 'python');

export async function runPythonTool(
  module: string,
  args: string[],
): Promise<{ ok: boolean; [key: string]: unknown }> {
  return new Promise((resolve, reject) => {
    const child = spawn('uv', ['run', 'python', '-m', module, ...args], { cwd: PYTHON_DIR });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      reject(new Error(`Failed to spawn Python process: ${error.message}`));
    });
    child.on('close', () => {
      const lastLine = stdout.trim().split('\n').pop();
      if (!lastLine) {
        reject(new Error(`Python process produced no output: ${stderr}`));
        return;
      }
      try {
        resolve(JSON.parse(lastLine));
      } catch {
        reject(new Error(`Failed to parse Python output: ${stdout} ${stderr}`));
      }
    });
  });
}
