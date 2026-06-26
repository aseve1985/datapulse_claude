# DWH Chat — Integración en DataPulse

## 1. Instalar dependencias

```bash
npm install @anthropic-ai/sdk pg
npm install -D @types/pg
```

## 2. Variables de entorno

Agregá al `.env` existente (ya tenés las de Redshift):

```
ANTHROPIC_API_KEY=sk-ant-...
# REDSHIFT_HOST, REDSHIFT_DATABASE, REDSHIFT_USER, REDSHIFT_PASSWORD, REDSHIFT_PORT — ya existen
```

## 3. Montar el router en tu app Express

```typescript
// app.ts (o donde montás tus rutas)
import chatRouter from './dwh-chat/router';

app.use('/api/dwh-chat', chatRouter);
```

## 4. Servir el widget

Opción A — ruta dedicada (más simple):
```typescript
import path from 'path';
app.get('/chat', (req, res) =>
  res.sendFile(path.join(__dirname, 'dwh-chat/chat-widget.html'))
);
```

Opción B — integrarlo en una página existente de tu app:
Copiá el contenido del `<body>` del widget dentro de un `<div>` de tu layout.
Solo necesitás ajustar `API_BASE` en el script del widget si la ruta cambia.

## 5. Arquitectura del flujo

```
Usuario (browser)
  └─ POST /api/dwh-chat/message { message, sessionId }
       └─ router.ts: gestiona sesión/historial
            └─ agent.ts: agentic loop
                 ├─ Anthropic API (claude-sonnet-4-6) con tool execute_sql
                 │    └─ Claude genera SQL si lo necesita
                 └─ pg → Redshift: ejecuta la query
                      └─ resultado devuelto a Claude → síntesis → respuesta final
  └─ Response: { sessionId, reply (markdown), queries[] }
```

## 6. Consideraciones para producción

- **Sesiones en memoria**: el router actual usa un `Map` en memoria. Si tenés múltiples instancias de Cloud Run, usá Redis para el historial de sesiones.
- **Rate limiting**: agregá un middleware de rate limit al router para evitar abusos.
- **Auth**: protegé `/api/dwh-chat/*` con el mismo middleware de autenticación que usás en el resto de DataPulse.
- **Límite de historial**: el agente mantiene el historial completo por sesión. Para conversaciones largas, podés truncar `history` a los últimos N mensajes antes de pasárselos al agente.
