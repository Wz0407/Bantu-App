import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { DocumentExtraction, DocumentSummary } from "@mybantu/shared-types";
import {
  ApiError,
  deleteDocument,
  getDocumentPages,
  listDocuments,
  reprocessDocument,
  uploadDocument,
} from "../../api/client";

const MAX_UPLOAD_MB = 20;
const SUPPORTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".txt"];

const STATUS_LABELS: Record<DocumentSummary["status"], string> = {
  uploaded: "Uploaded",
  processing: "Processing…",
  ready: "Ready",
  failed: "Processing failed",
};

type Banner = { kind: "error" | "info"; message: string } | null;

/** Local document upload and management (UC-02). Files never leave this device. */
export function DocumentsScreen() {
  const [documents, setDocuments] = useState<DocumentSummary[] | null>(null);
  const [banner, setBanner] = useState<Banner>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<DocumentSummary | null>(null);
  const [pages, setPages] = useState<DocumentExtraction | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fileInputId = useId();

  const refresh = useCallback(async () => {
    try {
      setDocuments(await listDocuments());
    } catch {
      setDocuments(null);
      setBanner({
        kind: "error",
        message: "Cannot reach the local MyBantu API. Make sure the local services are running.",
      });
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    const file = fileInputRef.current?.files?.[0];
    setBanner(null);
    if (!file) {
      setBanner({ kind: "error", message: "Choose a file to upload." });
      return;
    }
    const extension = file.name.slice(file.name.lastIndexOf(".")).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.includes(extension)) {
      setBanner({
        kind: "error",
        message: `Unsupported file type. Supported: ${SUPPORTED_EXTENSIONS.join(", ")}`,
      });
      return;
    }
    if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
      setBanner({ kind: "error", message: `The file is larger than ${MAX_UPLOAD_MB} MB.` });
      return;
    }
    setUploading(true);
    try {
      const uploaded = await uploadDocument(file, null);
      setBanner(
        uploaded.status === "failed"
          ? { kind: "error", message: uploaded.errorMessage ?? "Processing failed. You can retry." }
          : { kind: "info", message: `“${uploaded.fileName}” processed on this device.` },
      );
      if (fileInputRef.current) fileInputRef.current.value = "";
      await refresh();
    } catch (error) {
      setBanner({
        kind: "error",
        message: error instanceof ApiError ? error.error.message : "Upload failed. You can retry.",
      });
    } finally {
      setUploading(false);
    }
  };

  const openDetail = async (document: DocumentSummary) => {
    setSelected(document);
    setConfirmingDelete(false);
    setPages(null);
    if (document.status === "ready") {
      try {
        setPages(await getDocumentPages(document.documentId));
      } catch {
        setPages(null);
      }
    }
  };

  const onRetry = async (document: DocumentSummary) => {
    setBanner(null);
    try {
      const updated = await reprocessDocument(document.documentId);
      await refresh();
      await openDetail(updated);
    } catch (error) {
      setBanner({
        kind: "error",
        message: error instanceof ApiError ? error.error.message : "Retry failed.",
      });
    }
  };

  const onDelete = async (document: DocumentSummary) => {
    setBanner(null);
    try {
      await deleteDocument(document.documentId);
      setSelected(null);
      setPages(null);
      setConfirmingDelete(false);
      setBanner({
        kind: "info",
        message: "The document and everything derived from it were deleted from this device.",
      });
      await refresh();
    } catch (error) {
      setBanner({
        kind: "error",
        message: error instanceof ApiError ? error.error.message : "Delete failed. You can retry.",
      });
    }
  };

  return (
    <section aria-labelledby="documents-heading">
      <h2 id="documents-heading">Documents</h2>
      <p>
        Documents are stored and processed only on this device. Nothing is uploaded to the internet.
      </p>

      <form onSubmit={(e) => void onUpload(e)}>
        <label htmlFor={fileInputId}>
          Upload a document (PDF, PNG, JPG or TXT, up to {MAX_UPLOAD_MB} MB)
        </label>
        <input
          id={fileInputId}
          ref={fileInputRef}
          type="file"
          accept={SUPPORTED_EXTENSIONS.join(",")}
        />
        <button type="submit" disabled={uploading}>
          {uploading ? "Uploading…" : "Upload"}
        </button>
      </form>
      {uploading && <p role="status">Uploading and processing on this device…</p>}

      {banner && (
        <p role={banner.kind === "error" ? "alert" : "status"} className={`banner-${banner.kind}`}>
          {banner.message}
        </p>
      )}

      <h3>Your documents</h3>
      {documents === null && <p>Document list is unavailable.</p>}
      {documents?.length === 0 && <p>No documents yet.</p>}
      {documents && documents.length > 0 && (
        <ul className="document-list">
          {documents.map((doc) => (
            <li key={doc.documentId}>
              <button type="button" onClick={() => void openDetail(doc)}>
                {doc.fileName}
              </button>{" "}
              <span className={`status status-${doc.status}`}>{STATUS_LABELS[doc.status]}</span>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <article aria-labelledby="document-detail-heading" className="document-detail">
          <h3 id="document-detail-heading">{selected.fileName}</h3>
          <dl>
            <dt>Status</dt>
            <dd>{STATUS_LABELS[selected.status]}</dd>
            <dt>Detected language</dt>
            <dd>{selected.detectedLanguage ?? "—"}</dd>
            <dt>Pages</dt>
            <dd>{selected.pageCount ?? "—"}</dd>
            <dt>Size</dt>
            <dd>{Math.max(1, Math.round(selected.sizeBytes / 1024))} KB</dd>
          </dl>

          {selected.warnings.length > 0 && (
            <ul className="warnings">
              {selected.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}

          {selected.status === "failed" && (
            <div role="alert">
              <p>{selected.errorMessage ?? "Processing failed."}</p>
              <button type="button" onClick={() => void onRetry(selected)}>
                Retry processing
              </button>
            </div>
          )}

          {pages && (
            <details>
              <summary>
                Extracted text ({pages.pageCount} page{pages.pageCount === 1 ? "" : "s"})
              </summary>
              {pages.pages.map((page) => (
                <section key={page.pageNumber} aria-label={`Page ${page.pageNumber}`}>
                  <h4>Page {page.pageNumber}</h4>
                  <pre className="page-text">{page.text || "(no text on this page)"}</pre>
                </section>
              ))}
            </details>
          )}

          {!confirmingDelete && (
            <button type="button" onClick={() => setConfirmingDelete(true)}>
              Delete document
            </button>
          )}
          {confirmingDelete && (
            <div role="alertdialog" aria-labelledby="delete-confirm-heading">
              <p id="delete-confirm-heading">
                Delete “{selected.fileName}” and all data derived from it from this device? This
                cannot be undone.
              </p>
              <button type="button" onClick={() => void onDelete(selected)}>
                Yes, delete everything
              </button>
              <button type="button" onClick={() => setConfirmingDelete(false)}>
                Cancel
              </button>
            </div>
          )}
        </article>
      )}
    </section>
  );
}
