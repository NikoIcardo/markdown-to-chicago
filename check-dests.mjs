import { readFile } from 'node:fs/promises'

const file = process.argv[2] || 'debug-output.pdf'
const data = await readFile(file)
const buffer = Buffer.from(data)

const destIndex = buffer.indexOf('(bib-1)')
console.log('Index of (bib-1):', destIndex)
if (destIndex !== -1) {
  console.log(buffer.slice(destIndex - 80, destIndex + 80).toString('latin1'))
}

const results = []
let idx = buffer.indexOf('/Dests')
while (idx !== -1) {
  results.push(buffer.slice(idx, idx + 200).toString('latin1'))
  idx = buffer.indexOf('/Dests', idx + 1)
}
console.log('dest entries', results.length)
results.forEach((entry, i) => {
  console.log(`Entry ${i}:`, entry.replace(/\n/g, ' '))
})
