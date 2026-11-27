"use client";
import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** A QR code for a URL, rendered locally (no network). */
export function Qr({ url, size = 240, label }: { url: string; size?: number; label: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(url, { margin: 1, width: size * 2, errorCorrectionLevel: "M" }).then(setSrc, () => setSrc(null));
  }, [url, size]);
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} width={size} height={size} alt={label} style={{ imageRendering: "pixelated" }} /> : null;
}
