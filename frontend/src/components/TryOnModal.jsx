import { useState, useEffect, useRef } from "react";
import { uploadBodyPhoto, getBodyPhotos, generateTryOn, getMediaUrl } from "../api/client";
import { useUser } from "../context/UserContext";

const LOADING_TIPS = [
  "👗 AI is draping the garment on your photo…",
  "🧵 Stitching pixels together for the perfect fit…",
  "🌿 Virtual try-on reduces returns by up to 30%!",
  "✨ Diffusion models are painting your new look…",
  "♻️ Trying before buying = fewer returns = greener planet!",
  "🎨 Adding final touches to your virtual outfit…",
  "📦 Every avoided return saves ~0.5 kg CO₂",
];

export default function TryOnModal({ product, onClose }) {
  const { currentUser } = useUser();
  const [photos, setPhotos] = useState([]);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [resultUrl, setResultUrl] = useState(null);
  const [error, setError] = useState(null);
  const [tipIdx, setTipIdx] = useState(0);
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

  // Rotate loading tips
  useEffect(() => {
    if (!generating) return;
    const iv = setInterval(() => {
      setTipIdx((i) => (i + 1) % LOADING_TIPS.length);
    }, 3000);
    return () => clearInterval(iv);
  }, [generating]);

  // Close on backdrop click
  const handleBackdrop = (e) => {
    if (e.target === overlayRef.current) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentUser) return;
    setUploading(true);
    setError(null);
    try {
      const res = await uploadBodyPhoto(currentUser.id, file);
      const newPhoto = {
        id: res.id,
        image_key: res.image_key,
        image_url: res.image_url,
        is_default: res.is_default,
      };
      setPhotos((prev) => [newPhoto, ...prev]);
      setSelectedPhoto(newPhoto);
    } catch (err) {
      setError("Upload failed: " + err.message);
    }
    setUploading(false);
  };

  const handleGenerate = async () => {
    if (!currentUser || !selectedPhoto || !product) return;
    setGenerating(true);
    setError(null);
    setResultUrl(null);
    setTipIdx(0);
    try {
      const res = await generateTryOn(
        currentUser.id,
        product.id,
        selectedPhoto.id
      );
      setResultUrl(res.tryon_url);
    } catch (err) {
      setError(err.message || "Try-on generation failed");
    }
    setGenerating(false);
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
        @keyframes shimmer {
          0% { background-position: -200% 0 }
          100% { background-position: 200% 0 }
        }
        @keyframes pulseGlow {
          0%, 100% { box-shadow: 0 0 20px rgba(99,102,241,0.3) }
          50% { box-shadow: 0 0 40px rgba(99,102,241,0.6) }
        }
      `}</style>

      <div
        style={{
          background: "#fff", borderRadius: "16px", width: "100%",
          maxWidth: "820px", maxHeight: "90vh", overflow: "auto",
          boxShadow: "0 25px 60px rgba(0,0,0,0.3)",
          animation: "slideUp 0.25s ease",
        }}
      >
        {/* Header */}
        <div
          style={{
            background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
            padding: "20px 24px", borderRadius: "16px 16px 0 0",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}
        >
          <div>
            <h2 style={{ margin: 0, color: "#fff", fontSize: "18px", fontWeight: 700 }}>
              ✨ Virtual Try-On
            </h2>
            <p style={{ margin: "4px 0 0", color: "rgba(255,255,255,0.8)", fontSize: "12px" }}>
              Powered by AI · See how it looks before you buy
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "rgba(255,255,255,0.2)", border: "none", color: "#fff",
              width: "32px", height: "32px", borderRadius: "50%", cursor: "pointer",
              fontSize: "18px", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.2s",
            }}
            onMouseOver={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.35)")}
            onMouseOut={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.2)")}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          {/* Step 1 — Select / upload body photo */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "#0f1111", marginBottom: "10px" }}>
              1️⃣ &nbsp;Select or upload your photo
            </p>

            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              {photos.map((p) => (
                <div
                  key={p.id}
                  onClick={() => setSelectedPhoto(p)}
                  style={{
                    width: "72px", height: "72px", borderRadius: "12px",
                    border: selectedPhoto?.id === p.id ? "3px solid #4f46e5" : "2px solid #d5d9d9",
                    overflow: "hidden", cursor: "pointer", flexShrink: 0,
                    transition: "border 0.15s, transform 0.15s",
                    transform: selectedPhoto?.id === p.id ? "scale(1.05)" : "scale(1)",
                  }}
                >
                  <img
                    src={getMediaUrl(p.image_url)}
                    alt="Body photo"
                    style={{ width: "100%", height: "100%", objectFit: "cover" }}
                  />
                </div>
              ))}

              {/* Upload button */}
              <div
                onClick={() => !uploading && fileRef.current?.click()}
                style={{
                  width: "72px", height: "72px", borderRadius: "12px",
                  border: "2px dashed #a7acb2", display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", cursor: uploading ? "wait" : "pointer",
                  transition: "border 0.15s, background 0.15s", flexShrink: 0,
                  background: "#fafafa",
                }}
                onMouseOver={(e) => { e.currentTarget.style.borderColor = "#4f46e5"; e.currentTarget.style.background = "#f0f0ff"; }}
                onMouseOut={(e) => { e.currentTarget.style.borderColor = "#a7acb2"; e.currentTarget.style.background = "#fafafa"; }}
              >
                {uploading ? (
                  <span style={{ fontSize: "20px", animation: "pulseGlow 1.5s infinite" }}>⏳</span>
                ) : (
                  <>
                    <span style={{ fontSize: "20px", lineHeight: 1 }}>📷</span>
                    <span style={{ fontSize: "9px", color: "#555", marginTop: "2px" }}>Upload</span>
                  </>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleUpload}
              />
            </div>

            {photos.length === 0 && !uploading && (
              <p style={{ fontSize: "12px", color: "#565959", marginTop: "8px" }}>
                Upload a full-body or half-body photo for the best results.
              </p>
            )}
          </div>

          {/* Step 2 — Product preview + Generate */}
          <div style={{ marginBottom: "20px" }}>
            <p style={{ fontSize: "13px", fontWeight: 700, color: "#0f1111", marginBottom: "10px" }}>
              2️⃣ &nbsp;Garment to try on
            </p>
            <div
              style={{
                display: "flex", gap: "16px", alignItems: "center",
                background: "#f7f7f7", borderRadius: "12px", padding: "12px 16px",
              }}
            >
              <img
                src={product.image_url}
                alt={product.name}
                style={{ width: "64px", height: "64px", objectFit: "contain", borderRadius: "8px", background: "#fff" }}
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: "13px", fontWeight: 600, color: "#0f1111", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {product.name}
                </p>
                <p style={{ fontSize: "12px", color: "#565959", margin: "2px 0 0" }}>
                  {product.brand} · {product.size || "One size"}
                </p>
              </div>
              <p style={{ fontSize: "16px", fontWeight: 700, color: "#0f1111", margin: 0, flexShrink: 0 }}>
                ₹{Math.floor(product.price).toLocaleString("en-IN")}
              </p>
            </div>
          </div>

          {/* Generate Button */}
          <button
            onClick={handleGenerate}
            disabled={!selectedPhoto || generating}
            style={{
              width: "100%", padding: "14px", border: "none", borderRadius: "12px",
              background: !selectedPhoto
                ? "#d5d9d9"
                : generating
                ? "linear-gradient(90deg, #818cf8, #6366f1, #818cf8)"
                : "linear-gradient(135deg, #4f46e5, #7c3aed)",
              backgroundSize: generating ? "200% 100%" : "100% 100%",
              animation: generating ? "shimmer 1.5s linear infinite" : "none",
              color: "#fff", fontSize: "15px", fontWeight: 700,
              cursor: !selectedPhoto || generating ? "not-allowed" : "pointer",
              transition: "transform 0.15s, box-shadow 0.15s",
              boxShadow: !selectedPhoto ? "none" : "0 4px 14px rgba(79,70,229,0.4)",
            }}
            onMouseOver={(e) => {
              if (selectedPhoto && !generating) e.currentTarget.style.transform = "translateY(-1px)";
            }}
            onMouseOut={(e) => { e.currentTarget.style.transform = "translateY(0)"; }}
          >
            {generating
              ? "⏳ Generating your look…"
              : !selectedPhoto
              ? "Upload a photo first"
              : "✨ Generate Virtual Try-On"}
          </button>

          {/* Loading Tips */}
          {generating && (
            <div
              style={{
                marginTop: "16px", textAlign: "center", padding: "20px",
                background: "linear-gradient(135deg, #ede9fe, #e0e7ff)", borderRadius: "12px",
              }}
            >
              <div style={{
                width: "48px", height: "48px", margin: "0 auto 12px",
                border: "4px solid #c7d2fe", borderTop: "4px solid #4f46e5",
                borderRadius: "50%", animation: "spin 0.8s linear infinite",
              }} />
              <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
              <p style={{ fontSize: "14px", color: "#4338ca", fontWeight: 600, margin: 0 }}>
                {LOADING_TIPS[tipIdx]}
              </p>
              <p style={{ fontSize: "11px", color: "#6366f1", marginTop: "6px" }}>
                This usually takes 10–20 seconds
              </p>
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                marginTop: "16px", padding: "12px 16px", borderRadius: "10px",
                background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b",
                fontSize: "13px",
              }}
            >
              <strong>Error:</strong> {error}
            </div>
          )}

          {/* Result */}
          {resultUrl && (
            <div style={{ marginTop: "20px" }}>
              <p style={{ fontSize: "13px", fontWeight: 700, color: "#0f1111", marginBottom: "12px" }}>
                3️⃣ &nbsp;Your Virtual Try-On Result
              </p>
              <div
                style={{
                  display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px",
                  background: "#fafafa", borderRadius: "12px", padding: "16px",
                  border: "1px solid #e8e8e8",
                }}
              >
                {/* Original body */}
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "11px", color: "#565959", marginBottom: "8px", fontWeight: 600 }}>YOUR PHOTO</p>
                  <img
                    src={selectedPhoto?.image_url ? getMediaUrl(selectedPhoto.image_url) : ""}
                    alt="Your photo"
                    style={{
                      maxHeight: "320px", maxWidth: "100%", objectFit: "contain",
                      borderRadius: "10px", boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
                    }}
                  />
                </div>

                {/* Try-on result */}
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: "11px", color: "#4f46e5", marginBottom: "8px", fontWeight: 600 }}>✨ TRY-ON RESULT</p>
                  <img
                    src={getMediaUrl(resultUrl)}
                    alt="Virtual try-on"
                    style={{
                      maxHeight: "320px", maxWidth: "100%", objectFit: "contain",
                      borderRadius: "10px", boxShadow: "0 2px 12px rgba(79,70,229,0.2)",
                      border: "2px solid #c7d2fe",
                    }}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "10px", marginTop: "14px" }}>
                <button
                  onClick={handleDownload}
                  style={{
                    flex: 1, padding: "10px", border: "1px solid #d5d9d9", borderRadius: "10px",
                    background: "#fff", color: "#0f1111", fontSize: "13px", fontWeight: 600,
                    cursor: "pointer", transition: "background 0.15s",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.background = "#f0f0f0")}
                  onMouseOut={(e) => (e.currentTarget.style.background = "#fff")}
                >
                  📥 Download Image
                </button>
                <button
                  onClick={() => { setResultUrl(null); setError(null); }}
                  style={{
                    flex: 1, padding: "10px", border: "none", borderRadius: "10px",
                    background: "linear-gradient(135deg, #4f46e5, #7c3aed)",
                    color: "#fff", fontSize: "13px", fontWeight: 600,
                    cursor: "pointer", transition: "transform 0.15s",
                  }}
                  onMouseOver={(e) => (e.currentTarget.style.transform = "translateY(-1px)")}
                  onMouseOut={(e) => (e.currentTarget.style.transform = "translateY(0)")}
                >
                  🔄 Try Another Photo
                </button>
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
              <p style={{ fontSize: "12px", fontWeight: 700, color: "#166534", margin: 0 }}>
                Reduce Returns, Save the Planet
              </p>
              <p style={{ fontSize: "11px", color: "#15803d", margin: "2px 0 0" }}>
                Virtual try-on helps you make confident purchases, reducing returns by up to 30% and saving CO₂ emissions.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
