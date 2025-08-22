import { useState, useEffect } from 'react'

function Navbar() {
  return (
    <div className="w-full p-4 border-b bg-white sticky top-0">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <a href="/" className="font-bold text-xl">Brand Assistant</a>
        <div className="flex gap-4">
          <a href="/chat" className="hover:underline">Chat</a>
          <a href="/admin" className="hover:underline">Admin</a>
          <a href="/" className="hover:underline">Home</a>
        </div>
      </div>
    </div>
  )
}

function Home() {
  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-3xl font-bold mb-2">AI-Powered Brand Knowledge Assistant</h1>
      <p className="mb-4">Upload brand docs, ask questions, get answers with citations. Built for digital marketing teams.</p>
      <ol className="list-decimal ml-6 space-y-1">
        <li>Go to <b>Admin</b> to upload a PDF/MD/TXT.</li>
        <li>Open <b>Chat</b>, ask a question.</li>
      </ol>
    </div>
  )
}

function Chat() {
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<{role:'user'|'assistant';content:string}[]>([])
  const [loading, setLoading] = useState(false)

  const send = async () => {
    if(!input.trim()) return
    const userMsg = { role: 'user' as const, content: input }
    setMessages(prev => [...prev, userMsg])
    setInput("")
    setLoading(true)
    try {
      const res = await fetch(import.meta.env.VITE_API_URL + '/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: userMsg.content })
      })
      const data = await res.json()
      const answer = data.answer + (data.sources?.length ? `\n\nSources: \n` + data.sources.map((s:any,i:number)=>`[${i+1}] ${s.source}`).join('\n') : '')
      setMessages(prev => [...prev, { role:'assistant', content: answer }])
    } catch (e:any) {
      setMessages(prev => [...prev, { role:'assistant', content: 'Error: ' + e.message }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-semibold mb-4">Chat</h2>
      <div className="border rounded-lg p-4 h-[420px] overflow-y-auto bg-white">
        {messages.map((m, i) => (
          <div key={i} className="mb-3">
            <div className="text-xs text-gray-500">{m.role === 'user' ? 'You' : 'Assistant'}</div>
            <div className="whitespace-pre-wrap">{m.content}</div>
          </div>
        ))}
        {loading && <div className="text-gray-500">Thinking…</div>}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="flex-1 border rounded p-2"
          placeholder="Ask about the brand…"
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>{ if(e.key==='Enter') send() }}
        />
        <button onClick={send} className="px-4 py-2 rounded bg-black text-white">Send</button>
      </div>
    </div>
  )
}

function Admin() {
  const [file, setFile] = useState<File | null>(null)
  const [msg, setMsg] = useState('')
  const upload = async () => {
    if(!file) { setMsg('Pick a file first.'); return }
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch(import.meta.env.VITE_API_URL + '/admin/upload', { method:'POST', body: fd })
    const data = await res.json()
    setMsg(data.message || JSON.stringify(data))
  }
  return (
    <div className="max-w-3xl mx-auto p-6">
      <h2 className="text-2xl font-semibold mb-4">Admin — Upload Docs</h2>
      <input type="file" onChange={e=>setFile(e.target.files?.[0] || null)} />
      <button onClick={upload} className="ml-3 px-4 py-2 rounded bg-black text-white">Upload</button>
      {msg && <div className="mt-3 text-sm">{msg}</div>}
    </div>
  )
}

function useRoute() {
  const [path, setPath] = useState(window.location.pathname)
  useEffect(() => {
    const onClick = (e: any) => {
      const a = e.target.closest('a[href]')
      if(a && a.getAttribute('href')?.startsWith('/')) {
        e.preventDefault()
        const href = a.getAttribute('href')
        if(href) {
          window.history.pushState({}, '', href)
          setPath(href)
        }
      }
    }
    const onPop = () => setPath(window.location.pathname)
    document.addEventListener('click', onClick)
    window.addEventListener('popstate', onPop)
    return () => { document.removeEventListener('click', onClick); window.removeEventListener('popstate', onPop) }
  }, [])
  return path
}

export default function App() {
  const path = useRoute()
  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar/>
      {path === '/' && <Home/>}
      {path === '/chat' && <Chat/>}
      {path === '/admin' && <Admin/>}
    </div>
  )
}