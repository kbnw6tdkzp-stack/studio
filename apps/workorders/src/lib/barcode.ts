// Loaded only when the scanner opens. The decoder (.wasm) ships with the app, so
// scanning works with no signal.
import { BarcodeDetector, prepareZXingModule } from 'barcode-detector/ponyfill'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

prepareZXingModule({
  overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
})

// Door jamb: Code 39 (sometimes 128). Windshield / registration / paperwork: Data Matrix, QR, PDF417.
export const detector = new BarcodeDetector({ formats: ['code_39', 'code_128', 'data_matrix', 'qr_code', 'pdf417'] })

export async function readCodes(source: ImageBitmapSource): Promise<string[]> {
  const found = await detector.detect(source)
  return found.map((b) => b.rawValue)
}
