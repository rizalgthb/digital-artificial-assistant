import express from 'express'
import cors from 'cors'
import multer from 'multer'
import dotenv from 'dotenv'
import { Pinecone } from '@pinecone-database/pinecone'
import OpenAI from 'openai'
import fs from 'fs'
import path from 'path'

dotenv.config()
const app = express()
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '2mb' }))

// Storage for uploaded files
const upload = multer({ dest: 'uploads/' })

// Setup clients (will be configured in Week 2)
let openai, pc, index
try {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'dummy' })
  pc = new Pinecone({ apiKey: process.env.PINECONE_API_KEY || 'dummy' })
  index = pc.index(process.env.PINECONE_INDEX || 'brand-assistant')
} catch (e) {
  console.log('Clients not fully configured yet (will work in Week 2)')
}

// Simple memory per session
const sessions = new Map()

app.get('/health', (req,res)=> res.json({ ok:true }))

// Utility: text splitter
function chunkText(text, chunkSize=1200, overlap=200) {
  const chunks = []
  let i = 0
  while (i < text.length) {
    const end = Math.min(i + chunkSize, text.length)
    const chunk = text.slice(i, end)
    chunks.push(chunk)
    i += (chunkSize - overlap)
  }
  return chunks
}

// Admin upload endpoint
app.post('/admin/upload', upload.single('file'), async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.json({ message: 'Backend not fully configured. API keys will be added in Week 2.' })
    }
    
    const file = req.file
    if(!file) return res.status(400).json({ error: 'No file' })

    const raw = fs.readFileSync(file.path)
    let text = raw.toString('utf8')
    
    if(!text || text.trim().length === 0) {
      return res.status(400).json({ error: 'Could not read text from file. Use TXT/MD or enable PDF parsing.' })
    }

    const chunks = chunkText(text)
    const embed = async (input) => {
      const r = await openai.embeddings.create({ model: 'text-embedding-3-small', input })
      return r.data[0].embedding
    }

    const upserts = []
    for (let i=0; i<chunks.length; i++) {
      const values = await embed(chunks[i])
      upserts.push({ id: `${file.filename}-${i}`, values, metadata: { text: chunks[i], source: file.originalname } })
    }
    await index.upsert(upserts)

    res.json({ message: `Uploaded ${file.originalname}. Chunks: ${upserts.length}` })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
})

app.post('/ask', async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.json({ answer: 'Backend not fully configured yet. API keys will be added in Week 2.', sources: [] })
    }
    
    const { query } = req.body
    if(!query) return res.status(400).json({ error: 'Missing query' })

    const qEmbed = await openai.embeddings.create({ model: 'text-embedding-3-small', input: query })
    const vector = qEmbed.data[0].embedding
    const results = await index.query({ topK: 5, vector, includeMetadata: true })

    const context = results.matches?.map((m,i)=>`[${i+1}] Source: ${m.metadata?.source}\n${m.metadata?.text}`).join('\n\n') || ''

    const prompt = `You are a brand knowledge assistant for a marketing team. Answer the user question using ONLY the context. If unsure, say you don't know.\n\nContext:\n${context}\n\nQuestion: ${query}\n\nAnswer with a concise paragraph. Then list citations as [1], [2] referencing the sources above.`

    const chat = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Be accurate and cite sources by index.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })

    const answer = chat.choices[0].message?.content || 'No answer'
    const sources = (results.matches || []).map(m => ({ source: m.metadata?.source || 'unknown' }))

    res.json({ answer, sources })
  } catch (e) {
    console.error(e)
    res.status(500).json({ error: e.message })
  }
})

const PORT = process.env.PORT || 4000
app.listen(PORT, () => console.log('API on http://localhost:'+PORT))