# MyBantu MVP Scope

## 1. MVP objective

Build a working local application that proves this core value:

> A Malaysian user can translate English, Bahasa Melayu, and Chinese text, upload an everyday document, receive a simple explanation, extract important amounts/dates/actions, and ask document questions with page citations — without requiring a cloud service.

The MVP must be useful, testable, and small enough to complete before adding live meeting features or a full technician management system.

---

## 2. Target users

### Primary

- Malaysian users who receive documents in an unfamiliar language.
- Older users who need simpler explanations and larger controls.
- Small-business or field technicians who need to search technical manuals.

### Secondary

- Family members helping parents understand letters or bills.
- Students reading school notices.
- Small businesses reviewing quotations or service documents.

---

## 3. Core MVP use cases

## UC-01: Offline trilingual text translation

The user enters text and translates between:

- English;
- Bahasa Melayu;
- Chinese.

All six directions are supported.

### Acceptance criteria

- The app accepts UTF-8 input.
- Source language can be selected or auto-detected.
- The translated result is shown next to the original.
- The response shows detected language and model version.
- Translation works after internet access is disabled.
- Empty and oversized input are rejected clearly.
- Translation failures do not crash the application.

---

## UC-02: Upload and process a document

Supported MVP input:

- text-based PDF;
- PNG;
- JPG/JPEG;
- plain text.

### Acceptance criteria

- The application validates extension, MIME type, signature, and size.
- The original file is stored locally.
- Text-based PDFs preserve page numbers.
- Images use local OCR.
- The user sees processing status.
- Failed processing shows a specific error and retry option.
- The app does not upload the document to a cloud service.

### MVP limits

Define configurable limits, for example:

- maximum file size;
- maximum page count;
- maximum OCR image dimensions;
- maximum documents indexed at one time.

Do not hard-code product limits in UI components.

---

## UC-03: Simple document explanation

For a successfully processed document, the user can request:

- document purpose;
- simple summary;
- important amounts;
- important dates/deadlines;
- required actions;
- warnings or unclear items;
- explanation in English, Bahasa Melayu, or Chinese.

### Required structured output

```json
{
  "documentPurpose": "Payment reminder",
  "summary": "The sender requests payment before the stated deadline.",
  "amounts": [
    {
      "value": "426.50",
      "currency": "MYR",
      "label": "Amount due",
      "pageNumber": 1,
      "sourceText": "Amount due: RM426.50"
    }
  ],
  "dates": [
    {
      "value": "2026-08-18",
      "label": "Payment deadline",
      "pageNumber": 1,
      "sourceText": "Please pay before 18 August 2026"
    }
  ],
  "requiredActions": [
    {
      "action": "Make payment or contact the sender before the deadline.",
      "pageNumber": 1,
      "sourceText": "..."
    }
  ],
  "warnings": [],
  "outputLanguage": "en"
}
```

### Acceptance criteria

- Extracted items include source page and supporting text.
- Missing values are returned as empty arrays, not invented.
- The UI clearly distinguishes source facts from AI explanation.
- Users can open the cited page/source excerpt.
- The output can be regenerated in another supported language.

---

## UC-04: Ask questions about a document

The user asks a question after the document is indexed.

### Acceptance criteria

- Retrieval is limited to the selected document.
- The answer uses retrieved evidence only.
- The answer returns one or more citations when supported.
- Each citation includes page number when available.
- The UI displays the source excerpt.
- Unsupported questions return `insufficientEvidence = true`.
- The system does not silently answer from model memory.
- The answer is available in `en`, `ms`, or `zh`.

---

## UC-05: Elder Mode

The user toggles Elder Mode.

### Acceptance criteria

- Large readable typography.
- Minimum touch-target size suitable for touch screens.
- Reduced number of actions per screen.
- High-contrast visual treatment.
- Plain-language labels.
- Important amount, deadline, and action are visually prioritised.
- A “read aloud” control may use installed system speech support.
- Failure of text-to-speech does not block the rest of the app.
- All core tasks are keyboard accessible.

---

## UC-06: Technician Lite

The technician can:

1. upload a technical manual;
2. ask a question about it;
3. receive page citations;
4. fill a basic service-report form;
5. generate the report in another supported language.

### Service-report fields

- report number;
- service date;
- customer name or reference;
- equipment type;
- brand/model, optional;
- customer-reported issue;
- inspection finding;
- action taken;
- parts replaced, optional;
- safety note, optional;
- next recommended action, optional;
- technician name;
- customer acknowledgement, optional.

### Acceptance criteria

- Manual answers follow the same grounded-answer policy.
- Report generation never invents inspection findings or replaced parts.
- Missing fields remain absent or are clearly marked.
- Original and translated report versions are stored locally.
- The report can be viewed in a print-friendly layout.

---

## 4. MVP screens

```text
/
├── Home
├── Translate
├── Documents
│   ├── Upload
│   ├── Document Detail
│   ├── Analysis
│   └── Ask Document
├── Technician
│   ├── Manuals
│   └── Service Report
└── Settings
    ├── Language
    ├── Elder Mode
    ├── Model Status
    └── Privacy / Delete Data
```

---

## 5. MVP functional requirements

### FR-01 Language support

Use ISO-like internal codes:

- `en`
- `ms`
- `zh`
- `auto` only for source detection.

Do not use display labels as database identifiers.

### FR-02 Offline readiness

The product must expose a status indicating:

- frontend shell available;
- translation model available;
- embedding model available;
- local LLM available;
- OCR language data available.

### FR-03 Local persistence

Persist:

- app settings;
- document metadata;
- original documents;
- extracted/indexed data;
- translation history, configurable;
- service reports.

### FR-04 Data deletion

The user can delete a document and all derived artifacts.

### FR-05 Citations

Every document-derived amount, date, action, and Q&A answer must retain a source reference when available.

### FR-06 Model abstraction

Translation, OCR, embeddings, and LLM implementations must be replaceable through adapters.

### FR-07 Error codes

Use stable error codes such as:

```text
MODEL_NOT_INSTALLED
MODEL_LOAD_FAILED
UNSUPPORTED_LANGUAGE
UNSUPPORTED_FILE_TYPE
FILE_TOO_LARGE
DOCUMENT_PARSE_FAILED
OCR_FAILED
INDEX_BUILD_FAILED
INSUFFICIENT_EVIDENCE
NATIVE_ENGINE_UNAVAILABLE
```

---

## 6. Non-functional requirements

## NFR-01 Privacy

- No cloud transmission by default.
- No document-content analytics.
- No full document text in normal logs.
- Local deletion must remove derived data.

## NFR-02 Accessibility

- Semantic HTML.
- Keyboard navigation.
- Visible focus states.
- Labels associated with inputs.
- Sufficient contrast.
- Elder Mode must not be the only accessible mode.

## NFR-03 Performance

Measure, do not guess:

- translation latency;
- document extraction time;
- OCR time;
- index-build time;
- question-answer latency;
- peak memory;
- model size.

Store benchmark results under `docs/evaluation`.

## NFR-04 Reliability

- Application startup must report missing dependencies.
- A failed AI component must return a controlled error.
- Database migrations must be versioned.
- Index and metadata state must not silently diverge.
- Retrying ingestion must be idempotent.

## NFR-05 Maintainability

- Strict TypeScript.
- Nullable reference types enabled in C#.
- C++ warnings treated seriously.
- Shared contracts versioned.
- Business rules tested outside controllers/components.
- No model-provider code inside UI components.

---

## 7. MVP quality gates

The MVP is not complete until all gates pass.

### Gate A: Translation

- Six translation directions execute locally.
- Language routing is tested.
- UTF-8 Chinese input/output works.
- Failure behavior is tested.
- Benchmark report exists.

### Gate B: Document processing

- Text PDF retains page numbers.
- Image OCR works for at least one fixture per supported language.
- Duplicate file detection is tested.
- Invalid-file handling is tested.

### Gate C: RAG

- Supported test questions return correct source pages.
- Unsupported test questions are refused.
- Citation excerpts match indexed source text.
- Prompt-injection test documents do not change system rules.

### Gate D: Elder Mode

- Core journey works with large text and keyboard navigation.
- Important details are clearly prioritised.
- Accessibility test checklist is completed.

### Gate E: Technician Lite

- Manual question returns citation.
- Service report saves successfully.
- Translation does not add facts.
- Print-friendly report renders correctly.

### Gate F: Privacy

- No internet request is required during the offline test.
- Deleting a document removes original and derived files.
- Logs do not contain full document content.

---

## 8. Test dataset

Create small, legal, synthetic fixtures:

```text
data/samples/
├── letters/
│   ├── payment-reminder-en.pdf
│   ├── school-notice-ms.pdf
│   └── simple-letter-zh.pdf
├── bills/
│   └── synthetic-utility-bill.pdf
├── manuals/
│   └── synthetic-air-conditioner-manual.pdf
├── images/
│   ├── notice-en.png
│   ├── notice-ms.png
│   └── notice-zh.png
└── adversarial/
    ├── prompt-injection-document.pdf
    └── unsupported-question-document.pdf
```

Do not commit private customer, school, government-account, or family documents.

---

## 9. Evaluation plan

## Translation evaluation

For each language direction:

- prepare representative everyday sentences;
- include dates, amounts, addresses, and technical terms;
- obtain human ratings for adequacy and fluency;
- record glossary errors;
- compare latency and memory.

## Retrieval evaluation

Create a question set with:

- expected document;
- expected page;
- expected source phrase;
- answerability label.

Metrics:

- retrieval hit rate at K;
- correct page rate;
- citation correctness;
- refusal correctness.

## Document extraction evaluation

Measure:

- page-order preservation;
- amount accuracy;
- date accuracy;
- action-item accuracy;
- OCR character/word error where ground truth exists.

## Usability evaluation

Observe whether users can:

- translate text;
- upload a document;
- find the amount and deadline;
- open a citation;
- switch to Elder Mode;
- delete their data.

---

## 10. Explicitly out of scope

The coding agent must not add these to MVP without a documented scope decision:

- real-time meeting/classroom captions;
- speaker diarisation;
- full technician CRM;
- stock/inventory management;
- invoicing/payment;
- appointment scheduling;
- customer route optimisation;
- cloud accounts or cloud sync;
- social login;
- multi-tenant organisations;
- autonomous agents;
- web browsing;
- automatic form submission;
- legal/tax/medical decision-making;
- model fine-tuning;
- custom model training;
- mobile-native iOS/Android apps;
- blockchain;
- Kubernetes;
- microservices beyond the defined local components.

---

## 11. Implementation order

Complete phases in this order.

### Phase 0 — Foundations

- repository skeleton;
- shared contracts;
- local configuration;
- health checks;
- CI checks;
- sample fixtures.

### Phase 1 — TriLingua translation

- C++ library boundary;
- local model adapter;
- .NET P/Invoke adapter;
- translation API;
- React translation screen;
- tests and benchmarks.

### Phase 2 — Document ingestion

- local upload;
- secure storage;
- PDF text extraction;
- OCR adapter;
- page-aware chunks;
- status handling.

### Phase 3 — RAG and analysis

- embeddings;
- local index;
- retrieval;
- grounded answer schema;
- citations;
- amount/date/action extraction;
- insufficient-evidence behavior.

### Phase 4 — Elder Mode

- accessible layout;
- simple explanation mode;
- source-fact emphasis;
- optional system TTS.

### Phase 5 — Technician Lite

- manual library;
- manual Q&A;
- service-report form;
- translated report;
- print layout.

### Phase 6 — Packaging and evaluation

- local launcher;
- model-status screen;
- offline acceptance run;
- performance report;
- privacy/delete-data verification.

Do not start a later phase while critical quality gates from the current phase are failing.

---

## 12. MVP definition of done

The MVP is done when a reviewer can disconnect the machine from the internet and successfully:

1. start MyBantu;
2. translate text between all three languages;
3. upload a synthetic PDF or image;
4. see a simple explanation with amount/date/action evidence;
5. ask a document question and open its citation;
6. ask an unsupported question and receive an honest refusal;
7. use Elder Mode;
8. query a synthetic technical manual;
9. create and translate a basic service report;
10. delete the document and verify its local artifacts are gone.
