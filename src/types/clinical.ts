export type AnalysisTab = 'prescription' | 'report' | 'suggestions';

export type LabStatus = 'Normal' | 'High' | 'Low' | 'Needs manual verification';

export interface UploadedDocument {
  fileName: string;
  mimeType: string;
  base64Data: string;
  sizeBytes: number;
}

export interface PrescriptionMedicine {
  name: string;
  generic_salt: string;
  dose: string;
  timing: string;
  duration: string;
  needs_verification: boolean;
  used_for: string;
  side_effects: string;
  precautions: string;
  interactions: string;
}

export interface PrescriptionAnalysisResult {
  summary: string;
  medicines: PrescriptionMedicine[];
  general_notes: string[];
  source_note?: string;
}

export interface LabTestRow {
  test_name: string;
  value: string;
  normal_range: string;
  status: LabStatus;
}

export interface ReportAnalysisResult {
  tests: LabTestRow[];
  abnormal_summary: string;
  diet_lifestyle_tips: string[];
  source_note?: string;
}

export interface MedicineSuggestion {
  medicine_or_generic: string;
  category: string;
  label: string;
  reason: string;
}

export interface SuggestionsResult {
  overview: string;
  suggestions: MedicineSuggestion[];
  questions_for_doctor: string[];
}
