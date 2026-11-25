import type {
  LabStatus,
  PrescriptionAnalysisResult,
  PrescriptionMedicine,
  ReportAnalysisResult,
  SuggestionsResult,
  UploadedDocument,
} from '../types/clinical';

export const MANUAL_VERIFICATION_TEXT = 'Needs manual verification';
export const DISCUSSION_LABEL = 'For discussion with your doctor';
export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

export function validateInputPayload(
  file: UploadedDocument | null,
  text: string
): { valid: boolean; error?: string } {
  const trimmed = text.trim();

  if (!file && !trimmed) {
    return {
      valid: false,
      error: 'Please upload a PDF/image file or paste text before analyzing.',
    };
  }

  if (file) {
    if (!ALLOWED_MIME_TYPES.has(file.mimeType.toLowerCase())) {
      return {
        valid: false,
        error: 'Unsupported file type. Please upload a PDF, PNG, JPG, or WEBP file.',
      };
    }
    if (file.sizeBytes <= 0) {
      return {
        valid: false,
        error: 'The selected file is empty. Please choose a valid file.',
      };
    }
    if (file.sizeBytes > MAX_FILE_SIZE_BYTES) {
      return {
        valid: false,
        error: 'File is larger than 10 MB. Please upload a smaller image or PDF.',
      };
    }
  }

  return { valid: true };
}

export function cleanJsonFence(raw: string): string {
  const trimmed = (raw || '').trim();
  if (!trimmed.startsWith('```')) {
    return trimmed;
  }
  return trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();
}

export function normalizeLabStatus(raw: string | undefined | null): LabStatus {
  const value = (raw || '').trim().toLowerCase();
  if (value === 'normal') return 'Normal';
  if (value === 'high' || value === 'elevated' || value === 'above normal') return 'High';
  if (value === 'low' || value === 'below normal') return 'Low';
  return MANUAL_VERIFICATION_TEXT;
}

function safeField(value: unknown, fallback = MANUAL_VERIFICATION_TEXT): string {
  if (typeof value !== 'string') return fallback;
  const cleaned = value.trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

export function normalizePrescriptionResult(raw: unknown): PrescriptionAnalysisResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawMeds = Array.isArray(data.medicines) ? data.medicines : [];

  const medicines: PrescriptionMedicine[] = rawMeds.map((entry) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    const name = safeField(item.name);
    const generic_salt = safeField(item.generic_salt);
    const dose = safeField(item.dose);
    const timing = safeField(item.timing);
    const duration = safeField(item.duration);

    const containsManualFlag = [name, generic_salt, dose, timing, duration].some((field) =>
      field.toLowerCase().includes('needs manual verification')
    );

    return {
      name,
      generic_salt,
      dose,
      timing,
      duration,
      needs_verification: Boolean(item.needs_verification) || containsManualFlag,
      used_for: safeField(item.used_for, 'Not specified'),
      side_effects: safeField(item.side_effects, 'Not specified'),
      precautions: safeField(item.precautions, 'Not specified'),
      interactions: safeField(item.interactions, 'Not specified'),
    };
  });

  const general_notes = Array.isArray(data.general_notes)
    ? data.general_notes.filter((n): n is string => typeof n === 'string' && n.trim().length > 0)
    : [];

  return {
    summary: safeField(data.summary, 'Prescription details extracted below.'),
    medicines,
    general_notes,
    source_note: typeof data.source_note === 'string' ? data.source_note : undefined,
  };
}

export function normalizeReportResult(raw: unknown): ReportAnalysisResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawTests = Array.isArray(data.tests) ? data.tests : [];

  const tests = rawTests.map((entry) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return {
      test_name: safeField(item.test_name),
      value: safeField(item.value),
      normal_range: safeField(item.normal_range, 'Not listed'),
      status: normalizeLabStatus(typeof item.status === 'string' ? item.status : undefined),
    };
  });

  const diet_lifestyle_tips = Array.isArray(data.diet_lifestyle_tips)
    ? data.diet_lifestyle_tips.filter(
        (tip): tip is string => typeof tip === 'string' && tip.trim().length > 0
      )
    : [];

  return {
    tests,
    abnormal_summary: safeField(
      data.abnormal_summary,
      'Review the table above with a licensed doctor.'
    ),
    diet_lifestyle_tips,
    source_note: typeof data.source_note === 'string' ? data.source_note : undefined,
  };
}

export function normalizeSuggestionsResult(raw: unknown): SuggestionsResult {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawItems = Array.isArray(data.suggestions) ? data.suggestions : [];

  const suggestions = rawItems.map((entry) => {
    const item = (entry && typeof entry === 'object' ? entry : {}) as Record<string, unknown>;
    return {
      medicine_or_generic: safeField(item.medicine_or_generic, 'Unnamed option'),
      category: safeField(item.category, 'Related Option'),
      label: DISCUSSION_LABEL,
      reason: safeField(item.reason, 'Discuss suitability and dosing with your licensed doctor.'),
    };
  });

  const questions_for_doctor = Array.isArray(data.questions_for_doctor)
    ? data.questions_for_doctor.filter(
        (q): q is string => typeof q === 'string' && q.trim().length > 0
      )
    : [];

  return {
    overview: safeField(
      data.overview,
      'The following related options and generic alternatives are listed strictly for discussion with your doctor.'
    ),
    suggestions,
    questions_for_doctor,
  };
}

export function computeLabMetrics(result: ReportAnalysisResult): {
  total: number;
  normal: number;
  abnormal: number;
  unverified: number;
} {
  let normal = 0;
  let abnormal = 0;
  let unverified = 0;

  for (const test of result.tests) {
    if (test.status === 'Normal') {
      normal += 1;
    } else if (test.status === 'High' || test.status === 'Low') {
      abnormal += 1;
    } else {
      unverified += 1;
    }
  }

  return {
    total: result.tests.length,
    normal,
    abnormal,
    unverified,
  };
}

export function computePrescriptionMetrics(result: PrescriptionAnalysisResult): {
  total: number;
  verified: number;
  needsVerification: number;
} {
  const needsVerification = result.medicines.filter((m) => m.needs_verification).length;
  return {
    total: result.medicines.length,
    verified: result.medicines.length - needsVerification,
    needsVerification,
  };
}

export function buildCombinedSuggestionContext(
  prescription: PrescriptionAnalysisResult | null,
  report: ReportAnalysisResult | null,
  extraText: string
): string {
  const sections: string[] = [];

  if (prescription && prescription.medicines.length > 0) {
    const lines = prescription.medicines.map(
      (m) => `- ${m.name} (Generic: ${m.generic_salt}) | Dose: ${m.dose} | Timing: ${m.timing}`
    );
    sections.push(`Prescription Medicines:\n${lines.join('\n')}`);
  }

  if (report && report.tests.length > 0) {
    const lines = report.tests.map(
      (t) => `- ${t.test_name}: ${t.value} (Normal: ${t.normal_range}) [${t.status}]`
    );
    sections.push(`Lab Report Findings:\n${lines.join('\n')}`);
    if (report.abnormal_summary) {
      sections.push(`Lab Summary: ${report.abnormal_summary}`);
    }
  }

  const trimmedExtra = extraText.trim();
  if (trimmedExtra) {
    sections.push(`Additional User Context:\n${trimmedExtra}`);
  }

  return sections.join('\n\n').trim();
}
