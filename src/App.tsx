import React, { useState } from 'react';
import { PrescriptionTab } from './components/PrescriptionTab';
import { ReportTab } from './components/ReportTab';
import { SuggestionsTab } from './components/SuggestionsTab';
import type {
  AnalysisTab,
  PrescriptionAnalysisResult,
  ReportAnalysisResult,
  SuggestionsResult,
} from './types/clinical';

const TABS: Array<{ id: AnalysisTab; label: string }> = [
  { id: 'prescription', label: 'Prescription Analysis' },
  { id: 'report', label: 'Report Analysis' },
  { id: 'suggestions', label: 'Related Medicine Suggestions' },
];

export default function App() {
  const [activeTab, setActiveTab] = useState<AnalysisTab>('prescription');
  const [prescriptionResult, setPrescriptionResult] =
    useState<PrescriptionAnalysisResult | null>(null);
  const [reportResult, setReportResult] = useState<ReportAnalysisResult | null>(null);
  const [suggestionsResult, setSuggestionsResult] = useState<SuggestionsResult | null>(null);

  return (
    <div className="min-h-screen bg-black text-slate-100 flex flex-col">
      <header className="border-b border-neutral-800 bg-black">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-8 px-4 sm:px-6 py-4">
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              setActiveTab('prescription');
            }}
            className="text-xl font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0"
          >
            DOCTOR JI
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 sm:px-6 py-8 space-y-6">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-100 text-balance">
            AI Health Assistant
          </h1>
          <p className="text-sm text-slate-400">
            Analyze prescriptions, interpret lab reports, and prepare medicine discussion points for
            your doctor.
          </p>
        </div>

        <nav aria-label="DOCTOR JI tools" className="border-b border-neutral-800">
          <div role="tablist" className="flex items-center gap-1 overflow-x-auto">
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  id={`tab-${tab.id}`}
                  role="tab"
                  type="button"
                  aria-selected={isActive}
                  aria-controls={`panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap shrink-0 border-b-2 -mb-px ${
                    isActive
                      ? 'border-cyan-400 text-cyan-300'
                      : 'border-transparent text-slate-400 hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </nav>

        <section
          id={`panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`tab-${activeTab}`}
        >
          {activeTab === 'prescription' && (
            <PrescriptionTab
              result={prescriptionResult}
              onResultChange={setPrescriptionResult}
            />
          )}
          {activeTab === 'report' && (
            <ReportTab result={reportResult} onResultChange={setReportResult} />
          )}
          {activeTab === 'suggestions' && (
            <SuggestionsTab
              prescriptionResult={prescriptionResult}
              reportResult={reportResult}
              result={suggestionsResult}
              onResultChange={setSuggestionsResult}
            />
          )}
        </section>
      </main>

      <footer className="border-t border-neutral-800 bg-black mt-10">
        <div className="mx-auto w-full max-w-5xl px-4 sm:px-6 py-5 space-y-1.5 text-xs text-slate-400">
          <p className="text-slate-300 font-medium">
            For information only. Not a medical diagnosis or prescription. Always consult a licensed
            doctor.
          </p>
          <p>
            Uploaded files and pasted text are sent to Google Gemini for analysis. No data is saved
            in a database.
          </p>
        </div>
      </footer>
    </div>
  );
}
