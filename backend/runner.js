import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';

const TIMEOUT_MS = 3000;
const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KB

// Windows ships CPython as 'python' (no python3 shim); Linux/macOS use 'python3'.
// Override with PYTHON_CMD if the lab image needs something else.
function pythonCommand() {
  return process.env.PYTHON_CMD || (process.platform === 'win32' ? 'python' : 'python3');
}

export function normalizeOutput(str) {
  if (str == null) return '';
  return String(str)
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .map(line => line.trimEnd())
    .join('\n')
    .trim();
}

export function parseHiddenTests(htString) {
  if (!htString || !htString.trim()) return [];
  const tests = [];
  const blocks = htString.split(/\r?\n===\r?\n/);
  for (const block of blocks) {
    if (!block.trim()) continue;
    const parts = block.split(/\r?\n---\r?\n/);
    if (parts.length >= 2) {
      tests.push({
        input: parts[0],
        expected: parts.slice(1).join('\n---\n')
      });
    }
  }
  return tests;
}

function runProcess(cmd, args, options = {}, stdinData = '') {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let killed = false;

    const proc = spawn(cmd, args, {
      cwd: options.cwd,
      env: { PATH: process.env.PATH, LANG: 'en_US.UTF-8' },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      timedOut = true;
      killed = true;
      try { proc.kill('SIGKILL'); } catch (e) {}
      resolve({
        ok: false,
        timedOut: true,
        exitCode: -1,
        stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
        stderr: stderr.slice(0, MAX_OUTPUT_BYTES) + '\n[ERROR: Time Limit Exceeded (3.0s)]'
      });
    }, options.timeout || TIMEOUT_MS);

    proc.stdout.on('data', (data) => {
      if (stdout.length < MAX_OUTPUT_BYTES) {
        stdout += data.toString();
      }
    });

    proc.stderr.on('data', (data) => {
      if (stderr.length < MAX_OUTPUT_BYTES) {
        stderr += data.toString();
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      if (!killed) {
        resolve({
          ok: false,
          timedOut: false,
          exitCode: -1,
          stdout,
          stderr: `Failed to spawn process: ${err.message}`
        });
      }
    });

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (!timedOut) {
        resolve({
          ok: code === 0,
          timedOut: false,
          exitCode: code,
          stdout: stdout.slice(0, MAX_OUTPUT_BYTES),
          stderr: stderr.slice(0, MAX_OUTPUT_BYTES)
        });
      }
    });

    if (stdinData) {
      try {
        proc.stdin.write(stdinData);
      } catch (e) {}
    }
    try {
      proc.stdin.end();
    } catch (e) {}
  });
}

export async function executeCodeInSandbox(lang, code, stdin = '') {
  const runId = uuidv4();
  const tempDir = path.join(os.tmpdir(), `qubit_${runId}`);
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    let compileRes = { ok: true, stderr: '' };
    let runCmd = '';
    let runArgs = [];

    if (lang === 'python') {
      const scriptPath = path.join(tempDir, 'solution.py');
      fs.writeFileSync(scriptPath, code, 'utf-8');
      runCmd = pythonCommand();
      runArgs = [scriptPath];
    } else if (lang === 'c') {
      const srcPath = path.join(tempDir, 'solution.c');
      const binPath = path.join(tempDir, 'solution.out');
      fs.writeFileSync(srcPath, code, 'utf-8');

      compileRes = await runProcess('gcc', ['-O2', srcPath, '-o', binPath], { cwd: tempDir, timeout: 6000 });
      if (!compileRes.ok) {
        return {
          ok: false,
          compileError: true,
          stdout: '',
          stderr: compileRes.stderr || 'Compilation Failed'
        };
      }
      runCmd = binPath;
      runArgs = [];
    } else if (lang === 'cpp') {
      const srcPath = path.join(tempDir, 'solution.cpp');
      const binPath = path.join(tempDir, 'solution.out');
      fs.writeFileSync(srcPath, code, 'utf-8');

      compileRes = await runProcess('g++', ['-O2', '-std=c++17', srcPath, '-o', binPath], { cwd: tempDir, timeout: 6000 });
      if (!compileRes.ok) {
        return {
          ok: false,
          compileError: true,
          stdout: '',
          stderr: compileRes.stderr || 'Compilation Failed'
        };
      }
      runCmd = binPath;
      runArgs = [];
    } else if (lang === 'java') {
      const srcPath = path.join(tempDir, 'Main.java');
      fs.writeFileSync(srcPath, code, 'utf-8');

      compileRes = await runProcess('javac', ['Main.java'], { cwd: tempDir, timeout: 7000 });
      if (!compileRes.ok) {
        return {
          ok: false,
          compileError: true,
          stdout: '',
          stderr: compileRes.stderr || 'Compilation Failed'
        };
      }
      runCmd = 'java';
      runArgs = ['-Xmx256m', '-Xms32m', '-cp', tempDir, 'Main'];
    } else {
      return { ok: false, stderr: `Unsupported language: ${lang}` };
    }

    const execRes = await runProcess(runCmd, runArgs, { cwd: tempDir, timeout: TIMEOUT_MS }, stdin);
    return {
      ok: execRes.ok,
      timedOut: execRes.timedOut,
      exitCode: execRes.exitCode,
      stdout: execRes.stdout,
      stderr: execRes.stderr
    };
  } finally {
    // Clean up temporary workspace
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
  }
}

export async function gradeSubmission(problem, lang, code) {
  // 1. Grade against Sample Input first
  const sampleRes = await executeCodeInSandbox(lang, code, problem.si || '');
  if (sampleRes.compileError) {
    return {
      verdict: 'COMPILATION_ERROR',
      details: sampleRes.stderr,
      passed: false,
      samplePassed: false,
      hiddenPassed: 0,
      totalHidden: 0,
      output: sampleRes.stdout
    };
  }

  if (sampleRes.timedOut) {
    return {
      verdict: 'TIME_LIMIT_EXCEEDED',
      details: 'Time Limit Exceeded on Sample Test Case (3.0s)',
      passed: false,
      samplePassed: false,
      hiddenPassed: 0,
      totalHidden: 0,
      output: sampleRes.stdout
    };
  }

  if (!sampleRes.ok) {
    return {
      verdict: 'RUNTIME_ERROR',
      details: sampleRes.stderr || 'Runtime error during sample test run',
      passed: false,
      samplePassed: false,
      hiddenPassed: 0,
      totalHidden: 0,
      output: sampleRes.stdout
    };
  }

  const expectedSample = normalizeOutput(problem.eo || problem.so || '');
  const actualSample = normalizeOutput(sampleRes.stdout);
  const samplePassed = actualSample === expectedSample;

  if (!samplePassed) {
    return {
      verdict: 'WRONG_ANSWER',
      details: `Sample Output Mismatch. Expected:\n${expectedSample}\nGot:\n${actualSample}`,
      passed: false,
      samplePassed: false,
      hiddenPassed: 0,
      totalHidden: 0,
      output: sampleRes.stdout
    };
  }

  // 2. Grade against all Hidden Tests (Anti Hardcoding)
  const hiddenTests = parseHiddenTests(problem.ht);
  let hiddenPassed = 0;

  for (let i = 0; i < hiddenTests.length; i++) {
    const ht = hiddenTests[i];
    const htRes = await executeCodeInSandbox(lang, code, ht.input);
    if (htRes.ok && normalizeOutput(htRes.stdout) === normalizeOutput(ht.expected)) {
      hiddenPassed++;
    } else {
      break; // Stop at first failed hidden test
    }
  }

  const allPassed = hiddenPassed === hiddenTests.length;
  return {
    verdict: allPassed ? 'ACCEPTED' : 'WRONG_ANSWER',
    details: allPassed
      ? `All ${hiddenTests.length} hidden tests passed!`
      : `Failed on hidden test ${hiddenPassed + 1} of ${hiddenTests.length}`,
    passed: allPassed,
    samplePassed: true,
    hiddenPassed,
    totalHidden: hiddenTests.length,
    output: sampleRes.stdout
  };
}
