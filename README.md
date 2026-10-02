# Study Buddy

Your study material library with a built-in tutor. Runs on your own computer, offline and free.

## Setup

Needs Python 3.10+, `pdftotext` (poppler-utils) and [Ollama](https://ollama.com).

```bash
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
ollama pull qwen3:4b           # the free local tutor model
ollama pull nomic-embed-text   # for search (downloaded automatically if missing)
```

## Start

```bash
./start.sh            # starts Ollama if needed, then opens http://127.0.0.1:8001
```

## What it does

- **Stores your material**: drop in PDF, Word (.docx), PowerPoint (.pptx), Jupyter notebooks, text, Markdown,
  or code files. Originals are kept in `library/<id>/`, and the metadata, search index and chats are in `library.db`.
  Uploading the same file twice is detected and skipped.
- **Sorts it automatically**: the local AI reads each file and gives it a title, a **subject** (it reuses your
  existing subjects so things group together), a **type** (Notes, Slides, Lab / Practical, Question paper, …)
  and its main **topics**. You can fix any of these with "Change subject / type".
- **Summarizes**: long files are read in parts, then combined into an Overview, Key concepts, Definitions &
  formulas and Focus for exams.
- **Finds things by meaning**: every file is split into passages that remember their page or slide, and each
  passage gets an embedding from a small free local model (`nomic-embed-text`). Search (sidebar, press Enter, or
  the dashboard search box) and the tutor use hybrid search: meaning plus exact keywords.
- **Cites its sources**: tutor answers mark what they used with [1], [2]… and list the files and pages under the
  answer. Click one to read the passage in context, or open the PDF at that page.
- **Says when it doesn't know**: if nothing in your material is about the question, the tutor starts with
  "I couldn't find this in your uploaded material." and labels any general explanation "(beyond your notes)".
- **Organizes by unit**: when a file says which unit/chapter or semester it is, that's picked up too, and each
  subject is shown as Subject → Unit → type. You can change all of it with "Edit details".
- **Dashboard**: questions asked, study streak, days studied, and "continue where you left off".
- **Teaches you**: every material, every subject, and the whole library has its own tutor chat. The tutor
  searches your files for the relevant passages and teaches from them. Use the buttons to start a lesson from
  the beginning, move to the next topic, get quizzed, ask for a simpler explanation, or get an exam revision
  sheet. You can also click any topic chip to be taught that topic. Chats are saved.

## Notes

- The AI model is `qwen3:4b` (free, faster) or `qwen3:8b` (free, smarter, slower), both local through Ollama.
  **Claude (Opus 5.5)** is optional: pick it at the bottom of the sidebar and add an Anthropic API key. It is
  much faster and better than the local models, but the API is paid per use. The key is kept only in
  `settings.json` on your computer (never committed). Search stays local either way.
- Ollama handles one request at a time. If viral-clipper is using it, Study Buddy waits its turn.
  Background summarizing pauses while you chat with the tutor, so replies come first.
- Scanned PDFs (images with no text layer) can't be read yet. Run OCR on them first.
- Only listens on 127.0.0.1, so nobody else on your network can open it.
