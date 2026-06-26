import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Send, Loader2, Bot, Database, RotateCcw } from 'lucide-react';

interface QueryInfo {
  sql: string;
  rowCount: number;
  error?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  queries?: QueryInfo[];
}

// Strip <details>...</details> blocks the AI may include in markdown
// (queries are shown separately via msg.queries)
function stripDetailsBlocks(text: string): string {
  return text.replace(/<details[\s\S]*?<\/details>/gi, '').trim();
}

const SUGGESTIONS = [
  '¿Cómo viene la mora este mes?',
  'Ventas por semana últimas 4 semanas',
  'Hit rate de originación por producto',
  'Ticket promedio por cohorte de vintage',
  '¿Qué tablas hay en el schema gold?',
];

export default function ConsultasGeneralesModule({ userEmail }: { userEmail?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const lastUserMsgRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    const target = lastUserMsgRef.current;
    if (!container || !target) return;
    // Scroll the messages container so the last user question is 24px from the top
    const targetTop = target.getBoundingClientRect().top
      - container.getBoundingClientRect().top
      + container.scrollTop
      - 24;
    container.scrollTo({ top: targetTop, behavior: 'smooth' });
  }, [messages, loading]);

  // Find index of the last user message to attach the scroll ref
  const lastUserMsgIdx = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') return i;
    }
    return -1;
  })();

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    setMessages(prev => [...prev, { role: 'user', content: text.trim() }]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setLoading(true);

    try {
      const res = await fetch('/api/dwh-chat/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text.trim(), sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setSessionId(data.sessionId);
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: stripDetailsBlocks(data.reply),
        queries: data.queries ?? [],
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `**Error:** ${err.message}`,
      }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(input); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 h-full">

      {/* Messages */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-6 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-8 text-center">
            <div className="w-16 h-16 bg-gradient-to-br from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-3xl flex items-center justify-center">
              <Bot className="w-8 h-8 text-blue-400" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-white">¿Qué querés saber del negocio?</h2>
              <p className="text-zinc-500 text-sm max-w-md leading-relaxed">
                Preguntame sobre mora, cosechas, originación, tasas, collections o cualquier métrica del warehouse.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-xl">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  disabled={loading}
                  className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700 hover:border-blue-500/50 text-zinc-400 hover:text-zinc-200 rounded-full text-xs transition-all disabled:opacity-40"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="max-w-3xl mx-auto space-y-6">
            {messages.map((msg, i) => (
              <div
                key={i}
                ref={i === lastUserMsgIdx ? lastUserMsgRef : undefined}
                className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold ${
                  msg.role === 'user'
                    ? 'bg-blue-900/60 border border-blue-700/50 text-blue-300'
                    : 'bg-gradient-to-br from-blue-600 to-purple-600 text-white'
                }`}>
                  {msg.role === 'user' ? (userEmail?.[0]?.toUpperCase() ?? 'U') : <Bot className="w-3.5 h-3.5" />}
                </div>

                <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-blue-950/50 border border-blue-800/40 text-blue-100 rounded-tr-sm'
                    : 'bg-slate-800/70 border border-slate-700/50 text-zinc-200 rounded-tl-sm'
                }`}>
                  {msg.role === 'assistant' ? (
                    <div className="prose prose-invert prose-sm max-w-none
                      prose-table:text-xs prose-table:w-full
                      prose-thead:bg-slate-900
                      prose-th:text-zinc-300 prose-th:font-semibold prose-th:px-3 prose-th:py-2 prose-th:border prose-th:border-slate-700
                      prose-td:px-3 prose-td:py-1.5 prose-td:border prose-td:border-slate-700/60
                      prose-tr:even:bg-slate-800/30
                      prose-pre:bg-slate-950 prose-pre:border prose-pre:border-slate-800 prose-pre:text-xs
                      prose-code:text-blue-300 prose-code:bg-slate-950 prose-code:px-1 prose-code:rounded
                      prose-strong:text-white prose-headings:text-zinc-200">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p>{msg.content}</p>
                  )}

                  {msg.queries && msg.queries.length > 0 && (
                    <div className="mt-3 space-y-1 border-t border-slate-700/50 pt-2">
                      {msg.queries.map((q, qi) => (
                        <details key={qi} className="group">
                          <summary className="flex items-center gap-1.5 cursor-pointer text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors list-none select-none py-0.5">
                            <Database className="w-3 h-3 flex-shrink-0" />
                            <span>Ver SQL — {q.rowCount} {q.rowCount === 1 ? 'fila' : 'filas'}{q.error ? ' ⚠️ error' : ''}</span>
                          </summary>
                          <pre className="mt-1.5 p-3 bg-slate-950 border border-slate-800/80 rounded-lg text-[11px] text-blue-300 font-mono overflow-x-auto whitespace-pre-wrap break-words leading-relaxed">
                            {q.sql}
                          </pre>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-3">
                <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-blue-600 to-purple-600">
                  <Bot className="w-3.5 h-3.5 text-white" />
                </div>
                <div className="bg-slate-800/70 border border-slate-700/50 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex gap-1.5 items-center h-4">
                    {[0, 150, 300].map(delay => (
                      <span key={delay} className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 bg-slate-950/60 px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {messages.length > 0 && (
            <div className="flex justify-end mb-2">
              <button
                onClick={() => { setMessages([]); setSessionId(null); }}
                className="flex items-center gap-1 text-[11px] text-zinc-700 hover:text-zinc-400 transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Nueva conversación
              </button>
            </div>
          )}
          <div className="flex gap-3 items-end bg-slate-800 border border-slate-700 focus-within:border-blue-500/40 rounded-2xl px-4 py-3 transition-colors">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Preguntá sobre datos del negocio…"
              rows={1}
              disabled={loading}
              className="flex-1 bg-transparent text-sm text-zinc-200 placeholder-zinc-600 resize-none outline-none min-h-[20px] max-h-[120px] disabled:opacity-50 leading-relaxed"
            />
            <button
              onClick={() => send(input)}
              disabled={!input.trim() || loading}
              className="w-8 h-8 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 flex items-center justify-center flex-shrink-0 transition-colors"
            >
              {loading
                ? <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                : <Send className="w-3.5 h-3.5 text-white disabled:text-zinc-600" />
              }
            </button>
          </div>
          <p className="text-[10px] text-zinc-700 text-center mt-2">Enter para enviar · Shift+Enter para nueva línea</p>
        </div>
      </div>
    </div>
  );
}
