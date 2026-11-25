import io
import json
import os
import re
import time
from typing import Any

import fitz  # PyMuPDF
import pandas as pd
import streamlit as st
from google import genai
from google.genai import types
from PIL import Image, UnidentifiedImageError

MODEL_NAME = "gemini-2.5-flash"
MAX_PDF_PAGES_VISION = 6
MIN_TEXT_PDF_CHARS = 40

st.set_page_config(
    page_title="DOCTOR JI",
    page_icon="🩺",
    layout="wide",
    initial_sidebar_state="collapsed",
)


def get_api_key() -> str | None:
    """Read GEMINI_API_KEY from st.secrets first, then environment variables."""
    try:
        secret_key = st.secrets.get("GEMINI_API_KEY")
        if secret_key and str(secret_key).strip():
            return str(secret_key).strip()
    except Exception:
        pass

    try:
        env_key = os.getenv("GEMINI_API_KEY")
        if env_key and env_key.strip():
            return env_key.strip()
    except Exception:
        pass

    return None


def get_gemini_client(api_key: str) -> genai.Client:
    return genai.Client(api_key=api_key)


def clean_json_text(raw_text: str) -> str:
    text = (raw_text or "").strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return text.strip()


def extract_content_parts(
    uploaded_file: Any,
    pasted_text: str,
) -> tuple[list[Any], str]:
    """
    Build multimodal content parts for Gemini.
    - Text PDFs: extract text directly with PyMuPDF.
    - Scanned PDFs: render pages to PNG bytes and send to Gemini Vision.
    - Images: validate with Pillow and send to Gemini Vision.
    Returns (parts, source_mode_note).
    """
    parts: list[Any] = []
    notes: list[str] = []

    if uploaded_file is not None:
        file_bytes = uploaded_file.getvalue()
        if not file_bytes:
            raise ValueError("The uploaded file is empty. Please choose a valid file.")

        file_name = (uploaded_file.name or "").lower()
        mime_type = (uploaded_file.type or "").lower()

        if mime_type == "application/pdf" or file_name.endswith(".pdf"):
            try:
                doc = fitz.open(stream=file_bytes, filetype="pdf")
            except Exception as exc:
                raise ValueError(
                    "Could not open this PDF file. Please check that it is not corrupted or password-protected."
                ) from exc

            try:
                extracted_pages: list[str] = []
                for page_index, page in enumerate(doc):
                    page_text = (page.get_text("text") or "").strip()
                    if page_text:
                        extracted_pages.append(f"--- Page {page_index + 1} ---\n{page_text}")

                combined_pdf_text = "\n\n".join(extracted_pages).strip()

                if len(combined_pdf_text) >= MIN_TEXT_PDF_CHARS:
                    parts.append(f"Document text extracted from PDF:\n{combined_pdf_text}")
                    notes.append("PDF text extracted directly via PyMuPDF")
                else:
                    page_count = min(len(doc), MAX_PDF_PAGES_VISION)
                    if page_count == 0:
                        raise ValueError("The uploaded PDF has no readable pages.")
                    for page_index in range(page_count):
                        pix = doc[page_index].get_pixmap(dpi=180)
                        png_bytes = pix.tobytes("png")
                        parts.append(
                            types.Part.from_bytes(
                                data=png_bytes,
                                mime_type="image/png",
                            )
                        )
                    notes.append(f"Scanned PDF sent to Gemini Vision ({page_count} page(s))")
            finally:
                doc.close()
        else:
            try:
                image = Image.open(io.BytesIO(file_bytes))
                image.verify()
                image = Image.open(io.BytesIO(file_bytes)).convert("RGB")
            except (UnidentifiedImageError, OSError) as exc:
                raise ValueError(
                    "Unsupported or unreadable image file. Please upload a PNG, JPG, JPEG, or WEBP image."
                ) from exc

            buf = io.BytesIO()
            image.save(buf, format="PNG")
            parts.append(
                types.Part.from_bytes(
                    data=buf.getvalue(),
                    mime_type="image/png",
                )
            )
            notes.append("Image sent to Gemini Vision")

    cleaned_text = (pasted_text or "").strip()
    if cleaned_text:
        parts.append(f"User-provided text:\n{cleaned_text}")
        notes.append("Pasted text included")

    if not parts:
        raise ValueError("Please upload a file (PDF or image) or paste text before analyzing.")

    return parts, " · ".join(notes)


def call_gemini_json(
    client: genai.Client,
    system_instruction: str,
    prompt: str,
    content_parts: list[Any],
) -> dict[str, Any]:
    config = types.GenerateContentConfig(
        system_instruction=system_instruction,
        response_mime_type="application/json",
    )
    models_to_try = [MODEL_NAME, "gemini-4-hydrogen", "gemini-3.1-flash-lite"]
    last_error: Exception | None = None
    response = None

    for idx, model_id in enumerate(models_to_try):
        try:
            response = client.models.generate_content(
                model=model_id,
                contents=[prompt, *content_parts],
                config=config,
            )
            break
        except Exception as exc:
            last_error = exc
            err_str = str(exc).lower()
            if "404" in err_str or "not_found" in err_str or "503" in err_str or "unavailable" in err_str or "high demand" in err_str:
                if idx < len(models_to_try) - 1:
                    time.sleep(0.8)
                    continue
            raise

    if response is None:
        raise last_error or ValueError("Could not reach Gemini API. Please try again.")

    raw_text = response.text or ""
    if not raw_text.strip():
        raise ValueError("Gemini returned an empty response. Please try again.")

    try:
        parsed = json.loads(clean_json_text(raw_text))
    except json.JSONDecodeError as exc:
        raise ValueError("Could not parse structured JSON from AI response. Please try again.") from exc

    if not isinstance(parsed, dict):
        raise ValueError("Unexpected AI response format. Please try again.")

    return parsed


PRESCRIPTION_SYSTEM_PROMPT = """You are DOCTOR JI, an informational health assistant.
Extract medicines from a prescription image, PDF, or text.
CRITICAL SAFETY RULES:
1. NEVER guess illegible handwriting, partial text, or unclear medicine names/doses.
2. If any medicine name, salt, dose, timing, or duration is unclear or illegible, set that field to "Needs manual verification" and set "needs_verification": true.
3. Do NOT diagnose conditions. Do NOT tell the user to start, stop, or change any medicine or dose.
4. Explain each medicine in simple, everyday language.
Return valid JSON matching this exact structure:
{
  "summary": "Short 1-2 sentence overview of the prescription.",
  "medicines": [
    {
      "name": "Brand or written medicine name, or 'Needs manual verification'",
      "generic_salt": "Active generic ingredient/salt, or 'Needs manual verification'",
      "dose": "Strength/dosage (e.g. 500 mg), or 'Needs manual verification'",
      "timing": "Frequency/timing (e.g. Twice daily after meals), or 'Needs manual verification'",
      "duration": "Duration (e.g. 5 days), or 'Needs manual verification'",
      "needs_verification": false,
      "used_for": "Simple plain-language explanation of what it is commonly used for",
      "side_effects": "Common side effects in plain language",
      "precautions": "Key precautions to keep in mind",
      "interactions": "Common food or drug interactions to watch out for"
    }
  ],
  "general_notes": ["Any general prescription notes or legibility warnings"]
}"""

REPORT_SYSTEM_PROMPT = """You are DOCTOR JI, an informational health assistant.
Analyze a medical lab report from a PDF, image, or pasted text.
CRITICAL SAFETY RULES:
1. Extract every measurable lab test with its exact value, normal reference range, and status strictly as one of: "Normal", "High", or "Low".
2. If a value or range is unclear, mark it "Needs manual verification" rather than guessing.
3. Do NOT provide a medical diagnosis. Frame findings as informational highlights to review with a licensed doctor.
4. Provide a short plain-language summary of abnormal values and simple, practical diet and lifestyle tips.
Return valid JSON matching this exact structure:
{
  "tests": [
    {
      "test_name": "Hemoglobin",
      "value": "10.8 g/dL",
      "normal_range": "12.0 - 15.5 g/dL",
      "status": "Low"
    }
  ],
  "abnormal_summary": "Short plain-language summary of abnormal values (or note that all listed values are within normal range).",
  "diet_lifestyle_tips": [
    "Simple practical diet or lifestyle tip 1",
    "Simple practical diet or lifestyle tip 2"
  ]
}"""

SUGGESTIONS_SYSTEM_PROMPT = """You are DOCTOR JI, an informational health assistant.
Based on the provided prescription and/or lab report summary, suggest related/commonly used medicines or generic alternatives purely as discussion points for a doctor visit.
CRITICAL SAFETY RULES:
1. NEVER tell the user to start, stop, replace, or change any medicine or dose.
2. Frame every item strictly as "For discussion with your doctor".
3. Do NOT diagnose.
Return valid JSON matching this exact structure:
{
  "overview": "Brief note explaining how these discussion points relate to the provided prescription or report.",
  "suggestions": [
    {
      "medicine_or_generic": "Generic or commonly discussed medicine name",
      "category": "Generic Alternative or Related Therapy",
      "label": "For discussion with your doctor",
      "reason": "Short plain-language reason why a doctor might consider or discuss this option"
    }
  ],
  "questions_for_doctor": [
    "Helpful question 1 to ask your doctor",
    "Helpful question 2 to ask your doctor"
  ]
}"""


def normalize_status(status: str) -> str:
    value = (status or "").strip().lower()
    if value == "normal":
        return "Normal"
    if value == "high":
        return "High"
    if value == "low":
        return "Low"
    return "Needs manual verification"


def status_badge(status: str) -> str:
    norm = normalize_status(status)
    if norm == "Normal":
        return ":green-badge[Normal]"
    if norm in ("High", "Low"):
        return f":red-badge[{norm}]"
    return ":orange-badge[Needs manual verification]"


def build_suggestion_context() -> str:
    chunks: list[str] = []
    rx = st.session_state.get("rx_result")
    lab = st.session_state.get("lab_result")

    if rx and rx.get("medicines"):
        med_lines = [
            f"- {m.get('name', 'Unknown')} ({m.get('generic_salt', 'Unknown')}), dose: {m.get('dose', 'Unknown')}"
            for m in rx["medicines"]
        ]
        chunks.append("Prescription Medicines:\n" + "\n".join(med_lines))

    if lab and lab.get("tests"):
        test_lines = [
            f"- {t.get('test_name', 'Unknown')}: {t.get('value', 'Unknown')} (Normal: {t.get('normal_range', 'Unknown')}, Status: {t.get('status', 'Unknown')})"
            for t in lab["tests"]
        ]
        chunks.append("Lab Report Results:\n" + "\n".join(test_lines))
        if lab.get("abnormal_summary"):
            chunks.append(f"Lab Summary: {lab['abnormal_summary']}")

    return "\n\n".join(chunks).strip()


# --- Minimal Header ---
st.title("DOCTOR JI")
st.caption("AI Health Assistant · Prescription Analysis, Lab Reports & Doctor Discussion Points")

api_key = get_api_key()
if not api_key:
    st.warning(
        "GEMINI_API_KEY is missing. Add it to Streamlit Community Cloud Secrets (or your local `.streamlit/secrets.toml`) using this exact format:\n\n"
        '```toml\nGEMINI_API_KEY = "your_key"\n```'
    )

tab_rx, tab_report, tab_suggestions = st.tabs(
    [
        "Prescription Analysis",
        "Report Analysis",
        "Related Medicine Suggestions",
    ]
)

# --- TAB 1: PRESCRIPTION ANALYSIS ---
with tab_rx:
    with st.container(border=True):
        st.subheader("Upload Prescription or Paste Text")
        rx_file = st.file_uploader(
            "Upload prescription (Image or PDF)",
            type=["png", "jpg", "jpeg", "webp", "pdf"],
            key="rx_file_uploader",
        )
        rx_text = st.text_area(
            "Or paste prescription text",
            height=130,
            placeholder="Example: Tab Metformin 500mg — 1 tab twice daily after meals for 30 days...",
            key="rx_text_input",
        )
        analyze_rx = st.button(
            "Analyze Prescription",
            type="primary",
            width="stretch",
            disabled=not bool(api_key),
            key="btn_analyze_rx",
        )

    if analyze_rx:
        try:
            parts, source_note = extract_content_parts(rx_file, rx_text)
            client = get_gemini_client(api_key or "")
            with st.spinner("Analyzing prescription with Gemini 2.5 Flash..."):
                result = call_gemini_json(
                    client=client,
                    system_instruction=PRESCRIPTION_SYSTEM_PROMPT,
                    prompt="Extract all medicines from this prescription and explain each clearly.",
                    content_parts=parts,
                )
            st.session_state["rx_result"] = result
            st.session_state["rx_source_note"] = source_note
        except ValueError as err:
            st.error(str(err))
        except Exception as err:
            st.error(f"Could not analyze the prescription right now: {err}")

    rx_result = st.session_state.get("rx_result")
    if rx_result:
        medicines = rx_result.get("medicines") or []
        verify_count = sum(
            1
            for m in medicines
            if m.get("needs_verification")
            or "needs manual verification" in str(m.get("name", "")).lower()
            or "needs manual verification" in str(m.get("dose", "")).lower()
        )

        with st.container(border=True):
            col1, col2 = st.columns(2)
            col1.metric("Medicines Extracted", len(medicines))
            col2.metric("Needs Manual Verification", verify_count)

            if rx_result.get("summary"):
                st.write(rx_result["summary"])
            if st.session_state.get("rx_source_note"):
                st.caption(st.session_state["rx_source_note"])

        if medicines:
            table_rows = []
            for med in medicines:
                table_rows.append(
                    {
                        "Medicine": med.get("name") or "Needs manual verification",
                        "Generic / Salt": med.get("generic_salt") or "Needs manual verification",
                        "Dose": med.get("dose") or "Needs manual verification",
                        "Timing": med.get("timing") or "Needs manual verification",
                        "Duration": med.get("duration") or "Needs manual verification",
                    }
                )
            with st.container(border=True):
                st.subheader("Extracted Schedule")
                st.dataframe(pd.DataFrame(table_rows), width="stretch", hide_index=True)

            st.subheader("Simple Medicine Explanations")
            for idx, med in enumerate(medicines, start=1):
                name = med.get("name") or "Needs manual verification"
                generic = med.get("generic_salt") or "Needs manual verification"
                needs_check = bool(med.get("needs_verification")) or (
                    "needs manual verification" in f"{name} {generic} {med.get('dose', '')}".lower()
                )
                header = f"{idx}. {name} ({generic})"
                with st.expander(header, expanded=(idx == 1)):
                    if needs_check:
                        st.markdown(":orange-badge[Needs manual verification]")
                    else:
                        st.markdown(":green-badge[Extracted clearly]")

                    st.markdown(f"**Dose:** {med.get('dose') or 'Needs manual verification'}")
                    st.markdown(f"**Timing:** {med.get('timing') or 'Needs manual verification'}")
                    st.markdown(f"**Duration:** {med.get('duration') or 'Needs manual verification'}")
                    st.divider()
                    st.markdown(f"**What it is used for:** {med.get('used_for') or 'Not specified'}")
                    st.markdown(f"**Common side effects:** {med.get('side_effects') or 'Not specified'}")
                    st.markdown(f"**Precautions:** {med.get('precautions') or 'Not specified'}")
                    st.markdown(f"**Food / Drug interactions:** {med.get('interactions') or 'Not specified'}")
        else:
            st.info("No medicines were detected in the provided prescription.")

        notes = rx_result.get("general_notes") or []
        if notes:
            with st.container(border=True):
                st.markdown("**Notes**")
                for note in notes:
                    st.write(f"- {note}")

# --- TAB 2: REPORT ANALYSIS ---
with tab_report:
    with st.container(border=True):
        st.subheader("Upload Lab Report or Paste Text")
        lab_file = st.file_uploader(
            "Upload lab report (PDF or Image)",
            type=["pdf", "png", "jpg", "jpeg", "webp"],
            key="lab_file_uploader",
        )
        lab_text = st.text_area(
            "Or paste lab report values",
            height=130,
            placeholder="Example: Hemoglobin: 10.6 g/dL (Ref: 12.0-15.5), HbA1c: 6.9% (Ref: <5.7%)...",
            key="lab_text_input",
        )
        analyze_lab = st.button(
            "Analyze Lab Report",
            type="primary",
            width="stretch",
            disabled=not bool(api_key),
            key="btn_analyze_lab",
        )

    if analyze_lab:
        try:
            parts, source_note = extract_content_parts(lab_file, lab_text)
            client = get_gemini_client(api_key or "")
            with st.spinner("Analyzing lab report with Gemini 2.5 Flash..."):
                result = call_gemini_json(
                    client=client,
                    system_instruction=REPORT_SYSTEM_PROMPT,
                    prompt="Extract all lab tests into the requested JSON table and summarize abnormal results.",
                    content_parts=parts,
                )
            st.session_state["lab_result"] = result
            st.session_state["lab_source_note"] = source_note
        except ValueError as err:
            st.error(str(err))
        except Exception as err:
            st.error(f"Could not analyze the lab report right now: {err}")

    lab_result = st.session_state.get("lab_result")
    if lab_result:
        tests = lab_result.get("tests") or []
        normal_count = sum(1 for t in tests if normalize_status(t.get("status", "")) == "Normal")
        abnormal_count = sum(1 for t in tests if normalize_status(t.get("status", "")) in ("High", "Low"))

        with st.container(border=True):
            c1, c2, c3 = st.columns(3)
            c1.metric("Total Tests", len(tests))
            c2.metric("Normal", normal_count)
            c3.metric("High / Low", abnormal_count)
            if st.session_state.get("lab_source_note"):
                st.caption(st.session_state["lab_source_note"])

        if tests:
            with st.container(border=True):
                st.subheader("Lab Results Table")
                df = pd.DataFrame(
                    [
                        {
                            "Test Name": t.get("test_name") or "Needs manual verification",
                            "Value": t.get("value") or "Needs manual verification",
                            "Normal Range": t.get("normal_range") or "Not listed",
                            "Status": normalize_status(t.get("status", "")),
                        }
                        for t in tests
                    ]
                )
                st.dataframe(df, width="stretch", hide_index=True)

                st.markdown("**Quick Status Highlights**")
                for t in tests:
                    st.markdown(
                        f"{t.get('test_name', 'Test')} ({t.get('value', '—')})  {status_badge(t.get('status', ''))}"
                    )

        with st.container(border=True):
            st.subheader("Plain-Language Summary")
            st.write(lab_result.get("abnormal_summary") or "No abnormal findings summarized.")

            tips = lab_result.get("diet_lifestyle_tips") or []
            if tips:
                st.markdown("**Simple Diet & Lifestyle Tips**")
                for tip in tips:
                    st.write(f"- {tip}")

# --- TAB 3: RELATED MEDICINE SUGGESTIONS ---
with tab_suggestions:
    saved_context = build_suggestion_context()

    with st.container(border=True):
        st.subheader("Related Medicine & Generic Suggestions")
        st.caption(
            "Suggestions are generated strictly for discussion with your doctor. Never start, stop, or change a dose on your own."
        )

        if saved_context:
            st.info("Using your analyzed prescription and/or lab report from this session. You can also add extra notes below.")
        else:
            st.info("Analyze a prescription or lab report first, or paste your medicines / lab findings below.")

        extra_context = st.text_area(
            "Prescription / Lab context (optional if already analyzed above)",
            height=120,
            placeholder="Paste medicine names or abnormal lab findings to get generic alternatives and discussion points...",
            key="suggestions_context_input",
        )

        generate_suggestions = st.button(
            "Generate Doctor Discussion Points",
            type="primary",
            width="stretch",
            disabled=not bool(api_key),
            key="btn_generate_suggestions",
        )

    if generate_suggestions:
        combined_context = "\n\n".join(
            part for part in [saved_context, (extra_context or "").strip()] if part
        ).strip()

        if not combined_context:
            st.error("Please analyze a prescription or lab report first, or enter details in the text box.")
        else:
            try:
                client = get_gemini_client(api_key or "")
                with st.spinner("Preparing discussion points with Gemini 2.5 Flash..."):
                    result = call_gemini_json(
                        client=client,
                        system_instruction=SUGGESTIONS_SYSTEM_PROMPT,
                        prompt="Provide related commonly used medicines or generic alternatives strictly for discussion with a doctor.",
                        content_parts=[combined_context],
                    )
                st.session_state["suggestions_result"] = result
            except ValueError as err:
                st.error(str(err))
            except Exception as err:
                st.error(f"Could not generate suggestions right now: {err}")

    sugg_result = st.session_state.get("suggestions_result")
    if sugg_result:
        if sugg_result.get("overview"):
            with st.container(border=True):
                st.write(sugg_result["overview"])

        suggestions = sugg_result.get("suggestions") or []
        if suggestions:
            for item in suggestions:
                with st.container(border=True):
                    st.markdown(
                        f"**{item.get('medicine_or_generic', 'Option')}**  "
                        f":blue-badge[For discussion with your doctor]"
                    )
                    if item.get("category"):
                        st.caption(item["category"])
                    st.write(item.get("reason") or "")

        questions = sugg_result.get("questions_for_doctor") or []
        if questions:
            with st.container(border=True):
                st.subheader("Questions to Ask Your Doctor")
                for question in questions:
                    st.write(f"- {question}")

# --- Footer Safety Disclaimer ---
st.divider()
st.caption(
    "For information only. Not a medical diagnosis or prescription. Always consult a licensed doctor."
)
st.caption(
    "Privacy note: Uploaded files and pasted text are sent to Google Gemini for analysis. Nothing is stored in a database."
)
