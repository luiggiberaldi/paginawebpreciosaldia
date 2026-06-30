import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

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

function getSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric with hyphens
    .replace(/(^-|-$)+/g, ""); // remove leading/trailing hyphens
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

    const trimmedQuery = query.trim();
    const slug = getSlug(trimmedQuery);

    // 1. Try exact slug match
    const { data: exactMatch } = await supabase
      .from("product_images_catalog")
      .select("name, image_url")
      .eq("id", slug)
      .maybeSingle();

    if (exactMatch) {
      console.log(`[CatalogSearch] Exact match found for slug "${slug}": ${exactMatch.name}`);
      return NextResponse.json(
        {
          success: true,
          matches: [{ title: exactMatch.name, dataUri: exactMatch.image_url }]
        },
        {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
          },
        }
      );
    }

    // 2. Try partial tag match or keyword similarity match
    const words = trimmedQuery.toLowerCase().split(/\s+/).filter(w => w.length > 2);
    if (words.length > 0) {
      // Pull catalog items to match locally using array overlaps
      const { data: matches } = await supabase
        .from("product_images_catalog")
        .select("id, name, image_url")
        .overlaps("tags", words);

      if (matches && matches.length > 0) {
        const ranked = matches.map(item => {
          let score = 0;
          const nameLower = item.name.toLowerCase();
          words.forEach(w => {
            if (nameLower.includes(w)) score += 10;
          });
          return { ...item, score };
        })
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score);

        if (ranked.length > 0) {
          const topMatches = ranked.slice(0, 5).map(item => ({
            title: item.name,
            dataUri: item.image_url
          }));
          
          console.log(`[CatalogSearch] Found ${topMatches.length} similarity matches for query: "${trimmedQuery}"`);
          return NextResponse.json(
            { success: true, matches: topMatches },
            {
              headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
              },
            }
          );
        }
      }
    }

    // If nothing found
    return NextResponse.json(
      { error: "No se encontraron imágenes en el catálogo para el producto especificado." },
      { status: 404, headers: { "Access-Control-Allow-Origin": "*" } }
    );

  } catch (error: any) {
    console.error("[CatalogSearch] Error:", error);
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { "Access-Control-Allow-Origin": "*" } }
    );
  }
}
