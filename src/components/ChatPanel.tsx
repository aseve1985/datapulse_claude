import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Bot, User, Sparkles, Loader2, Mic, MicOff } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';

interface ChatPanelProps {
  data: any[];
  title: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export default function ChatPanel({ data, title }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    { 
      role: 'assistant', 
      content: `¡Hola! Soy tu asistente de datos para el **${title}**. He analizado los ${data.length} registros cargados. ¿En qué puedo ayudarte hoy? Puedes preguntarme por tendencias, anomalías o resúmenes específicos.` 
    }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);

  const toggleMic = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'es-AR';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognitionRef.current = recognition;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };

    recognition.start();
  }, [isListening]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setLoading(true);

    try {
      const dataSummary = data.slice(0, 50).map(item => JSON.stringify(item)).join('\n');
      const totalRecords = data.length;
      const columns = data.length > 0 ? Object.keys(data[0]).join(', ') : 'ninguna';

      const systemInstruction = `
        Eres un analista de datos experto. Tu objetivo es proporcionar insights, tendencias y respuestas precisas basadas en los datos proporcionados.

        CONTEXTO DEL MÓDULO: ${title}
        TOTAL DE REGISTROS: ${totalRecords}
        COLUMNAS DISPONIBLES: ${columns}

        MUESTRA DE DATOS (Primeros 50 registros):
        ${dataSummary}

        REGLAS:
        1. Responde de manera profesional y basada en datos.
        2. Si el usuario te pide cambiar la estética, colores o estructura del tablero, explícale amablemente que tu función es el análisis de datos y que el tablero ya cuenta con herramientas de personalización manual.
        3. Usa Markdown para dar formato a tus respuestas (negritas, listas, tablas si es necesario).
        4. Si no puedes encontrar una respuesta en los datos, admítelo y sugiere qué información adicional podría ser útil.
        5. Sé conciso pero informativo.
      `;

      const chatMessages = [
        ...messages.map(msg => ({ role: msg.role === 'assistant' ? 'model' : 'user', content: msg.content })),
        { role: 'user', content: userMessage }
      ];

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages, systemInstruction })
      });

      const result = await response.json();
      const aiResponse = result.text || "Lo siento, no pude procesar esa solicitud.";
      setMessages(prev => [...prev, { role: 'assistant', content: aiResponse }]);
    } catch (error) {
      console.error('Error calling AI API:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Hubo un error al procesar tu consulta. Por favor, intenta de nuevo." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-50">
      <div className="p-6 border-b border-zinc-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-100 rounded-xl flex items-center justify-center text-emerald-600">
            <Sparkles size={20} />
          </div>
          <div>
            <h2 className="text-sm font-black text-zinc-900 uppercase tracking-wider">Asistente IA</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-zinc-400 uppercase">Analizando {title}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <AnimatePresence initial={false}>
          {messages.map((msg, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`flex gap-3 max-w-[85%] ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                  msg.role === 'user' ? 'bg-zinc-900 text-white' : 'bg-emerald-600 text-white'
                }`}>
                  {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                </div>
                <div className={`p-4 rounded-2xl text-sm leading-relaxed shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-zinc-900 text-white rounded-tr-none' 
                    : 'bg-white text-zinc-800 border border-zinc-200 rounded-tl-none'
                }`}>
                  <div className="markdown-body prose prose-sm max-w-none">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {loading && (
          <div className="flex justify-start">
            <div className="flex gap-3 max-w-[85%]">
              <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                <Loader2 size={16} className="animate-spin" />
              </div>
              <div className="p-4 bg-white border border-zinc-200 rounded-2xl rounded-tl-none shadow-sm">
                <div className="flex gap-1">
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce" />
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                  <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                </div>
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-6 bg-white border-t border-zinc-200">
        <form onSubmit={handleSendMessage} className="relative">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isListening ? 'Escuchando...' : 'Pregunta sobre tendencias o datos...'}
            className={`w-full pl-4 pr-20 py-3 bg-zinc-100 border-none rounded-xl focus:ring-2 focus:ring-emerald-500/20 focus:bg-white transition-all text-sm ${isListening ? 'ring-2 ring-red-400/40 bg-red-50' : ''}`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
              type="button"
              onClick={toggleMic}
              className={`p-2 rounded-lg transition-colors ${isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-zinc-200 text-zinc-500 hover:bg-zinc-300'}`}
              title={isListening ? 'Detener' : 'Hablar'}
            >
              {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            </button>
            <button
              type="submit"
              disabled={!input.trim() || loading}
              className="p-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:hover:bg-emerald-600"
            >
              <Send size={16} />
            </button>
          </div>
        </form>
        <p className="mt-3 text-[10px] text-zinc-400 text-center font-medium">
          La IA puede cometer errores. Verifica la información importante.
        </p>
      </div>
    </div>
  );
}
