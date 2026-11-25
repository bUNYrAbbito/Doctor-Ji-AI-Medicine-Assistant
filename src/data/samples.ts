export const SAMPLE_PRESCRIPTION_TEXT = `Dr. A. Mehta (General Physician)
Date: 18 Nov 2026
Rx:
1. Tab Glycomet 500mg — 1 tab twice daily after meals x 30 days
2. Cap Pan-D (40mg/30mg) — 1 cap before breakfast daily x 14 days
3. Tab Atorva 10mg — 1 tab at bedtime daily x 30 days
4. Tab [illegible handwritten scribble - possibly Az... 500?] — 1 tab OD x 3 days`;

export const SAMPLE_LAB_REPORT_TEXT = `Complete Blood Count & Metabolic Panel
Hemoglobin: 10.8 g/dL (Normal Range: 12.0 - 15.5 g/dL)
WBC Count: 7,200 /uL (Normal Range: 4,000 - 11,000 /uL)
Platelet Count: 255,000 /uL (Normal Range: 150,000 - 450,000 /uL)
Fasting Blood Glucose: 138 mg/dL (Normal Range: 70 - 99 mg/dL)
HbA1c: 6.9 % (Normal Range: 4.0 - 5.6 %)
LDL Cholesterol: 148 mg/dL (Normal Range: < 100 mg/dL)
HDL Cholesterol: 49 mg/dL (Normal Range: > 40 mg/dL)
Vitamin D (25-OH): 16 ng/mL (Normal Range: 30 - 100 ng/mL)
TSH: 2.4 mIU/L (Normal Range: 0.4 - 4.0 mIU/L)`;

export const STREAMLIT_CONFIG_TOML = `[theme]
base = "dark"
backgroundColor = "#000000"
secondaryBackgroundColor = "#111111"
primaryColor = "#22d3ee"
textColor = "#f1f5f9"`;

export const STREAMLIT_REQUIREMENTS_TXT = `streamlit>=1.50.0
google-genai
pymupdf
pillow
pandas`;

export const STREAMLIT_GITIGNORE = `.env
.env*
!.env.example
.streamlit/secrets.toml
__pycache__/
*.pyc
.venv/
venv/`;

export const STREAMLIT_DEPLOY_STEPS = [
  {
    step: '01',
    title: 'Push files to GitHub',
    detail:
      'Create a GitHub repository containing app.py, requirements.txt, .streamlit/config.toml, and .gitignore (ensuring .env and .streamlit/secrets.toml are excluded).',
  },
  {
    step: '02',
    title: 'Create a New App on Streamlit Community Cloud',
    detail:
      'Sign in at share.streamlit.io, click "Create app", choose your GitHub repository and branch, and set the main file path to app.py.',
  },
  {
    step: '03',
    title: 'Add GEMINI_API_KEY in Secrets',
    detail:
      'Open "Advanced settings" -> "Secrets" (or App Settings -> Secrets after launch) and paste: GEMINI_API_KEY = "your_key".',
  },
  {
    step: '04',
    title: 'Deploy & Share',
    detail:
      'Click "Deploy". Streamlit Community Cloud installs packages from requirements.txt and serves DOCTOR JI with the black theme automatically.',
  },
];
