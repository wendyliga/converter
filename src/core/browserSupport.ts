const encodeSupport = new Map<string, Promise<boolean>>()

export function canEncode(type: string): Promise<boolean> {
  let cached = encodeSupport.get(type)
  if (!cached) {
    cached = new Promise((resolve) => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      canvas.toBlob((blob) => resolve(blob?.type === type), type)
    })
    encodeSupport.set(type, cached)
  }
  return cached
}
