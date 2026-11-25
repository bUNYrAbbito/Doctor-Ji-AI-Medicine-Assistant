import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODEL_NAME = 'gemini-4-hydrogen';
const FALLBACK_MODEL_NAME = 'gemini-3.1-flash-lite';

function resolvePort(): number {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--port' && args[i + 1]) {
      const parsed = Number(args[i + 1]);
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
    if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isInteger(parsed) && parsed > 0) return parsed;
    }
  }
  if (process.env.NODE_ENV === 'production') {
    const envPort = Number(process.env.PORT);
    if (Number.isInteger(envPort) && envPort > 0) return envPort;
  }
  return 3000;
}

const PORT = resolvePort();
const ALLOWED_MIMES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
]);

interface AnalyzeFilePayload {
  fileName?: string;
  mimeType?: string;
  base64Data?: string;
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add it in Settings > Secrets to enable live Gemini analysis.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildContentParts(
  prompt: string,
  text: string | undefined,
  file: AnalyzeFilePayload | undefined
): { parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }>; sourceNote: string } {
  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    { text: prompt },
  ];
  const notes: string[] = [];

  if (file && file.base64Data && file.mimeType) {
    const normalizedMime = file.mimeType.toLowerCase() === 'image/jpg' ? 'image/jpeg' : file.mimeType.toLowerCase();
    if (!ALLOWED_MIMES.has(normalizedMime)) {
      throw new Error('Unsupported file type. Please upload a PDF, PNG, JPG, or WEBP file.');
    }
    parts.push({
      inlineData: {
        mimeType: normalizedMime,
        data: file.base64Data,
      },
    });
    notes.push(
      normalizedMime === 'application/pdf'
        ? `PDF analyzed (${file.fileName || 'document.pdf'})`
        : `Image analyzed via Gemini Vision (${file.fileName || 'upload'})`
    );
  }

  const trimmedText = typeof text === 'string' ? text.trim() : '';
  if (trimmedText) {
    parts.push({ text: `User-provided text:\n${trimmedText}` });
    notes.push('Pasted text included');
  }

  if (parts.length <= 1) {
    throw new Error('Please upload a PDF/image file or paste text before analyzing.');
  }

  return { parts, sourceNote: notes.join(' · ') };
}

function parseJsonSafely(rawText: string | undefined): Record<string, unknown> {
  const cleaned = (rawText || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  if (!cleaned) {
    throw new Error('Gemini returned an empty response. Please try again.');
  }

  const parsed = JSON.parse(cleaned);
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Unexpected structured response format from Gemini.');
  }
  return parsed as Record<string, unknown>;
}

function formatApiError(error: unknown): { status: number; message: string } {
  let rawMessage = error instanceof Error ? error.message : 'Unexpected server error.';
  try {
    const nested = JSON.parse(rawMessage);
    if (nested?.error?.message && typeof nested.error.message === 'string') {
      rawMessage = nested.error.message;
    }
  } catch {
    // keep rawMessage as-is
  }

  if (
    rawMessage.includes('GEMINI_API_KEY') ||
    rawMessage.includes('API_KEY_INVALID') ||
    rawMessage.includes('PERMISSION_DENIED')
  ) {
    return {
      status: 503,
      message:
        'Gemini API key is missing or invalid. Please check GEMINI_API_KEY in Settings > Secrets.',
    };
  }
  if (rawMessage.includes('RESOURCE_EXHAUSTED') || rawMessage.includes('429')) {
    return {
      status: 429,
      message: 'Gemini API rate limit reached. Please wait a moment and try again.',
    };
  }
  if (
    rawMessage.includes('Unsupported file type') ||
    rawMessage.includes('Please upload') ||
    rawMessage.includes('Please analyze')
  ) {
    return { status: 400, message: rawMessage };
  }
  return { status: 500, message: rawMessage };
}

function isTransientDemandError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.toLowerCase().includes('high demand') ||
    msg.toLowerCase().includes('overloaded')
  );
}

async function generateContentWithRetry(
  ai: GoogleGenAI,
  params: {
    contents: unknown;
    systemInstruction: string;
    responseSchema: Record<string, unknown>;
  }
) {
  const attempts = [
    { model: MODEL_NAME, delayMs: 0 },
    { model: MODEL_NAME, delayMs: 900 },
    { model: FALLBACK_MODEL_NAME, delayMs: 1200 },
  ];

  let lastError: unknown;
  for (const attempt of attempts) {
    if (attempt.delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, attempt.delayMs));
    }
    try {
      return await ai.models.generateContent({
        model: attempt.model,
        contents: params.contents as never,
        config: {
          systemInstruction: params.systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: params.responseSchema as never,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      });
    } catch (err) {
      lastError = err;
      if (!isTransientDemandError(err)) {
        throw err;
      }
    }
  }
  throw lastError;
}

const PRESCRIPTION_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    medicines: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          generic_salt: { type: Type.STRING },
          dose: { type: Type.STRING },
          timing: { type: Type.STRING },
          duration: { type: Type.STRING },
          needs_verification: { type: Type.BOOLEAN },
          used_for: { type: Type.STRING },
          side_effects: { type: Type.STRING },
          precautions: { type: Type.STRING },
          interactions: { type: Type.STRING },
        },
        required: [
          'name',
          'generic_salt',
          'dose',
          'timing',
          'duration',
          'needs_verification',
          'used_for',
          'side_effects',
          'precautions',
          'interactions',
        ],
      },
    },
    general_notes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['summary', 'medicines', 'general_notes'],
};

const REPORT_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    tests: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          test_name: { type: Type.STRING },
          value: { type: Type.STRING },
          normal_range: { type: Type.STRING },
          status: { type: Type.STRING },
        },
        required: ['test_name', 'value', 'normal_range', 'status'],
      },
    },
    abnormal_summary: { type: Type.STRING },
    diet_lifestyle_tips: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['tests', 'abnormal_summary', 'diet_lifestyle_tips'],
};

const SUGGESTIONS_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    overview: { type: Type.STRING },
    suggestions: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          medicine_or_generic: { type: Type.STRING },
          category: { type: Type.STRING },
          label: { type: Type.STRING },
          reason: { type: Type.STRING },
        },
        required: ['medicine_or_generic', 'category', 'label', 'reason'],
      },
    },
    questions_for_doctor: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ['overview', 'suggestions', 'questions_for_doctor'],
};

async function createServer() {
  const app = express();
  app.use(express.json({ limit: '16mb' }));

  app.post('/api/analyze/prescription', async (req, res) => {
    try {
      const { text, file } = req.body as { text?: string; file?: AnalyzeFilePayload };
      const { parts, sourceNote } = buildContentParts(
        'Extract every medicine from this prescription and provide plain-language explanations.',
        text,
        file
      );

      const ai = createGeminiClient();
      const response = await generateContentWithRetry(ai, {
        contents: { parts },
        systemInstruction:
          'You are DOCTOR JI, an informational health assistant. Extract every medicine from the prescription (name, generic_salt, dose, timing, duration) and explain in simple language: used_for, side_effects, precautions, and food/drug interactions. CRITICAL: Never guess illegible handwriting or unclear names/doses—set any unclear field to "Needs manual verification" and needs_verification to true. Never diagnose or instruct the user to start, stop, or change a dose.',
        responseSchema: PRESCRIPTION_SCHEMA,
      });

      const parsed = parseJsonSafely(response.text);
      res.json({ ...parsed, source_note: sourceNote });
    } catch (error) {
      const formatted = formatApiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/analyze/report', async (req, res) => {
    try {
      const { text, file } = req.body as { text?: string; file?: AnalyzeFilePayload };
      const { parts, sourceNote } = buildContentParts(
        'Extract all lab test results into the structured table and summarize abnormal findings with simple diet and lifestyle tips.',
        text,
        file
      );

      const ai = createGeminiClient();
      const response = await generateContentWithRetry(ai, {
        contents: { parts },
        systemInstruction:
          'You are DOCTOR JI, an informational health assistant. Extract every measurable lab test with test_name, value, normal_range, and status strictly as "Normal", "High", or "Low" (or "Needs manual verification" if unreadable—never guess). Provide a concise plain-language abnormal_summary and practical diet_lifestyle_tips. Do not diagnose.',
        responseSchema: REPORT_SCHEMA,
      });

      const parsed = parseJsonSafely(response.text);
      res.json({ ...parsed, source_note: sourceNote });
    } catch (error) {
      const formatted = formatApiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.post('/api/analyze/suggestions', async (req, res) => {
    try {
      const { context } = req.body as { context?: string };
      const trimmed = typeof context === 'string' ? context.trim() : '';
      if (!trimmed) {
        res.status(400).json({
          error:
            'Please analyze a prescription or lab report first, or enter details before generating suggestions.',
        });
        return;
      }

      const ai = createGeminiClient();
      const response = await generateContentWithRetry(ai, {
        contents: `Based on the following prescription and/or lab report context, suggest related commonly used medicines or generic alternatives strictly as discussion points for a doctor visit:\n\n${trimmed}`,
        systemInstruction:
          'You are DOCTOR JI, an informational health assistant. Suggest related commonly used medicines or generic alternatives strictly framed as "For discussion with your doctor" with a concise reason for each. CRITICAL: Never tell the user to start, stop, replace, or change any medicine or dose. Do not diagnose.',
        responseSchema: SUGGESTIONS_SCHEMA,
      });

      const parsed = parseJsonSafely(response.text);
      res.json(parsed);
    } catch (error) {
      const formatted = formatApiError(error);
      res.status(formatted.status).json({ error: formatted.message });
    }
  });

  app.get('/api/streamlit-bundle', async (_req, res) => {
    try {
      const [appPy, requirementsTxt, configToml, gitignore] = await Promise.all([
        fs.readFile(path.join(__dirname, 'app.py'), 'utf-8'),
        fs.readFile(path.join(__dirname, 'requirements.txt'), 'utf-8'),
        fs.readFile(path.join(__dirname, '.streamlit', 'config.toml'), 'utf-8'),
        fs.readFile(path.join(__dirname, '.gitignore'), 'utf-8'),
      ]);

      res.json({
        files: [
          { path: 'app.py', content: appPy },
          { path: 'requirements.txt', content: requirementsTxt },
          { path: '.streamlit/config.toml', content: configToml },
          { path: '.gitignore', content: gitignore },
        ],
      });
    } catch (error) {
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Unable to read Streamlit bundle files.',
      });
    }
  });

  let viteServer: { close: () => Promise<void> } | null = null;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    viteServer = vite;
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  const httpServer = app.listen(PORT, '0.0.0.0', () => {
    console.log(`DOCTOR JI server listening on http://0.0.0.0:${PORT}`);
  });

  const shutdown = async () => {
    httpServer.close();
    if (viteServer) {
      await viteServer.close();
    }
    process.exit(0);
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

createServer().catch((err) => {
  console.error('Failed to start DOCTOR JI server:', err);
  process.exit(1);
});
