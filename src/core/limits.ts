export const MAX_FILE_BYTES = 50 * 1024 * 1024
export const MAX_BATCH_BYTES = 200 * 1024 * 1024
export const MAX_DIMENSION = 12_000
export const MAX_PIXELS = 100_000_000
export const MAX_BATCH_COUNT = 50
// A JPEG APP1 segment holds 65535 bytes minus its own 2-byte length field and
// the 6-byte "Exif\0\0" signature.
export const MAX_EXIF_BYTES = 65_527
// Metadata always precedes the pixel data, so a bounded prefix is enough to
// find it — never read a whole 50 MB file just to look for tags.
export const EXIF_SCAN_BYTES = 1024 * 1024
