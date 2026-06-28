import { NextResponse } from "next/server";

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const query = searchParams.get("q");

    if (!query || query.trim().length < 3) {
      return NextResponse.json(
        { error: "Falta el parámetro 'q' de búsqueda (mínimo 3 caracteres)." },
        { status: 400, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const q = encodeURIComponent(query.trim());

    // 1. Obtener vqd token de la página principal de DuckDuckGo
    const htmlResponse = await fetch(`https://duckduckgo.com/?q=${q}`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });

    if (!htmlResponse.ok) {
      return NextResponse.json(
        { error: "Error al consultar buscador base." },
        { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const html = await htmlResponse.text();
    const vqdMatch = html.match(/vqd=["']?([^"']+)["']?/);
    if (!vqdMatch) {
      return NextResponse.json(
        { error: "No se pudo autorizar la consulta automática." },
        { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const vqd = vqdMatch[1];

    // 2. Buscar imágenes usando el token vqd
    const imagesResponse = await fetch(`https://duckduckgo.com/i.js?l=wt-wt&o=json&q=${q}&vqd=${vqd}&f=,,,`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "application/json",
      },
    });

    if (!imagesResponse.ok) {
      return NextResponse.json(
        { error: "Error al buscar imágenes en el catálogo web." },
        { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    const data = await imagesResponse.json();
    if (!data.results || data.results.length === 0) {
      return NextResponse.json(
        { success: false, message: "No se encontraron imágenes para este producto." },
        { headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    // 3. Intentar descargar las mejores coincidencias (máximo top 5) por si alguna falla
    const maxAttempts = Math.min(data.results.length, 5);
    let winningDataUri = null;
    let winningTitle = "";

    for (let i = 0; i < maxAttempts; i++) {
      const imageUrl = data.results[i].image;
      const title = data.results[i].title;

      try {
        const imgRes = await fetch(imageUrl, {
          signal: AbortSignal.timeout(5000), // Timeout de 5s por imagen
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          },
        });

        if (imgRes.ok) {
          const arrayBuffer = await imgRes.arrayBuffer();
          const buffer = Buffer.from(arrayBuffer);
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const base64 = buffer.toString("base64");
          
          winningDataUri = `data:${contentType};base64,${base64}`;
          winningTitle = title;
          break; // Descarga exitosa, detener bucle
        }
      } catch (err) {
        console.warn(`[SearchImageProxy] Intento ${i + 1} falló para URL: ${imageUrl}`);
      }
    }

    if (!winningDataUri) {
      return NextResponse.json(
        { error: "No se pudo descargar ninguna de las imágenes encontradas." },
        { status: 502, headers: { "Access-Control-Allow-Origin": "*" } }
      );
    }

    return NextResponse.json(
      { success: true, title: winningTitle, dataUri: winningDataUri },
      {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
      }
    );
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
