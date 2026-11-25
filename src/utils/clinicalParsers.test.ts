import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCombinedSuggestionContext,
  cleanJsonFence,
  computeLabMetrics,
  computePrescriptionMetrics,
  DISCUSSION_LABEL,
  MANUAL_VERIFICATION_TEXT,
  MAX_FILE_SIZE_BYTES,
  normalizeLabStatus,
  normalizePrescriptionResult,
  normalizeReportResult,
  normalizeSuggestionsResult,
  validateInputPayload,
} from './clinicalParsers';

test('validateInputPayload rejects empty input and invalid file types', () => {
  assert.equal(validateInputPayload(null, '   ').valid, false);
  assert.equal(
    validateInputPayload(
      { fileName: 'notes.txt', mimeType: 'text/plain', base64Data: 'abc', sizeBytes: 120 },
      ''
    ).valid,
    false
  );
  assert.equal(
    validateInputPayload(
      {
        fileName: 'huge.pdf',
        mimeType: 'application/pdf',
        base64Data: 'abc',
        sizeBytes: MAX_FILE_SIZE_BYTES + 1,
      },
      ''
    ).valid,
    false
  );
  assert.equal(
    validateInputPayload(
      { fileName: 'rx.pdf', mimeType: 'application/pdf', base64Data: 'abc', sizeBytes: 2048 },
      ''
    ).valid,
    true
  );
  assert.equal(validateInputPayload(null, 'Tab Metformin 500mg BD').valid, true);
});

test('cleanJsonFence strips markdown code fences cleanly', () => {
  assert.equal(cleanJsonFence('```json\n{"a": 1}\n```'), '{"a": 1}');
  assert.equal(cleanJsonFence('  {"b": 2}  '), '{"b": 2}');
});

test('normalizePrescriptionResult enforces manual verification for missing or unclear fields', () => {
  const result = normalizePrescriptionResult({
    summary: 'Two medicines found.',
    medicines: [
      {
        name: 'Glycomet 500',
        generic_salt: 'Metformin Hydrochloride',
        dose: '500 mg',
        timing: 'Twice daily after meals',
        duration: '30 days',
        needs_verification: false,
        used_for: 'Helps manage blood sugar levels.',
        side_effects: 'Mild stomach upset.',
        precautions: 'Take with meals.',
        interactions: 'Limit heavy alcohol use.',
      },
      {
        name: '',
        generic_salt: 'Needs manual verification',
        dose: '',
        timing: 'Once daily',
        duration: '5 days',
        needs_verification: false,
      },
    ],
  });

  assert.equal(result.medicines.length, 2);
  assert.equal(result.medicines[0].needs_verification, false);
  assert.equal(result.medicines[1].name, MANUAL_VERIFICATION_TEXT);
  assert.equal(result.medicines[1].dose, MANUAL_VERIFICATION_TEXT);
  assert.equal(result.medicines[1].needs_verification, true);

  const metrics = computePrescriptionMetrics(result);
  assert.deepEqual(metrics, { total: 2, verified: 1, needsVerification: 1 });
});

test('normalizeReportResult standardizes statuses and computes lab metrics', () => {
  assert.equal(normalizeLabStatus('normal'), 'Normal');
  assert.equal(normalizeLabStatus('HIGH'), 'High');
  assert.equal(normalizeLabStatus('below normal'), 'Low');
  assert.equal(normalizeLabStatus('unclear'), MANUAL_VERIFICATION_TEXT);

  const report = normalizeReportResult({
    tests: [
      { test_name: 'Hemoglobin', value: '10.6 g/dL', normal_range: '12.0 - 15.5 g/dL', status: 'Low' },
      { test_name: 'HbA1c', value: '6.8 %', normal_range: '< 5.7 %', status: 'High' },
      { test_name: 'Platelets', value: '240 K/uL', normal_range: '150 - 450 K/uL', status: 'Normal' },
    ],
    abnormal_summary: 'Hemoglobin is low and HbA1c is high.',
    diet_lifestyle_tips: ['Include iron-rich greens.', 'Walk 30 minutes daily.'],
  });

  const metrics = computeLabMetrics(report);
  assert.deepEqual(metrics, { total: 3, normal: 1, abnormal: 2, unverified: 0 });
});

test('normalizeSuggestionsResult enforces discussion label and builds combined context', () => {
  const suggestions = normalizeSuggestionsResult({
    suggestions: [
      {
        medicine_or_generic: 'Metformin Extended Release',
        category: 'Generic Alternative',
        label: 'Take this instead',
        reason: 'Often discussed if immediate-release causes stomach upset.',
      },
    ],
  });

  assert.equal(suggestions.suggestions[0].label, DISCUSSION_LABEL);

  const rx = normalizePrescriptionResult({
    medicines: [
      { name: 'Augmentin 625', generic_salt: 'Amoxicillin + Clavulanate', dose: '625 mg', timing: 'BD' },
    ],
  });
  const lab = normalizeReportResult({
    tests: [{ test_name: 'Vitamin D', value: '14 ng/mL', normal_range: '30 - 100 ng/mL', status: 'Low' }],
    abnormal_summary: 'Vitamin D is low.',
  });

  const ctx = buildCombinedSuggestionContext(rx, lab, 'Patient reports mild fatigue');
  assert.ok(ctx.includes('Augmentin 625'));
  assert.ok(ctx.includes('Vitamin D'));
  assert.ok(ctx.includes('Patient reports mild fatigue'));
});
