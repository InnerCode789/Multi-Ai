import { orchestrator } from './src/core/orchestrator.js';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function runLocalEndToEndTest() {
  console.log('===============================================================');
  console.log('STARTING REAL LOCAL-ONLY END-TO-END AUTONOMOUS ENGINEERING TEST');
  console.log('Model: Ollama (deepseek-r1:7b) | Cloud Providers: DISABLED');
  console.log('===============================================================\n');

  const startTime = Date.now();
  const goalText = 'Create a small Node.js utility called calculateTotal(items). Each item has a price and quantity. The function should return the total cost. Include unit tests and a README explaining usage.';
  
  const executionEvents = [];

  try {
    const result = await orchestrator.runGoal({
      goalDescription: goalText,
      maxIterations: 3,
      onEvent: (evt) => {
        const time = new Date().toISOString().split('T')[1].slice(0, 8);
        const logLine = `[${time}] [${evt.agent}] [${evt.type.toUpperCase()}]: ${evt.summary}`;
        console.log(logLine);
        executionEvents.push({ time, agent: evt.agent, type: evt.type, summary: evt.summary });
      }
    });

    const durationSec = Math.round((Date.now() - startTime) / 1000);
    console.log('\n===============================================================');
    console.log('GOAL EXECUTION COMPLETED');
    console.log(`Status: ${result.status.toUpperCase()} | Total Duration: ${durationSec}s`);
    console.log(`Workspace: ${result.workspaceDir}`);
    console.log('===============================================================\n');

    // 1. Inspect generated files in the workspace
    console.log('--- WORKSPACE FILES INSPECTION ---');
    const files = fs.readdirSync(result.workspaceDir);
    console.log('Files present in workspace:', files);

    files.forEach(file => {
      const fullPath = path.join(result.workspaceDir, file);
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        console.log(`\n--- [FILE] ${file} (${stat.size} bytes) ---`);
        const content = fs.readFileSync(fullPath, 'utf-8');
        console.log(content.slice(0, 500) + (content.length > 500 ? '\n...(truncated)' : ''));
      }
    });

    // 2. Execute tests in the workspace to verify functionality
    console.log('\n--- VERIFYING GENERATED TESTS IN WORKSPACE ---');
    try {
      if (fs.existsSync(path.join(result.workspaceDir, 'package.json'))) {
        const pkg = JSON.parse(fs.readFileSync(path.join(result.workspaceDir, 'package.json'), 'utf-8'));
        if (pkg.scripts && pkg.scripts.test) {
          console.log(`Running test script from package.json: "${pkg.scripts.test}"...`);
          const testOutput = execSync('npm test', { cwd: result.workspaceDir, timeout: 20000, encoding: 'utf-8' });
          console.log('TEST RUN OUTPUT:\n', testOutput);
        }
      }
    } catch (testErr) {
      console.log('npm test execution note/output:\n', testErr.stdout || testErr.message);
    }

    // Direct node test run if test files exist
    const testFiles = files.filter(f => f.includes('test'));
    for (const tf of testFiles) {
      try {
        console.log(`Directly executing node ${tf}...`);
        const out = execSync(`node ${tf}`, { cwd: result.workspaceDir, timeout: 10000, encoding: 'utf-8' });
        console.log(`OUTPUT for ${tf}:\n`, out);
      } catch (err) {
        console.log(`Error running ${tf}:`, err.stdout || err.message);
      }
    }

    // 3. Acceptance Criteria Summary
    console.log('\n--- ACCEPTANCE CRITERIA RESULTS ---');
    result.acceptanceCriteria.forEach(c => {
      console.log(`- [${c.verified ? 'PASSED' : 'FAILED'}] ${c.id}: ${c.description}`);
      if (c.evidence) console.log(`  Evidence: ${c.evidence}`);
    });

    return { success: result.status === 'completed', result, executionEvents };
  } catch (err) {
    console.error('\n❌ LOCAL END-TO-END RUN FAILED:', err.message);
    return { success: false, error: err.message };
  }
}

runLocalEndToEndTest();
