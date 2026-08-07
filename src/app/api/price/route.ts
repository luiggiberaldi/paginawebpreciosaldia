import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

let inMemoryPrice: number = 50;

function getSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  if (!supabaseUrl || !supabaseKey) {
    return null;
  }
  return createClient(supabaseUrl, supabaseKey);
}

export async function GET() {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, max-age=0",
  };

  try {
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", "license_price")
        .maybeSingle();

      if (!error && data && data.value) {
        const parsed = parseInt(data.value, 10);
        if (!isNaN(parsed) && parsed > 0) {
          inMemoryPrice = parsed;
          return NextResponse.json({ price: parsed, source: "supabase" }, { headers });
        }
      }
    }
  } catch (err) {
    console.warn("Supabase fetch price warning:", err);
  }

  return NextResponse.json({ price: inMemoryPrice, source: "memory" }, { headers });
}

export async function POST(req: Request) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  try {
    const body = await req.json();
    const newPrice = parseInt(body.price, 10);

    if (isNaN(newPrice) || newPrice <= 0) {
      return NextResponse.json({ error: "Invalid price" }, { status: 400, headers });
    }

    inMemoryPrice = newPrice;

    const supabase = getSupabase();
    let savedInSupabase = false;

    if (supabase) {
      const { error } = await supabase
        .from("site_settings")
        .upsert(
          { key: "license_price", value: newPrice.toString(), updated_at: new Date().toISOString() },
          { onConflict: "key" }
        );

      if (!error) {
        savedInSupabase = true;
      } else {
        console.warn("Supabase upsert price warning:", error.message);
      }
    }

    return NextResponse.json(
      {
        success: true,
        price: newPrice,
        savedInSupabase,
      },
      { headers }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Server error" }, { status: 500, headers });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
