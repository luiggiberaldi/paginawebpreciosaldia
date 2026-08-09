import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";

const DB_FILE_PATH = path.join(process.cwd(), "db", "price_config.json");
const CONFIG_KEY = "GLOBAL_LICENSE_PRICE";
const CONFIG_COMPARE_KEY = "GLOBAL_COMPARE_PRICE";
const DEFAULT_PRICE = 50;
const DEFAULT_COMPARE_PRICE = 99;

interface PriceConfig {
  price: number;
  comparePrice: number;
}

function readConfig(): PriceConfig {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const content = fs.readFileSync(DB_FILE_PATH, "utf-8");
      const json = JSON.parse(content);
      const price =
        json && typeof json.price === "number" && json.price > 0
          ? json.price
          : DEFAULT_PRICE;
      const comparePrice =
        json && typeof json.comparePrice === "number" && json.comparePrice > 0
          ? json.comparePrice
          : DEFAULT_COMPARE_PRICE;
      return { price, comparePrice };
    }
  } catch (err) {
    console.warn("Error reading price file:", err);
  }
  return { price: DEFAULT_PRICE, comparePrice: DEFAULT_COMPARE_PRICE };
}

function saveConfig(price: number, comparePrice: number): boolean {
  try {
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(
      DB_FILE_PATH,
      JSON.stringify({ price, comparePrice, updatedAt: new Date().toISOString() }, null, 2),
      "utf-8"
    );
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

async function fetchPriceFromSupabase(supabase: any, key: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("device_pairings")
    .select("monitor_device_id")
    .eq("primary_device_id", key)
    .maybeSingle();

  if (!error && data && data.monitor_device_id) {
    const parsed = parseInt(data.monitor_device_id, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

async function upsertPriceToSupabase(supabase: any, key: string, value: number): Promise<boolean> {
  const { error } = await supabase
    .from("device_pairings")
    .upsert(
      {
        primary_device_id: key,
        monitor_device_id: value.toString(),
        pairing_token: "PRICE_" + value,
      },
      { onConflict: "primary_device_id" }
    );
  return !error;
}

export async function GET() {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "no-store, max-age=0, s-maxage=0",
  };

  const config = readConfig();

  try {
    const supabase = getSupabase();
    if (supabase) {
      const remotePrice = await fetchPriceFromSupabase(supabase, CONFIG_KEY);
      const remoteComparePrice = await fetchPriceFromSupabase(supabase, CONFIG_COMPARE_KEY);

      if (remotePrice !== null) config.price = remotePrice;
      if (remoteComparePrice !== null) config.comparePrice = remoteComparePrice;

      if (remotePrice !== null || remoteComparePrice !== null) {
        saveConfig(config.price, config.comparePrice);
        return NextResponse.json(
          { price: config.price, comparePrice: config.comparePrice, source: "supabase" },
          { headers }
        );
      }
    }
  } catch (err) {
    console.warn("Supabase fetch price warning:", err);
  }

  return NextResponse.json(
    { price: config.price, comparePrice: config.comparePrice, source: "file" },
    { headers }
  );
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

    const config = readConfig();
    let newComparePrice = config.comparePrice;
    if (body.comparePrice !== undefined && body.comparePrice !== null && body.comparePrice !== "") {
      const parsed = parseInt(body.comparePrice, 10);
      if (!isNaN(parsed) && parsed > 0) {
        newComparePrice = parsed;
      }
    }

    // 1. Save to local file
    saveConfig(newPrice, newComparePrice);

    // 2. Save to Supabase (device_pairings)
    let savedInSupabase = false;
    try {
      const supabase = getSupabase();
      if (supabase) {
        const okPrice = await upsertPriceToSupabase(supabase, CONFIG_KEY, newPrice);
        const okCompare = await upsertPriceToSupabase(supabase, CONFIG_COMPARE_KEY, newComparePrice);
        savedInSupabase = okPrice && okCompare;
      }
    } catch (e: any) {
      console.warn("Supabase error during POST:", e.message);
    }

    return NextResponse.json(
      {
        success: true,
        price: newPrice,
        comparePrice: newComparePrice,
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
