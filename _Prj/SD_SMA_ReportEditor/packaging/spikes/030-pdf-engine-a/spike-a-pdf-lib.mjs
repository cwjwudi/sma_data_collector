/**
 * Spike-A: generate a multi-page PDF with pdf-lib only (no Electron printToPDF).
 * Mimics "N parts" by writing several files in sequence with a short pause.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, 'out')
const PARTS = Number(process.env.SPIKE_PARTS || 4)
const ROWS = Number(process.env.SPIKE_ROWS || 40)

function cpuRough() {
  const u = process.cpuUsage()
  return { userUs: u.user, systemUs: u.system }
}

async function buildOnePart(partIndex, totalParts) {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const page = doc.addPage([595.28, 841.89]) // A4
  const { height } = page.getSize()
  let y = height - 48

  page.drawText(`Spike-A pdf-lib part ${partIndex + 1}/${totalParts}`, {
    x: 48,
    y,
    size: 14,
    font,
    color: rgb(0.1, 0.1, 0.1),
  })
  y -= 28
  page.drawText('No Chromium printToPDF — vector only.', {
    x: 48,
    y,
    size: 10,
    font,
    color: rgb(0.3, 0.3, 0.3),
  })
  y -= 24

  for (let i = 0; i < ROWS; i++) {
    if (y < 48) {
      const p = doc.addPage([595.28, 841.89])
      y = p.getSize().height - 48
      p.drawText(`row ${i + 1}: sample production value ${(i * 1.23).toFixed(2)}`, {
        x: 48,
        y,
        size: 9,
        font,
      })
      y -= 14
      continue
    }
    page.drawText(`row ${i + 1}: sample production value ${(i * 1.23).toFixed(2)}`, {
      x: 48,
      y,
      size: 9,
      font,
    })
    y -= 14
  }

  return doc.save()
}

async function main() {
  await mkdir(outDir, { recursive: true })
  const t0 = Date.now()
  const cpu0 = cpuRough()
  console.log(`[spike-a] parts=${PARTS} rows/part≈${ROWS} out=${outDir}`)

  for (let i = 0; i < PARTS; i++) {
    const tPart = Date.now()
    const bytes = await buildOnePart(i, PARTS)
    const name = `spike-a-part-${i + 1}-of-${PARTS}.pdf`
    await writeFile(path.join(outDir, name), bytes)
    console.log(
      `[spike-a] wrote ${name} (${bytes.length} bytes) in ${Date.now() - tPart}ms`,
    )
    // mimic inter-part yield (report editor uses ~80ms; keep small)
    await new Promise((r) => setTimeout(r, 80))
  }

  const cpu1 = cpuRough()
  console.log(
    `[spike-a] done in ${Date.now() - t0}ms; cpuUsage delta user=${cpu1.userUs - cpu0.userUs}us system=${cpu1.systemUs - cpu0.systemUs}us`,
  )
  console.log(
    '[spike-a] NEXT: keep mappView/Chromium open and interactive while re-running this script; record flicker yes/no in Plan 0.3.114.',
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
