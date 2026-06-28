import { NextResponse } from "next/server";

// Contador en memoria para rotación round-robin de llaves
let keyIndex = 0;

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function POST(req: Request) {
  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json(
        { error: "El cuerpo de la petición debe contener un arreglo de 'messages'." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const groqKeysStr = process.env.GROQ_KEYS || "";
    let keys = groqKeysStr.split(",").map(k => k.trim()).filter(Boolean);

    // Fallback si no está configurada la cadena rotatoria GROQ_KEYS en Vercel
    if (keys.length === 0) {
      if (process.env.VITE_GROQ_API_KEY) keys.push(process.env.VITE_GROQ_API_KEY.trim());
      if (process.env.VITE_GROQ_API_KEY_SECONDARY) keys.push(process.env.VITE_GROQ_API_KEY_SECONDARY.trim());
    }

    if (keys.length === 0) {
      return NextResponse.json(
        { error: "No se encontraron claves de API configuradas en el servidor (GROQ_KEYS)." },
        { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // Rotación de llaves secuencial con reintento (si falla 429, 401, 403 o 5xx, pasa a la siguiente key)
    let lastError = "";
    let response: Response | null = null;
    const startIndex = keyIndex;

    for (let attempt = 0; attempt < keys.length; attempt++) {
      const currentIdx = (startIndex + attempt) % keys.length;
      keyIndex = (currentIdx + 1) % keys.length; // Avanzar el index global
      const apiKey = keys[currentIdx];

      try {
        response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages,
            temperature: 0.7,
            max_tokens: 2048,
            stream: true,
          }),
        });

        if (response.ok) {
          break; // Key funcionó, salir del bucle
        }

        const errText = await response.text();
        lastError = `Key[${currentIdx}] HTTP ${response.status}: ${errText}`;
        
        // Si no es un error de rate-limit, credenciales o servidor (p. ej. error 400 por mal formato), fallar inmediatamente
        if (response.status !== 429 && response.status !== 401 && response.status !== 403 && response.status < 500) {
          return new Response(`Error de la API de Groq: ${errText}`, {
            status: response.status,
            headers: { "Access-Control-Allow-Origin": "*" },
          });
        }
      } catch (err: any) {
        lastError = err.message;
      }
    }

    if (!response || !response.ok) {
      return new Response(`Error de la API de Groq: Todas las llaves configuradas fallaron. Último error: ${lastError}`, {
        status: 503,
        headers: { "Access-Control-Allow-Origin": "*" },
      });
    }

    // Retornar el stream directamente al cliente con cabeceras CORS
    return new Response(response.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}

