import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type {
  PrescriptionAnalysisResult,
  ReportAnalysisResult,
  SuggestionsResult,
} from '../types/clinical';
import {
  buildCombinedSuggestionContext,
  normalizeSuggestionsResult,
} from '../utils/clinicalParsers';

interface SuggestionsTabProps {
  prescriptionResult: PrescriptionAnalysisResult | null;
  reportResult: ReportAnalysisResult | null;
  result: SuggestionsResult | null;
  onResultChange: (result: SuggestionsResult | null) => void;
}

export function SuggestionsTab({
  prescriptionResult,
  reportResult,
  result,
  onResultChange,
}: SuggestionsTabProps) {
  const [extraContext, setExtraContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasSavedRx = Boolean(prescriptionResult && prescriptionResult.medicines.length > 0);
  const hasSavedLab = Boolean(reportResult && reportResult.tests.length > 0);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const combinedContext = buildCombinedSuggestionContext(
      prescriptionResult,
      reportResult,
      extraContext
    );

    if (!combinedContext) {
      setError(
        'Please analyze a prescription or lab report first, or enter medicine/report details below.'
      );
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/analyze/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: combinedContext }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Could not generate suggestions right now.');
      }

      onResultChange(normalizeSuggestionsResult(payload));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to generate medicine discussion points.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleGenerate}
        className="rounded-lg border border-neutral-800 bg-[#111111] p-6 space-y-5"
      >
        <div>
          <h2 className="text-lg font-semibold text-slate-100">Related Medicine Suggestions</h2>
          <p className="mt-1 text-sm text-slate-400">
            Generic alternatives and commonly discussed options based on your prescription or lab
            report. Never start, stop, or change any medicine or dose without a licensed doctor.
          </p>
        </div>

        <div className="rounded-lg border border-neutral-800 bg-black px-4 py-3 text-sm text-slate-300">
          {hasSavedRx || hasSavedLab ? (
            <p>
              Active session context detected:{' '}
              <span className="font-medium text-cyan-300">
                {[
                  hasSavedRx
                    ? `Prescription (${prescriptionResult?.medicines.length} medicines)`
                    : null,
                  hasSavedLab ? `Lab Report (${reportResult?.tests.length} tests)` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            </p>
          ) : (
            <p className="text-slate-400">
              No prescription or lab report analyzed yet. You can analyze one in the other tabs or
              paste medicine names / lab findings below.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <label htmlFor="suggestions-context" className="block text-sm font-medium text-slate-200">
            Additional Context (Optional if already analyzed above)
          </label>
          <textarea
            id="suggestions-context"
            rows={4}
            value={extraContext}
            onChange={(e) => {
              setExtraContext(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Example: Metformin 500mg causing mild stomach upset; Vitamin D is 16 ng/mL"
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
            {loading ? 'Preparing Discussion Points...' : 'Generate Doctor Discussion Points'}
          </button>
          {(extraContext || result) && (
            <button
              type="button"
              onClick={() => {
                setExtraContext('');
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

      {result && (
        <div className="space-y-6" data-testid="suggestions-results">
          <div className="rounded-lg border border-neutral-800 bg-[#111111] p-6">
            <p className="text-sm text-slate-200 leading-relaxed">{result.overview}</p>
          </div>

          {result.suggestions.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-slate-100">
                Options for Discussion With Your Doctor
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {result.suggestions.map((item, idx) => (
                  <div
                    key={`${item.medicine_or_generic}-${idx}`}
                    className="rounded-lg border border-neutral-800 bg-[#111111] p-5 space-y-2.5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-100">
                          {item.medicine_or_generic}
                        </h4>
                        <p className="text-xs text-slate-400">{item.category}</p>
                      </div>
                      <span className="inline-block rounded px-2 py-0.5 text-xs font-medium bg-cyan-950/70 text-cyan-300 border border-cyan-800/70 whitespace-nowrap">
                        {item.label}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed">{item.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.questions_for_doctor.length > 0 && (
            <div className="rounded-lg border border-neutral-800 bg-[#111111] p-6 space-y-2.5">
              <h3 className="text-base font-semibold text-slate-100">
                Questions to Ask Your Doctor
              </h3>
              <ul className="list-disc pl-5 space-y-1.5 text-sm text-slate-300">
                {result.questions_for_doctor.map((q, idx) => (
                  <li key={idx}>{q}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
