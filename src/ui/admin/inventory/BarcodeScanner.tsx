// Barcode lookup for the inventory screens. Where the browser can read barcodes (Chrome on Android), the camera scans; everywhere
// else the code is typed. Both paths end in the same lookup, so the drawer opens on the variant the code belongs to.
import { useEffect, useRef, useState } from 'preact/hooks';
import type { InventoryRow } from '@/application/ports/inventory';
import { getJson } from '../lib/api-client';
import { BUTTON, BUTTON_PRIMARY, ERROR_TEXT, FIELD, LABEL, PANEL } from '../lib/classes';
import type { InventoryLabels } from './inventory-view';

/** The part of the browser's BarcodeDetector that the scanner uses. */
interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
}

/** Constructor of BarcodeDetector, which only some browsers provide. */
type DetectorConstructor = new (options: { formats: string[] }) => Detector;

/** Barcode formats of retail products. */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code'];

/** How often the camera frame is read, in milliseconds. */
const SCAN_INTERVAL_MS = 300;

/** Props of the scanner. */
export interface BarcodeScannerProps {
  labels: InventoryLabels;
  /** Called with the variant that the code belongs to. */
  onFound: (row: InventoryRow) => void;
}

/**
 * Scan button (where supported), the camera view while scanning, and a typed-code form that always works.
 * @param props Labels and the found-variant handler.
 */
export function BarcodeScanner(props: BarcodeScannerProps) {
  const { labels } = props;
  const [supported, setSupported] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setSupported('BarcodeDetector' in window);
    return () => stopCamera();
  }, []);

  // Once the video element exists, the camera stream is attached and frames are read until one holds a barcode.
  useEffect(() => {
    const element = video.current;
    const media = stream.current;
    const Detector = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!scanning || !element || !media || !Detector) return;
    element.srcObject = media;
    void element.play();
    const detector = new Detector({ formats: FORMATS });
    let reading = false;
    timer.current = window.setInterval(() => {
      if (reading) return;
      reading = true;
      detector.detect(element).then(
        (codes) => {
          reading = false;
          const first = codes[0];
          if (first) {
            stopCamera();
            void lookup(first.rawValue);
          }
        },
        () => {
          reading = false;
        },
      );
    }, SCAN_INTERVAL_MS);
  }, [scanning]);

  /** Turns the camera off and stops reading frames. */
  function stopCamera() {
    if (timer.current !== null) window.clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    setScanning(false);
  }

  /** Asks for the camera. Without permission the typed-code form stays the way in. */
  async function startCamera() {
    setMessage(null);
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    } catch {
      setMessage(labels.cameraDenied);
      return;
    }
    setScanning(true);
  }

  /**
   * Looks a code up and hands the variant to the parent.
   * @param value Typed or scanned code.
   */
  async function lookup(value: string) {
    const clean = value.trim();
    if (!clean) return;
    setBusy(true);
    setMessage(null);
    const result = await getJson<InventoryRow>(
      `/api/admin/inventory/lookup?code=${encodeURIComponent(clean)}`,
    );
    setBusy(false);
    if (result.ok) {
      setCode('');
      props.onFound(result.data);
      return;
    }
    setMessage(result.code === 'NOT_FOUND' ? labels.notFound : labels.lookupFailed);
  }

  return (
    <div class="flex w-full flex-col gap-3">
      <div class="flex flex-wrap items-end gap-2">
        {supported && !scanning && (
          <button type="button" class={BUTTON} onClick={() => void startCamera()}>
            {labels.scan}
          </button>
        )}
        {scanning && (
          <button type="button" class={BUTTON} onClick={stopCamera}>
            {labels.stopScan}
          </button>
        )}
        <form
          class="flex min-w-0 flex-1 flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void lookup(code);
          }}
        >
          <label class={`${LABEL} min-w-56 flex-1`}>
            {labels.codeLabel}
            <input
              type="text"
              autoComplete="off"
              autoCapitalize="characters"
              class={FIELD}
              value={code}
              onInput={(event) => setCode(event.currentTarget.value)}
            />
          </label>
          <button type="submit" class={BUTTON_PRIMARY} disabled={busy || code.trim() === ''}>
            {labels.find}
          </button>
        </form>
      </div>
      {!supported && <p class="text-text/70 text-xs">{labels.scanUnsupported}</p>}
      {scanning && (
        <div class={PANEL}>
          <video
            ref={video}
            class="rounded-brand aspect-video w-full bg-black object-cover"
            muted
            playsInline
            aria-label={labels.scanHint}
          />
          <p class="text-text/70 text-sm">{labels.scanHint}</p>
        </div>
      )}
      {message && (
        <p class={ERROR_TEXT} role="alert">
          {message}
        </p>
      )}
    </div>
  );
}
