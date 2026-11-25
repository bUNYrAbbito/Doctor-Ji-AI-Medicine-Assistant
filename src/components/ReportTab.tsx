import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { FileDropzone } from './FileDropzone';
import { SAMPLE_LAB_REPORT_TEXT } from '../data/samples';
import type { LabStatus, ReportAnalysisResult, UploadedDocument } from '../types/clinical';
import {
  computeLabMetrics,
  normalizeReportResult,
  validateInputPayload,
} from '../utils/clinicalParsers';

interface ReportTabProps {
  result: ReportAnalysisResult | null;
  onResultChange: (result: ReportAnalysisResult | null) => void;
}

function getStatusClasses(status: LabStatus): string {
  if (status === 'Normal') {
    return 'bg-emerald-950/80 text-emerald-300 border border-emerald-800/70';
  }
  if (status === 'High' || status === 'Low') {
    return 'bg-red-950/80 text-red-300 border border-red-800/70';
  }
  return 'bg-amber-950/80 text-amber-300 border border-amber-800/70';
}

export function ReportTab({ result, onResultChange }: ReportTabProps) {
  const [file, setFile] = useState<UploadedDocument | null>(null);
  const [text, setText] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'abnormal' | 'normal'>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const response = await fetch('/api/analyze/report', {
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
        throw new Error(payload?.error || 'Could not analyze the lab report.');
      }

      onResultChange(normalizeReportResult(payload));
      setStatusFilter('all');
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to complete lab report analysis right now.'
      );
    } finally {
      setLoading(false);
    }
  };

  const metrics = result ? computeLabMetrics(result) : null;
  const visibleTests = result
    ? result.tests.filter((t) => {
        if (statusFilter === 'normal') return t.status === 'Normal';
        if (statusFilter === 'abnormal') return t.status === 'High' || t.status === 'Low';
        return true;
      })
    : [];

  return (
    <div className="space-y-6">
      <form
        onSubmit={handleAnalyze}
        className="rounded-lg border border-neutral-800 bg-[#111111] p-6 space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-100">Report Analysis</h2>
            <p className="text-sm text-slate-400">
              Upload a lab report PDF or image, or paste your test results for a structured table
              and plain-language summary.
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              setText(SAMPLE_LAB_REPORT_TEXT);
              setError(null);
            }}
            className="self-start sm:self-auto rounded-md border border-neutral-700 bg-black px-3 py-1.5 text-xs font-medium text-slate-300 hover:border-cyan-400 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
          >
            Load Sample Lab Report
          </button>
        </div>

        <FileDropzone
          label="Lab Report File (PDF or Image)"
          helperText="PDF, PNG, JPG, or WEBP up to 10 MB"
          file={file}
          onFileChange={setFile}
          onError={setError}
        />

        <div className="space-y-2">
          <label htmlFor="report-text" className="block text-sm font-medium text-slate-200">
            Or Paste Lab Report Values
          </label>
          <textarea
            id="report-text"
            rows={5}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Example: Hemoglobin: 10.8 g/dL (Ref: 12.0 - 15.5 g/dL), HbA1c: 6.9% (Ref: < 5.7%)"
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
            {loading ? 'Analyzing Report...' : 'Analyze Lab Report'}
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
        <div className="space-y-6" data-testid="report-results">
          <div className="rounded-lg border border-neutral-800 bg-[#111111] p-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <p className="text-xs text-slate-400">Total Tests</p>
                <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-slate-100">
                  {metrics.total}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Normal</p>
                <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-emerald-400">
                  {metrics.normal}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-400">High / Low</p>
                <p className="mt-1 text-2xl font-semibold font-mono tabular-nums text-red-400">
                  {metrics.abnormal}
                </p>
              </div>
            </div>
            {result.source_note && (
              <p className="mt-3 text-xs text-slate-400">{result.source_note}</p>
            )}
          </div>

          <div className="rounded-lg border border-neutral-800 bg-[#111111] overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-b border-neutral-800">
              <h3 className="text-base font-semibold text-slate-100">Lab Results Table</h3>
              <div className="flex items-center gap-1 rounded-md border border-neutral-800 bg-black p-1">
                {(['all', 'abnormal', 'normal'] as const).map((key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setStatusFilter(key)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      statusFilter === key
                        ? 'bg-cyan-400 text-black'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {key === 'all'
                      ? `All (${metrics.total})`
                      : key === 'abnormal'
                        ? `High / Low (${metrics.abnormal})`
                        : `Normal (${metrics.normal})`}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 bg-black/50 text-xs font-medium text-slate-400">
                    <th className="px-6 py-3">Test Name</th>
                    <th className="px-4 py-3 text-right">Value</th>
                    <th className="px-4 py-3 text-right">Normal Range</th>
                    <th className="px-6 py-3 text-right">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/80 text-sm">
                  {visibleTests.map((row, idx) => (
                    <tr key={`${row.test_name}-${idx}`} className="hover:bg-neutral-900/60">
                      <td className="px-6 py-3.5 font-medium text-slate-100">{row.test_name}</td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-100">
                        {row.value}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono tabular-nums text-slate-400">
                        {row.normal_range}
                      </td>
                      <td className="px-6 py-3.5 text-right whitespace-nowrap">
                        <span
                          className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${getStatusClasses(row.status)}`}
                        >
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {visibleTests.length === 0 && (
                    <tr>
                      <td colSpan={4} className="px-6 py-6 text-center text-sm text-slate-400">
                        No lab tests match this filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-[#111111] p-6 space-y-5">
            <div>
              <h3 className="text-base font-semibold text-slate-100">Plain-Language Summary</h3>
              <p className="mt-2 text-sm text-slate-200 leading-relaxed">
                {result.abnormal_summary}
              </p>
            </div>

            {result.diet_lifestyle_tips.length > 0 && (
              <div className="border-t border-neutral-800 pt-4">
                <h4 className="text-sm font-semibold text-cyan-300">
                  Simple Diet & Lifestyle Tips
                </h4>
                <ul className="mt-2 list-disc pl-5 space-y-1.5 text-sm text-slate-300">
                  {result.diet_lifestyle_tips.map((tip, idx) => (
                    <li key={idx}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
