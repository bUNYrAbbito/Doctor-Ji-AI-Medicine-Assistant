import React, { useId, useRef } from 'react';
import { FileText, Image as ImageIcon, Upload, X } from 'lucide-react';
import type { UploadedDocument } from '../types/clinical';
import { ALLOWED_MIME_TYPES, MAX_FILE_SIZE_BYTES } from '../utils/clinicalParsers';

interface FileDropzoneProps {
  label: string;
  helperText: string;
  file: UploadedDocument | null;
  onFileChange: (file: UploadedDocument | null) => void;
  onError: (message: string | null) => void;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function FileDropzone({
  label,
  helperText,
  file,
  onFileChange,
  onError,
}: FileDropzoneProps) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleSelectedFile = (selected: File | null) => {
    if (!selected) return;

    const mime = selected.type.toLowerCase();
    const isPdfByName = selected.name.toLowerCase().endsWith('.pdf');
    const resolvedMime = mime || (isPdfByName ? 'application/pdf' : '');

    if (!ALLOWED_MIME_TYPES.has(resolvedMime)) {
      onError('Unsupported file type. Please upload a PDF, PNG, JPG, or WEBP file.');
      return;
    }

    if (selected.size === 0) {
      onError('The selected file is empty. Please choose a valid file.');
      return;
    }

    if (selected.size > MAX_FILE_SIZE_BYTES) {
      onError('File exceeds 10 MB. Please upload a smaller image or PDF.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64Data = result.includes(',') ? result.split(',')[1] : result;
      if (!base64Data) {
        onError('Could not read the selected file. Please try another file.');
        return;
      }
      onError(null);
      onFileChange({
        fileName: selected.name,
        mimeType: resolvedMime,
        base64Data,
        sizeBytes: selected.size,
      });
    };
    reader.onerror = () => {
      onError('Failed to read the selected file. Please try again.');
    };
    reader.readAsDataURL(selected);
  };

  const handleClear = () => {
    onFileChange(null);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="block text-sm font-medium text-slate-200">
        {label}
      </label>

      {!file ? (
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const dropped = e.dataTransfer.files?.[0] ?? null;
            handleSelectedFile(dropped);
          }}
          className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg border border-dashed border-neutral-700 bg-black/70 px-4 py-4 transition-colors hover:border-cyan-400/60"
        >
          <div className="flex items-center gap-3 min-w-0">
            <Upload className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm text-slate-200 truncate">
                Drag and drop a PDF or image here, or browse files
              </p>
              <p className="text-xs text-slate-400">{helperText}</p>
            </div>
          </div>

          <label
            htmlFor={inputId}
            className="inline-flex items-center justify-center rounded-md border border-neutral-700 bg-[#111111] px-3.5 py-2 text-xs font-medium text-slate-100 cursor-pointer hover:border-cyan-400 hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0 focus-within:ring-2 focus-within:ring-cyan-400"
          >
            Browse File
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept=".pdf,image/png,image/jpeg,image/webp"
              className="sr-only"
              onChange={(e) => handleSelectedFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-black px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            {file.mimeType === 'application/pdf' ? (
              <FileText className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" />
            ) : (
              <ImageIcon className="h-4 w-4 text-cyan-400 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-100 truncate">{file.fileName}</p>
              <p className="text-xs font-mono tabular-nums text-slate-400">
                {file.mimeType} · {formatFileSize(file.sizeBytes)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            aria-label={`Remove ${file.fileName}`}
            className="inline-flex items-center gap-1 rounded-md border border-neutral-800 px-2.5 py-1.5 text-xs text-slate-300 hover:border-red-500/60 hover:text-red-300 transition-colors whitespace-nowrap shrink-0"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Remove
          </button>
        </div>
      )}
    </div>
  );
}
