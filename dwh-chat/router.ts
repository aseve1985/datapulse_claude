/**
 * DWH Chat Router — Libgot
 * Montá este router en tu app Express: app.use('/api/dwh-chat', chatRouter)
 *
 * Endpoints:
 *   POST /api/dwh-chat/message   — enviar mensaje, recibir respuesta
 *   DELETE /api/dwh-chat/session/:id — limpiar historial de una sesión
 */

import { Router, Request, Response } from "express";
import { chat, Message } from "./agent";

const router = Router();

// ──────────────────────────────────────────────
// Sesiones en memoria (reemplazá con Redis en prod si necesitás persistencia)
// ──────────────────────────────────────────────
const sessions = new Map<string, Message[]>();

function getOrCreateSession(sessionId: string): Message[] {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, []);
  }
  return sessions.get(sessionId)!;
}

// Limpiar sesiones inactivas cada hora
setInterval(() => {
  // Estrategia simple: limpiar sesiones con más de 100 mensajes
  for (const [id, history] of sessions.entries()) {
    if (history.length > 100) sessions.delete(id);
  }
}, 60 * 60 * 1000);

// ──────────────────────────────────────────────
// POST /message
// Body: { message: string, sessionId?: string }
// ──────────────────────────────────────────────
router.post("/message", async (req: Request, res: Response) => {
  const { message, sessionId } = req.body as { message?: string; sessionId?: string };

  if (!message?.trim()) {
    return res.status(400).json({ error: "El campo 'message' es requerido." });
  }

  const sid = sessionId ?? `anon-${Date.now()}`;
  const history = getOrCreateSession(sid);

  try {
    const result = await chat({ message: message.trim(), history });

    // Actualizar historial con la versión devuelta por el agente
    sessions.set(sid, result.updatedHistory);

    return res.json({
      sessionId: sid,
      reply: result.reply,
      queries: result.queries.map((q) => ({
        sql: q.sql,
        rowCount: q.rowCount,
        error: q.error,
      })),
    });
  } catch (err: unknown) {
    console.error("[DWH Chat] Error:", err);
    const message = err instanceof Error ? err.message : "Error interno";
    return res.status(500).json({ error: message });
  }
});

// ──────────────────────────────────────────────
// DELETE /session/:id
// ──────────────────────────────────────────────
router.delete("/session/:id", (req: Request, res: Response) => {
  const { id } = req.params;
  sessions.delete(id);
  return res.json({ ok: true, sessionId: id });
});

export default router;
