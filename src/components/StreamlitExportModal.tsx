import React, { useEffect, useState } from 'react';
import { Check, Copy, Download, X } from 'lucide-react';
import {
  STREAMLIT_CONFIG_TOML,
  STREAMLIT_DEPLOY_STEPS,
  STREAMLIT_GITIGNORE,
  STREAMLIT_REQUIREMENTS_TXT,
} from '../data/samples';

interface BundleFile {
  path: string;
  content: string;
}

interface StreamlitExportModalProps {
  open: boolean;
  onClose: () => void;
}

export function StreamlitExportModal({ open, onClose }: StreamlitExportModalProps) {
  const [files, setFiles] = useState<BundleFile[]>([
    { path: 'requirements.txt', content: STREAMLIT_REQUIREMENTS_TXT },
    { path: '.streamlit/config.toml', content: STREAMLIT_CONFIG_TOML },
    { path: '.gitignore', content: STREAMLIT_GITIGNORE },
  ]);
  const [activePath, setActivePath] = useState<string>('app.py');
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    fetch('/api/streamlit-bundle')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data.files) && data.files.length > 0) {
          setFiles(data.files);
          setActivePath(data.files[0].path);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError('Could not load Streamlit source files from server.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  const activeFile = files.find((f) => f.path === activePath) ?? files[0];

  const handleCopy = async (content: string, path: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 1800);
    } catch {
      setCopiedPath(null);
    }
  };

  const handleDownload = (file: BundleFile) => {
    const blob = new Blob([file.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.path.split('/').pop() || 'file.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Streamlit Deployment Files"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <div className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-lg border border-neutral-800 bg-[#111111] overflow-hidden">
        <div className="flex items-center justify-between gap-4 border-b border-neutral-800 px-6 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-100">
              Streamlit Deployment Package
            </h2>
            <p className="text-xs text-slate-400">
              Ready-to-deploy Python files included in this project workspace.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Streamlit files modal"
            className="rounded-md border border-neutral-800 bg-black p-2 text-slate-300 hover:border-cyan-400 hover:text-cyan-300 transition-colors"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {STREAMLIT_DEPLOY_STEPS.map((item) => (
              <div
                key={item.step}
                className="rounded-lg border border-neutral-800 bg-black p-4 space-y-1.5"
              >
                <p className="text-xs font-mono text-cyan-400">{item.step}.</p>
                <p className="text-xs font-semibold text-slate-100">{item.title}</p>
                <p className="text-xs text-slate-400 leading-relaxed">{item.detail}</p>
              </div>
            ))}
          </div>

          {loadError && (
            <div className="rounded-lg border border-red-900/80 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {loadError}
            </div>
          )}

          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1 rounded-md border border-neutral-800 bg-black p-1">
                {files.map((file) => (
                  <button
                    key={file.path}
                    type="button"
                    onClick={() => setActivePath(file.path)}
                    className={`rounded px-3 py-1.5 text-xs font-mono transition-colors whitespace-nowrap shrink-0 ${
                      activeFile?.path === file.path
                        ? 'bg-cyan-400 text-black font-semibold'
                        : 'text-slate-400 hover:text-slate-100'
                    }`}
                  >
                    {file.path}
                  </button>
                ))}
              </div>

              {activeFile && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleCopy(activeFile.content, activeFile.path)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-black px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedPath === activeFile.path ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                    )}
                    {copiedPath === activeFile.path ? 'Copied' : 'Copy'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDownload(activeFile)}
                    className="inline-flex items-center gap-1.5 rounded-md border border-neutral-800 bg-black px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-cyan-400 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden="true" />
                    Download
                  </button>
                </div>
              )}
            </div>

            {activeFile && (
              <pre className="max-h-96 overflow-auto rounded-lg border border-neutral-800 bg-black p-4 text-xs font-mono text-slate-200 leading-relaxed">
                <code>{activeFile.content}</code>
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
