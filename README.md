# DOCTOR JI — AI Health Assistant

A minimal, dark-themed AI health assistant built with **Streamlit** (`app.py`) and **Google Gemini** (`google-genai`). No database, no login, and three focused tools.

## Features (3 Tabs)

1. **Prescription Analysis**
   - Upload a prescription image (`PNG`, `JPG`, `WEBP`), upload a PDF, or paste prescription text.
   - Extracts each medicine: name, generic/salt, dose, timing, and duration.
   - Explains uses, common side effects, precautions, and food/drug interactions in simple language.
   - Never guesses illegible handwriting—marks unclear entries as **Needs manual verification**.

2. **Report Analysis**
   - Upload a lab report (PDF or image) or paste test values.
   - Displays a structured table: **Test Name**, **Value**, **Normal Range**, and **Status** (`Normal` / `High` / `Low`).
   - Provides a short plain-language summary of abnormal values and simple diet/lifestyle tips.

3. **Related Medicine Suggestions**
   - Uses the analyzed prescription and/or lab report (or pasted notes) to suggest related medicines or generic alternatives strictly **For discussion with your doctor**, with a short reason for each.
   - Never advises starting, stopping, or changing any medicine or dose.

## Tech Stack

- **Streamlit** (`>=1.50.0`) with black theme (`.streamlit/config.toml`)
- **Google Gemini** (`google-genai`) — free-tier fast model (`gemini-4-hydrogen` / `gemini-3.1-flash-lite` fallback; `app.py` tries `gemini-2.5-flash` and automatically falls back to `gemini-4-hydrogen` / `gemini-3.1-flash-lite` if needed)
- **PyMuPDF (`pymupdf`)** for direct text extraction from text PDFs and page rendering for scanned PDFs
- **Pillow (`pillow`)** and **Pandas (`pandas`)**

## Run Locally (Streamlit)

1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Set your Gemini API key (either as an environment variable or in `.streamlit/secrets.toml`):
   ```toml
   GEMINI_API_KEY = "your_key"
   ```
3. Launch the app:
   ```bash
   streamlit run app.py
   ```

## Deploy on Streamlit Community Cloud

1. Push `app.py`, `requirements.txt`, `.streamlit/config.toml`, and `.gitignore` to a GitHub repository (`.env` and `.streamlit/secrets.toml` are excluded by `.gitignore`).
2. Go to [share.streamlit.io](https://share.streamlit.io) and click **Create app**.
3. Select your repository, branch, and set the main file path to `app.py`.
4. Open **Advanced settings → Secrets** and paste:
   ```toml
   GEMINI_API_KEY = "your_key"
   ```
5. Click **Deploy**.

## Safety & Privacy

- **Disclaimer:** For information only. Not a medical diagnosis or prescription. Always consult a licensed doctor.
- **Data handling:** Uploaded files and pasted text are sent to Google Gemini for analysis. Nothing is stored in a database.
