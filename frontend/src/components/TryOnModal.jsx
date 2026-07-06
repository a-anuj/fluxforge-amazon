import { useState, useEffect, useRef } from "react";
import { uploadBodyPhoto, getBodyPhotos, getMediaUrl } from "../api/client";
import { useUser } from "../context/UserContext";

// ── Garment category detection (mirrors backend logic) ──────────────────
const LOWER_BODY_KEYWORDS = [
  "pant", "pants", "trouser", "trousers", "jeans", "denim",
  "shorts", "leggings", "skirt", "chinos", "jogger", "joggers",
  "cargo", "capri", "palazzos", "culottes", "sweatpants",
  "trackpants", "bottoms",
];
const FULL_BODY_KEYWORDS = [
  "dress", "jumpsuit", "romper", "dungaree", "dungarees",
  "overalls", "gown", "saree", "kurta", "kurti",
];

function getGarmentType(product) {
  const text = `${product?.name ?? ""} ${product?.category ?? ""} ${product?.description ?? ""}`.toLowerCase();
  if (FULL_BODY_KEYWORDS.some((kw) => text.includes(kw))) return "full";
  if (LOWER_BODY_KEYWORDS.some((kw) => text.includes(kw))) return "lower";
  return "upper";
}

const BASE_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.PROD ? "/api" : `http://${window.location.hostname}:8000/api`);

const LOADING_TIPS = [
  "👗 AI is draping the garment on your photo…",
  "🧵 Stitching pixels together for the perfect fit…",
  "🌿 Virtual try-on reduces returns by up to 30%!",
  "✨ Diffusion models are painting your new look…",
  "♻️ Trying before buying = fewer returns = greener planet!",
  "🎨 Adding final touches to your virtual outfit…",
  "📦 Every avoided return saves ~0.5 kg CO₂",
];

const POLL_INTERVAL_MS = 3000; // poll every 3 seconds
const POLL_TIMEOUT_MS  = 300000; // give up after 5 minutes

/**
 * Start a VTON job on the backend (returns job_id instantly).
 */
async function startTryOnJob(userId, productId, bodyPhotoId, temporaryFile) {
  const form = new FormData();
  form.append("user_id", userId);
  form.append("product_id", productId);
  if (bodyPhotoId) form.append("body_photo_id", bodyPhotoId);
  if (temporaryFile) form.append("file", temporaryFile);

  const res = await fetch(`${BASE_URL}/tryon/generate`, { method: "POST", body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(typeof err.detail === "string" ? err.detail : JSON.stringify(err.detail));
  }
  return res.json(); // { job_id, status }
}

/**
 * Poll GET /tryon/job/{id} until done or error.
 * Returns the result object on success.
 */
async function pollJob(jobId, onTick) {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
    const res = await fetch(`${BASE_URL}/tryon/job/${jobId}`);
    if (!res.ok) throw new Error("Failed to check job status");
    const data = await res.json();
    onTick(data);
    if (data.status === "done") return data.result;
    if (data.status === "error") throw new Error(data.error || "VTON job failed");
  }
  throw new Error("Try-on timed out. The HF Space may be overloaded — please retry.");
}

export default function TryOnModal({ product, onClose }) {
  const { currentUser } = useUser();
  const garmentType = getGarmentType(product);
  const isUnsupported = garmentType === "lower" || garmentType === "full";
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState(null);
  const [error, setError] = useState(null);
  const [tipIdx, setTipIdx] = useState(0);
  const [saveForFuture, setSaveForFuture] = useState(false);
  const [temporaryFile, setTemporaryFile] = useState(null);
  const [temporaryPreview, setTemporaryPreview] = useState(null);
  const fileRef = useRef(null);
  const overlayRef = useRef(null);

  // Load saved body photos
  useEffect(() => {
    if (!currentUser) return;
    getBodyPhotos(currentUser.id)
      .then((data) => {
        setPhotos(data);
        const def = data.find((p) => p.is_default);
        if (def) setSelectedPhoto(def);
        else if (data.length > 0) setSelectedPhoto(data[0]);
      })
      .catch(() => {});
  }, [currentUser]);

  // Rotate loading tips while generating
  useEffect(() => {
    if (!generating) return;
    const iv = setInterval(() => setTipIdx((i) => (i + 1) % LOADING_TIPS.length), 3000);
    return () => clearInterval(iv);
  }, [generating]);

  const handleBackdrop = (e) => { if (e.target === overlayRef.current) onClose(); };
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    if (saveForFuture) {
      setUploading(true);
      setError(null);
      try {
        const res = await uploadBodyPhoto(currentUser.id, file);
        const newPhoto = { id: res.id, image_key: res.image_key, image_url: res.image_url, is_default: res.is_default };
        setPhotos((prev) => [newPhoto, ...prev]);
        setSelectedPhoto(newPhoto);
        setTemporaryFile(null);
        setTemporaryPreview(null);
      } catch (err) {
        setError("Upload failed: " + err.message);
      }
      setUploading(false);
    } else {
      setTemporaryFile(file);
      setTemporaryPreview(URL.createObjectURL(file));
      setSelectedPhoto(null);
    }
  };

  const handleGenerate = async () => {
    if (!currentUser || !product) return;
    if (!selectedPhoto && !temporaryFile) return;

    setGenerating(true);
    setError(null);
    setResultUrl(null);
    setTipIdx(0);
    try {
      // Step 1: kick off job — returns instantly (no Cloudflare timeout)
      const { job_id, status } = await startTryOnJob(
        currentUser.id,
        product.id,
        selectedPhoto?.id,
        temporaryFile,
      );

      // If already done (cache hit), skip polling
      if (status === "done") {
        const jobRes = await fetch(`${BASE_URL}/tryon/job/${job_id}`);
        const jobData = await jobRes.json();
        setResultUrl(jobData.result?.tryon_url);
        return;
      }

      // Step 2: poll until the backend finishes calling HF Space
      const result = await pollJob(job_id, () => {});
      setResultUrl(result?.tryon_url);
    } catch (err) {
      console.error("VTON error:", err);
      setError(err.message || "Try-on generation failed. Please retry.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!resultUrl) return;
    const a = document.createElement("a");
    a.href = resultUrl;
    a.download = `tryon-${product.name.replace(/\s+/g, "-").toLowerCase()}.png`;
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <div
      ref={overlayRef}
      onClick={handleBackdrop}
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgba(0,0,0,0.65)", backdropFilter: "blur(4px)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "16px", animation: "fadeIn 0.2s ease",
      }}
    >
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px) } to { opacity: 1; transform: translateY(0) } }
        @keyframes shimmer { 0% { background-position: -200% 0 } 100% { background-position: 200% 0 } }
        @keyframes pulseGlow { 0%, 100% { box-shadow: 0 0 20px rgba(249,153,0,0.3) } 50% { box-shadow: 0 0 40px rgba(249,153,0,0.6) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>

      <div style={{
        background: "#fff", borderRadius: "16px", width: "100%",
        maxWidth: "820px", maxHeight: "90vh", overflow: "auto",
        boxShadow: "0 25px 60px rgba(0,0,0,0.3)", animation: "slideUp 0.25s ease",
      }}>
        {/* Header */}
        <div style={{
          background: "linear-gradient(135deg, #232f3e, #37475a)",
          padding: "20px 24px", borderRadius: "16px 16px 0 0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <h2 style={{ margin: 0, color: "#fff", fontSize: "18px", fontWeight: 700 }}>✨ Virtual Try-On</h2>
            <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.8)", fontSize: "12px" }}>
              Powered by AI · See how it looks before you buy
            </p>
          </div>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
            width: "32px", height: "32px", borderRadius: "50%", cursor: "pointer",
            fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center",
          }}
            onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.35)")}
            onMouseOut={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
          >✕</button>
        </div>

        <div style={{ padding: "24px" }}>
          {/* Unsupported garment type banner */}
          {isUnsupported && (
            <div style={{
              textAlign: "center", padding: "32px 24px",
              background: "linear-gradient(135deg, #fffbeb, #fef3c7)",
              borderRadius: "12px", border: "1px solid #fcd34d",
              marginBottom: "20px",
            }}>
              <div style={{ fontSize: "48px", marginBottom: "12px" }}>👕</div>
              <h3 style={{ margin: "0 0 8px", fontSize: "16px", fontWeight: 700, color: "#92400e" }}>
                Virtual Try-On — Shirts &amp; Tops Only
              </h3>
              <p style={{ margin: "0 0 6px", fontSize: "13px", color: "#b45309" }}>
                Our AI try-on currently supports <strong>upper body garments</strong> only —
                shirts, t-shirts, jackets, hoodies, and tops.
              </p>
              <p style={{ margin: 0, fontSize: "12px", color: "#78350f" }}>
                Pants, trousers, skirts, and dresses are not supported yet. We're working on it! 🚀
              </p>
              <button
                onClick={onClose}
                style={{
                  marginTop: "20px", padding: "10px 28px",
                  background: "#f59e0b", border: "none", borderRadius: "8px",
                  color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer",
                }}
              >Got it</button>
            </div>
          )}

          {/* Hide the rest of the UI for unsupported garment types */}
          {!isUnsupported && <>
          {/* Step 1 */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "#0f1111", marginBottom: "10px" }}>
              1️⃣ &nbsp;Select or upload your photo
            </p>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              {temporaryFile && (
                <div style={{ width: "72px", height: "72px", borderRadius: "12px", border: "3px solid #f90", overflow: "hidden", flexShrink: 0 }}>
                  <img src={temporaryPreview} alt="Temporary" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              )}
              {photos.map((p) => (
                <div key={p.id} onClick={() => { setSelectedPhoto(p); setTemporaryFile(null); setTemporaryPreview(null); }}
                  style={{
                    width: "72px", height: "72px", borderRadius: "12px",
                    border: selectedPhoto?.id === p.id ? "3px solid #f90" : "2px solid #d5d9d9",
                    overflow: "hidden", cursor: "pointer", flexShrink: 0,
                    transition: "border 0.15s, transform 0.15s",
                    transform: selectedPhoto?.id === p.id ? "scale(1.05)" : "scale(1)",
                  }}>
                  <img src={getMediaUrl(p.image_url)} alt="Body" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                </div>
              ))}
              <div onClick={() => !uploading && fileRef.current?.click()}
                style={{
                  width: "72px", height: "72px", borderRadius: "12px",
                  border: "2px dashed #a7acb2", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", cursor: uploading ? "wait" : "pointer",
                  background: "#fafafa", flexShrink: 0, transition: "border 0.15s, background 0.15s",
                }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = "#f90"; e.currentTarget.style.background = "#fffbf0"; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = "#a7acb2"; e.currentTarget.style.background = "#fafafa"; }}
              >
                {uploading
                  ? <span style={{ fontSize: "20px", animation: "pulseGlow 1.5s infinite" }}>⏳</span>
                  : <><span style={{ fontSize: "20px", lineHeight: 1 }}>📷</span><span style={{ fontSize: "9px", color: "#555", marginTop: "2px" }}>Upload</span></>
                }
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleUpload} />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "6px", marginTop: "12px", fontSize: "13px", color: "#0f1111", cursor: "pointer" }}>
              <input type="checkbox" checked={saveForFuture}
                onChange={async (e) => {
                  const checked = e.target.checked;
                  setSaveForFuture(checked);
                  if (checked && temporaryFile && currentUser) {
                    setUploading(true); setError(null);
                    try {
                      const res = await uploadBodyPhoto(currentUser.id, temporaryFile);
                      const newPhoto = { id: res.id, image_key: res.image_key, image_url: res.image_url, is_default: res.is_default };
                      setPhotos((prev) => [newPhoto, ...prev]);
                      setSelectedPhoto(newPhoto);
                      setTemporaryFile(null); setTemporaryPreview(null);
                    } catch (err) { setError("Upload failed: " + err.message); }
                    setUploading(false);
                  }
                }}
                style={{ cursor: "pointer", accentColor: "#f90" }}
              />
              Save this photo for future uses
            </label>
            {photos.length === 0 && !temporaryFile && !uploading && (
              <p style={{ fontSize: "12px", color: "#565959", marginTop: "8px" }}>Upload a full-body or half-body photo for the best results.</p>
            )}
          </div>

          {/* Step 2 */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "#0f1111", marginBottom: "10px" }}>2️⃣ &nbsp;Garment to try on</p>
            <div style={{ display: "flex", gap: "16px", alignItems: "center", background: "#f7f7f7", borderRadius: "12px", padding: "12px 16px" }}>
              <img src={product.image_url} alt={product.name} style={{ width: "64px", height: "64px", objectFit: "contain", borderRadius: "8px", background: "#fff" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "#0f1111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{product.name}</p>
                <p style={{ fontSize: "12px", color: "#565959", margin: "2px 0 0" }}>{product.brand} · {product.size || "One size"}</p>
              </div>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "#0f1111", margin: 0, flexShrink: 0 }}>₹{Math.floor(product.price).toLocaleString("en-IN")}</p>
            </div>
          </div>

          {/* Generate button */}
          <button onClick={handleGenerate}
            disabled={(!selectedPhoto && !temporaryFile) || generating}
            style={{
              width: "100%", padding: "14px", border: "none", borderRadius: "8px",
              background: (!selectedPhoto && !temporaryFile) ? "#d5d9d9" : generating
                ? "linear-gradient(90deg, #fcd200, #f90, #fcd200)"
                : "linear-gradient(135deg, #fcd200, #f90)",
              backgroundSize: generating ? "200% 100%" : "100% 100%",
              animation: generating ? "shimmer 1.5s linear infinite" : "none",
              color: "#0f1111", fontSize: "15px", fontWeight: 700,
              cursor: (!selectedPhoto && !temporaryFile) || generating ? "not-allowed" : "pointer",
              boxShadow: (!selectedPhoto && !temporaryFile) ? "none" : "0 4px 14px rgba(249,153,0,0.3)",
            }}
            onMouseOver={(e) => { if ((selectedPhoto || temporaryFile) && !generating) e.currentTarget.style.transform = "translateY(-1px)"; }}
            onMouseOut={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {generating ? "⏳ Generating your look…" : (!selectedPhoto && !temporaryFile) ? "Upload a photo first" : "✨ Generate Virtual Try-On"}
          </button>

          {/* Loading */}
          {generating && (
            <div style={{ marginTop: "16px", textAlign: "center", padding: "20px", background: "linear-gradient(135deg, #fffbf0, #ffedd5)", borderRadius: "12px" }}>
              <div style={{ width: "48px", height: "48px", margin: "0 auto 12px", border: "4px solid #fed7aa", borderTop: "4px solid #f90", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <p style={{ fontSize: "14px", color: "#c2410c", fontWeight: 600, margin: 0 }}>{LOADING_TIPS[tipIdx]}</p>
              <p style={{ fontSize: "11px", color: "#f97316", marginTop: "6px" }}>This usually takes 20–60 seconds — feel free to wait!</p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ marginTop: "16px", padding: "12px 16px", borderRadius: "10px", background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", fontSize: "13px" }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Result */}
          {resultUrl && (
            <div style={{ marginTop: "20px" }}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "#0f1111", marginBottom: "12px" }}>3️⃣ &nbsp;Your Virtual Try-On Result</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", background: "#fafafa", borderRadius: "12px", padding: "16px", border: "1px solid #e8e8e8" }}>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "11px", color: "#565959", marginBottom: "8px", fontWeight: 600 }}>YOUR PHOTO</p>
                  <img src={selectedPhoto?.image_url ? getMediaUrl(selectedPhoto.image_url) : temporaryPreview} alt="Your photo"
                    style={{ maxHeight: "320px", maxWidth: "100%", objectFit: "contain", borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)", margin: "0 auto", display: "block" }} />
                </div>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "11px", color: "#c2410c", marginBottom: "8px", fontWeight: 600 }}>✨ TRY-ON RESULT</p>
                  <img src={resultUrl?.startsWith("data:") ? resultUrl : getMediaUrl(resultUrl)} alt="Virtual try-on"
                    style={{ maxHeight: "320px", maxWidth: "100%", objectFit: "contain", borderRadius: "10px", boxShadow: "0 2px 12px rgba(249,153,0,0.2)", border: "2px solid #fed7aa", margin: "0 auto", display: "block" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                <button onClick={handleDownload} style={{ flex: 1, padding: "10px", border: "1px solid #d5d9d9", borderRadius: "10px", background: "#fff", color: "#0f1111", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#f0f0f0")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#fff")}
                >📥 Download Image</button>
                <button onClick={() => { setResultUrl(null); setError(null); }} style={{ flex: 1, padding: "10px", border: "1px solid #c2410c", borderRadius: "10px", background: "#fdf8ec", color: "#c2410c", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}
                  onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                  onMouseOut={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                >🔄 Try Another Photo</button>
              </div>
            </div>
          )}

          {/* Sustainability nudge */}
          <div
            style={{
              marginTop: "20px", padding: "12px 16px", borderRadius: "10px",
              background: "#f0fdf4", border: "1px solid #bbf7d0",
              display: "flex", alignItems: "center", gap: "10px",
            }}
          >
            <span style={{ fontSize: "22px" }}>🌱</span>
            <div>
              <p style={{ fontSize: "12px", fontWeight: 700, color: "#166534", margin: 0 }}>Reduce Returns, Save the Planet</p>
              <p style={{ fontSize: "11px", color: "#15803d", margin: "2px 0 0" }}>Virtual try-on helps you make confident purchases, reducing returns by up to 30% and saving CO₂ emissions.</p>
            </div>
          </div>
          </>}
        </div>
      </div>
    </div>
  );
}
