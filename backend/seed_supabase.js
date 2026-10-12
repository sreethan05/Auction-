import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabaseClient, isSupabaseReady } from './supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function seedSupabaseProblems() {
  console.log('--- Seeding DSA Problems to Supabase ---');
  if (!isSupabaseReady()) {
    console.error('❌ Supabase client is not ready. Please configure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env');
    process.exit(1);
  }

  const supabase = getSupabaseClient();
  const problemsPath = path.join(__dirname, '..', 'qubit-problems.json');
  if (!fs.existsSync(problemsPath)) {
    console.error('❌ qubit-problems.json not found at:', problemsPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(problemsPath, 'utf-8');
  const parsed = JSON.parse(raw);
  const problems = parsed.problems || [];

  console.log(`Found ${problems.length} DSA problems in qubit-problems.json.`);

  let insertedProblems = 0;
  let insertedHiddenTests = 0;

  for (const p of problems) {
    const diff = p.diff || 'Easy';
    const pts = diff.toLowerCase() === 'hard' ? 400 : (diff.toLowerCase() === 'medium' ? 300 : 200);

    const { error: pErr } = await supabase
      .from('problems')
      .upsert({
        id: p.id,
        key: p.key || p.id,
        title: p.title,
        diff: p.diff,
        pts: pts,
        cat: p.cat || 'Algorithms',
        description: p.desc || '',
        constraints: p.con || '',
        sample_input: p.si || '',
        sample_output: p.so || '',
        orig_id: p.origId || ''
      }, { onConflict: 'id' });

    if (pErr) {
      console.error(`Failed to upsert problem ${p.id}:`, pErr.message);
      continue;
    }
    insertedProblems++;

    // Hidden test cases
    if (p.ht) {
      // Format: input\n---\noutput\n===\ninput2\n---\noutput2
      const suites = p.ht.split(/\n?===\n?/);
      let order = 1;
      for (const suite of suites) {
        if (!suite.trim()) continue;
        const parts = suite.split(/\n?---\n?/);
        const inputData = parts[0] || '';
        const expectedOutput = parts[1] || '';

        await supabase
          .from('hidden_tests')
          .insert({
            problem_id: p.id,
            input_data: inputData.trim(),
            expected_output: expectedOutput.trim(),
            test_order: order++
          });
        insertedHiddenTests++;
      }
    }
  }

  console.log(`✅ Successfully seeded ${insertedProblems} problems and ${insertedHiddenTests} hidden test suites into Supabase!`);
}

seedSupabaseProblems().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
