const MAX_RECEIPT_IMAGE_SIZE = 20 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 1800
const PDF_PAGE_WIDTH = 595.28
const PDF_PAGE_HEIGHT = 841.89
const PDF_MARGIN = 24

interface DecodedReceiptImage {
  width: number
  height: number
  drawTo(context: CanvasRenderingContext2D, width: number, height: number): void
  close(): void
}

async function decodeReceiptImage(file: File): Promise<DecodedReceiptImage> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file)
      return {
        width: bitmap.width,
        height: bitmap.height,
        drawTo: (context, width, height) =>
          context.drawImage(bitmap, 0, 0, width, height),
        close: () => bitmap.close(),
      }
    } catch {
      // Fall back to the browser image element for formats such as HEIC.
    }
  }

  const url = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () =>
        reject(new Error('Не удалось открыть фотографию квитанции.'))
      element.src = url
    })

    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      drawTo: (context, width, height) =>
        context.drawImage(image, 0, 0, width, height),
      close: () => URL.revokeObjectURL(url),
    }
  } catch (error) {
    URL.revokeObjectURL(url)
    throw error
  }
}

function encodeText(value: string): Uint8Array {
  return new TextEncoder().encode(value)
}

function concatenateBytes(chunks: Uint8Array[]): Uint8Array {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(totalLength)
  let offset = 0

  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }

  return result
}

function buildPdf(jpegBytes: Uint8Array, imageWidth: number, imageHeight: number): Blob {
  const scale = Math.min(
    (PDF_PAGE_WIDTH - PDF_MARGIN * 2) / imageWidth,
    (PDF_PAGE_HEIGHT - PDF_MARGIN * 2) / imageHeight,
  )
  const drawWidth = imageWidth * scale
  const drawHeight = imageHeight * scale
  const drawX = (PDF_PAGE_WIDTH - drawWidth) / 2
  const drawY = (PDF_PAGE_HEIGHT - drawHeight) / 2

  const contentStream = encodeText(
    `q\n${drawWidth.toFixed(2)} 0 0 ${drawHeight.toFixed(2)} ${drawX.toFixed(2)} ${drawY.toFixed(2)} cm\n/Receipt Do\nQ\n`,
  )

  const objectChunks = [
    encodeText('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n'),
    encodeText('2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n'),
    encodeText(
      `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PDF_PAGE_WIDTH} ${PDF_PAGE_HEIGHT}] /Resources << /XObject << /Receipt 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    ),
    concatenateBytes([
      encodeText(
        `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n`,
      ),
      jpegBytes,
      encodeText('\nendstream\nendobj\n'),
    ]),
    concatenateBytes([
      encodeText(
        `5 0 obj\n<< /Length ${contentStream.length} >>\nstream\n`,
      ),
      contentStream,
      encodeText('endstream\nendobj\n'),
    ]),
  ]

  const chunks = [encodeText('%PDF-1.4\n')]
  const offsets = [0]
  let byteOffset = chunks[0].length

  for (const objectChunk of objectChunks) {
    offsets.push(byteOffset)
    chunks.push(objectChunk)
    byteOffset += objectChunk.length
  }

  const xrefOffset = byteOffset
  const crossReference = [
    'xref',
    `0 ${offsets.length}`,
    '0000000000 65535 f ',
    ...offsets.slice(1).map(
      (offset) => `${String(offset).padStart(10, '0')} 00000 n `,
    ),
    'trailer',
    `<< /Size ${offsets.length} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n')
  chunks.push(encodeText(crossReference))

  const pdfBytes = concatenateBytes(chunks)
  const pdfBuffer = new ArrayBuffer(pdfBytes.length)
  new Uint8Array(pdfBuffer).set(pdfBytes)
  return new Blob([pdfBuffer], { type: 'application/pdf' })
}

export async function convertReceiptImageToPdf(file: File): Promise<Blob> {
  const hasImageExtension =
    /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name)
  if (!file.type.startsWith('image/') && !hasImageExtension) {
    throw new Error('Выберите файл изображения.')
  }
  if (file.size > MAX_RECEIPT_IMAGE_SIZE) {
    throw new Error('Размер фотографии квитанции не должен превышать 20 МБ.')
  }

  const image = await decodeReceiptImage(file)
  try {
    const scale = Math.min(
      1,
      MAX_IMAGE_DIMENSION / Math.max(image.width, image.height),
    )
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.width * scale))
    canvas.height = Math.max(1, Math.round(image.height * scale))

    const context = canvas.getContext('2d')
    if (!context) {
      throw new Error('Не удалось обработать фотографию квитанции.')
    }
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    image.drawTo(context, canvas.width, canvas.height)

    const jpeg = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob)
          } else {
            reject(new Error('Не удалось преобразовать фотографию в PDF.'))
          }
        },
        'image/jpeg',
        0.82,
      )
    })

    return buildPdf(
      new Uint8Array(await jpeg.arrayBuffer()),
      canvas.width,
      canvas.height,
    )
  } finally {
    image.close()
  }
}
