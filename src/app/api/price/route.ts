import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const DB_FILE_PATH = path.join(process.cwd(), "db", "price_config.json");
const CONFIG_KEY = "GLOBAL_LICENSE_PRICE";

function getStoredPriceFromFile(): number {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const content = fs.readFileSync(DB_FILE_PATH, "utf-8");
      const json = JSON.parse(content);
      if (json && typeof json.price === "number" && json.price > 0) {
        return json.price;
      }
    }
  } catch (err) {
    console.warn("Error reading price file:", err);
  }
  return 50;
}

function savePriceToFile(price: number): boolean {
  try {
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify({ price, updatedAt: new Date().toISOString() }, null, 2), "utf-8");
    return true;
  } catch (err) {
    console.warn("Error writing price file:", err);
    return false;
  }
}

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
    "Cache-Control": "no-store, max-age=0, s-maxage=0",
  };

  let currentPrice = getStoredPriceFromFile();

  try {
    const supabase = getSupabase();
    if (supabase) {
      // 1. Try querying device_pairings table in Supabase
      const { data, error } = await supabase
        .from("device_pairings")
        .select("monitor_device_id")
        .eq("primary_device_id", CONFIG_KEY)
        .maybeSingle();

      if (!error && data && data.monitor_device_id) {
        const parsed = parseInt(data.monitor_device_id, 10);
        if (!isNaN(parsed) && parsed > 0) {
          currentPrice = parsed;
          savePriceToFile(parsed);
          return NextResponse.json({ price: parsed, source: "supabase" }, { headers });
        }
      }
    }
  } catch (err) {
    console.warn("Supabase fetch price warning:", err);
  }

  return NextResponse.json({ price: currentPrice, source: "file" }, { headers });
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

    // 1. Save to local file
    savePriceToFile(newPrice);

    // 2. Save to Supabase (device_pairings)
    let savedInSupabase = false;
    try {
      const supabase = getSupabase();
      if (supabase) {
        const { error } = await supabase
          .from("device_pairings")
          .upsert(
            {
              primary_device_id: CONFIG_KEY,
              monitor_device_id: newPrice.toString(),
              pairing_token: "PRICE_" + newPrice,
            },
            { onConflict: "primary_device_id" }
          );

        if (!error) {
          savedInSupabase = true;
        } else {
          console.warn("Supabase upsert price warning:", error.message);
        }
      }
    } catch (e: any) {
      console.warn("Supabase error during POST:", e.message);
    }

    return NextResponse.json(
      {
        success: true,
        price: newPrice,
        savedInFile: true,
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
