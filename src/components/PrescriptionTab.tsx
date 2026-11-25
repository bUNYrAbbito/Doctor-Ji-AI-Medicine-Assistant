import React, { useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';
import { FileDropzone } from './FileDropzone';
import { SAMPLE_PRESCRIPTION_TEXT } from '../data/samples';
import type { PrescriptionAnalysisResult, UploadedDocument } from '../types/clinical';
import {
  computePrescriptionMetrics,
  normalizePrescriptionResult,
  validateInputPayload,
} from '../utils/clinicalParsers';

interface PrescriptionTabProps {
  result: PrescriptionAnalysisResult | null;
  onResultChange: (result: PrescriptionAnalysisResult | null) => void;
}

export function PrescriptionTab({ result, onResultChange }: PrescriptionTabProps) {
  const [file, setFile] = useState<UploadedDocument | null>(null);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(0);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateInputPayload(file, text);
    if (!validation.valid) {
      setError(validation.error ?? 'Invalid input.');
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/analyze/prescription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text.trim() || undefined,
          file: file
            ? {
                fileName: file.fileName,
                mimeType: file.mimeType,
                base64Data: file.base64Data,
              }
            : undefined,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Could not analyze the prescription.');
      }

      const normalized = normalizePrescriptionResult(payload);
      onResultChange(normalized);
      setExpandedIndex(0);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Unable to complete prescription analysis right now.'
      );
    } finally {
      setLoading(false);
    }
  };

  const metrics = result ? computePrescriptionMetrics(result) : null;

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAnalyze}
        className="rounded-lg border border-neutral-800 bg-[#111111] p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Prescription Analysis</h2>
            <p className="text-sm text-slate-400">
              Upload a prescription image or PDF, or paste prescription text below. Unclear items
              are never guessed.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setText(SAMPLE_PRESCRIPTION_TEXT);
              setError(null);
            }}
            className="self-start sm:self-auto rounded-md border border-neutral-700 bg-black px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-cyan-400 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
          >
            Load Sample Prescription
          </button>
        </div>

        <FileDropzone
          label="Prescription File (Image or PDF)"
          helperText="PNG, JPG, WEBP, or PDF up to 10 MB"
          file={file}
          onFileChange={setFile}
          onError={setError}
        />

        <div className="space-y-2">
          <label htmlFor="prescription-text" className="block text-sm font-medium text-slate-200">
            Or Paste Prescription Text
          </label>
          <textarea
            id="prescription-text"
            rows={5}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Example: Tab Metformin 500mg — 1 tab twice daily after meals for 30 days"
            className="w-full rounded-lg border border-neutral-800 bg-black px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-neutral-500 focus:border-cyan-400 focus:outline-none focus:ring-1 focus:ring-cyan-400"
          />
        </div>

        {error && (
          <div
            role="alert"
            className="rounded-lg border border-red-900/80 bg-red-950/40 px-4 py-3 text-sm text-red-300"
          >
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-cyan-400 px-5 py-2.5 text-sm font-semibold text-black hover:bg-cyan-300 disabled:opacity-60 disabled:cursor-not-allowed transition-colors whitespace-nowrap shrink-0"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {loading ? 'Analyzing Prescription...' : 'Analyze Prescription'}
          </button>
          {(text || file || result) && (
            <button
              type="button"
              onClick={() => {
                setText('');
                setFile(null);
                setError(null);
                onResultChange(null);
              }}
              className="rounded-lg border border-neutral-800 bg-black px-4 py-2.5 text-sm font-medium text-slate-300 hover:border-neutral-600 hover:text-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Clear
            </button>
          )}
        </div>
      </form>

      {result && metrics && (
        <div className="space-y-6" data-testid="prescription-results">
          <div className="rounded-lg border border-neutral-800 bg-[#111111] p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-b border-neutral-800 pb-4">
              <div>
                <p className="text-xs text-slate-400">Medicines Extracted</p>
                <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-100">
                  {metrics.total}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Extracted Clearly</p>
                <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-emerald-400">
                  {metrics.verified}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Needs Manual Verification</p>
                <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-red-400">
                  {metrics.needsVerification}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <p className="text-sm text-slate-200 leading-relaxed">{result.summary}</p>
              {result.source_note && (
                <p className="text-xs text-slate-400">{result.source_note}</p>
              )}
            </div>
          </div>

          {result.medicines.length > 0 && (
            <div className="rounded-lg border border-neutral-800 bg-[#111111] overflow-hidden">
              <div className="px-6 py-4 border-b border-neutral-800">
                <h3 className="text-base font-semibold text-slate-100">Extracted Schedule</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-neutral-800 bg-black/50 text-xs font-medium text-slate-400">
                      <th className="px-6 py-3">Medicine</th>
                      <th className="px-4 py-3">Generic / Salt</th>
                      <th className="px-4 py-3">Dose</th>
                      <th className="px-4 py-3">Timing</th>
                      <th className="px-4 py-3">Duration</th>
                      <th className="px-6 py-3">Clarity</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/80 text-sm">
                    {result.medicines.map((med, idx) => (
                      <tr key={`${med.name}-${idx}`} className="hover:bg-neutral-900/60">
                        <td className="px-6 py-3.5 font-medium text-slate-100">{med.name}</td>
                        <td className="px-4 py-3.5 text-slate-300">{med.generic_salt}</td>
                        <td className="px-4 py-3.5 font-mono tabular-nums text-slate-200">
                          {med.dose}
                        </td>
                        <td className="px-4 py-3.5 text-slate-300">{med.timing}</td>
                        <td className="px-4 py-3.5 font-mono tabular-nums text-slate-300">
                          {med.duration}
                        </td>
                        <td className="px-6 py-3.5 whitespace-nowrap">
                          {med.needs_verification ? (
                            <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-red-950/80 text-red-300 border border-red-800/70">
                              Needs manual verification
                            </span>
                          ) : (
                            <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-emerald-950/80 text-emerald-300 border border-emerald-800/70">
                              Clear
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {result.medicines.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-slate-100">
                Simple Medicine Explanations
              </h3>
              {result.medicines.map((med, idx) => {
                const isOpen = expandedIndex === idx;
                return (
                  <div
                    key={`exp-${med.name}-${idx}`}
                    className="rounded-lg border border-neutral-800 bg-[#111111]"
                  >
                    <button
                      type="button"
                      aria-expanded={isOpen}
                      onClick={() => setExpandedIndex(isOpen ? null : idx)}
                      className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-neutral-900/50 transition-colors rounded-lg"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="text-sm font-semibold text-slate-100">
                            {idx + 1}. {med.name}
                          </span>
                          <span className="text-xs text-slate-400">· {med.generic_salt}</span>
                          {med.needs_verification && (
                            <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-red-950/80 text-red-300 border border-red-800/70">
                              Needs manual verification
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs font-mono tabular-nums text-slate-400">
                          {med.dose} · {med.timing} · {med.duration}
                        </p>
                      </div>
                      <ChevronDown
                        className={`h-4 w-4 text-slate-400 shrink-0 transition-transform ${
                          isOpen ? 'rotate-180 text-cyan-400' : ''
                        }`}
                        aria-hidden="true"
                      />
                    </button>

                    {isOpen && (
                      <div className="border-t border-neutral-800 px-6 py-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <p className="text-xs font-medium text-cyan-300">What it is used for</p>
                          <p className="mt-1 text-slate-200 leading-relaxed">{med.used_for}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-cyan-300">Common side effects</p>
                          <p className="mt-1 text-slate-200 leading-relaxed">{med.side_effects}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-cyan-300">Precautions</p>
                          <p className="mt-1 text-slate-200 leading-relaxed">{med.precautions}</p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-cyan-300">
                            Food & drug interactions
                          </p>
                          <p className="mt-1 text-slate-200 leading-relaxed">{med.interactions}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {result.general_notes.length > 0 && (
            <div className="rounded-lg border border-neutral-800 bg-[#111111] p-6 space-y-2">
              <h3 className="text-sm font-semibold text-slate-100">Prescription Notes</h3>
              <ul className="list-disc pl-5 space-y-1 text-sm text-slate-300">
                {result.general_notes.map((note, idx) => (
                  <li key={idx}>{note}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
