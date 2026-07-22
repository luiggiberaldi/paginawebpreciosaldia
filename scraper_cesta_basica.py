import os
import re
import json
import requests
from bs4 import BeautifulSoup
from PIL import Image
from io import BytesIO
import urllib.parse
import time
import sys

# Force output to UTF-8 to prevent any console encoding errors with Ñ or Accents on Windows
sys.stdout.reconfigure(encoding='utf-8')

# --- CONFIGURATION ---
OUTPUT_DIR = r"c:\Users\luigg\Desktop\pisu_starter\projects\precios al dia\pagina precios al dia\public\images\cesta_basica"
GROQ_API_KEYS = []

SUPERMARKETS = [
    {"name": "Farmatodo", "domain": "farmatodo.com.ve", "path_kw": "/producto/"},
    {"name": "Plazas", "domain": "elplazas.com", "path_kw": "/productos/"},
    {"name": "Gama", "domain": "excelsiorgama.com", "path_kw": "/producto/"}
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "es-VE,es;q=0.9,en-US;q=0.8,en;q=0.7"
}

# --- ENV LOADER ---
def load_env():
    global GROQ_API_KEYS
    env_paths = [
        os.path.join(os.path.dirname(__file__), ".env"),
        os.path.join(os.path.dirname(__file__), "..", ".env"),
        ".env"
    ]
    for path in env_paths:
        if os.path.exists(path):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    for line in f:
                        line = line.strip()
                        if not line or line.startswith("#"):
                            continue
                        if "=" in line:
                            parts = line.split("=", 1)
                            if len(parts) == 2:
                                k = parts[0].strip()
                                v = parts[1].strip().strip('"').strip("'")
                                if k == "GROQ_KEYS" or k == "GROQ_API_KEY":
                                    GROQ_API_KEYS = [key.strip() for key in v.split(",") if key.strip()]
                print(f"Loaded Groq keys from: {path}")
                break
            except Exception as e:
                print(f"Failed to read env file '{path}': {e}")
                
    if not GROQ_API_KEYS and os.environ.get("GROQ_KEYS"):
        GROQ_API_KEYS = [key.strip() for key in os.environ.get("GROQ_KEYS").split(",") if key.strip()]

# Load keys
load_env()

current_key_idx = 0

def get_groq_key():
    global current_key_idx
    if not GROQ_API_KEYS:
        return ""
    return GROQ_API_KEYS[current_key_idx]

def rotate_groq_key():
    global current_key_idx
    if GROQ_API_KEYS:
        current_key_idx = (current_key_idx + 1) % len(GROQ_API_KEYS)
        print(f"Rotating Groq Key... Now using key index {current_key_idx}")

# --- HELPERS ---
def clean_query_with_groq(term):
    """Uses Groq to generate the best search query string for the product."""
    if not GROQ_API_KEYS:
        return term
        
    prompt = f"""Dada la descripción de un producto o corte de carne en Venezuela: "{term}"
Devuelve una consulta corta de 2 a 4 palabras optimizada para buscar su página web de compra en supermercados venezolanos.
Ejemplos:
- "Chocolate con Leche Savoy" -> "Chocolate Savoy leche"
- "Galletas Maria Puig" -> "Galletas Maria Puig"
- "Suero de leche Paisa" -> "Suero Paisa"

Responde en formato JSON con la siguiente estructura:
{{
  "query": "la consulta de busqueda"
}}
"""
    for _ in range(len(GROQ_API_KEYS)):
        key = get_groq_key()
        try:
            r = requests.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
                json={
                    "model": "llama-3.1-8b-instant",
                    "messages": [{"role": "user", "content": prompt}],
                    "response_format": {"type": "json_object"},
                    "temperature": 0.1
                },
                timeout=10
            )
            if r.status_code == 200:
                result = r.json()
                data = json.loads(result["choices"][0]["message"]["content"])
                return data.get("query", term).strip()
            elif r.status_code == 429:
                print(f"Rate limit hit on key index {current_key_idx}. Rotating...")
                rotate_groq_key()
            else:
                print(f"Groq API returned error {r.status_code}. Rotating...")
                rotate_groq_key()
        except Exception as e:
            print(f"Error calling Groq: {e}. Rotating...")
            rotate_groq_key()
    return term

def search_product_page(domain, path_keyword, query_str):
    """Searches Bing or Yahoo Web Search for a product link from a specific domain."""
    query = f"site:{domain} {query_str}"
    
    # 1. Try Bing Web Search
    search_url = f"https://www.bing.com/search?q={urllib.parse.quote(query)}"
    try:
        r = requests.get(search_url, headers=HEADERS, timeout=10)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            for a in soup.find_all("a"):
                href = a.get("href")
                if href and domain in href and path_keyword in href:
                    return href
    except Exception as e:
        print(f"    Bing Search failed for '{query}': {e}")
        
    # 2. Try Yahoo Web Search (Fallback)
    yahoo_url = f"https://search.yahoo.com/search?p={urllib.parse.quote(query)}"
    try:
        r = requests.get(yahoo_url, headers=HEADERS, timeout=10)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            for a in soup.find_all("a"):
                href = a.get("href")
                if href and domain in href and path_keyword in href:
                    return href
    except Exception as e:
        print(f"    Yahoo Search failed for '{query}': {e}")
        
    return None

def get_og_image_from_page(url):
    """Fetches a product page and extracts the og:image URL."""
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        if r.status_code == 200:
            soup = BeautifulSoup(r.text, "html.parser")
            og_img = soup.find("meta", property="og:image")
            if og_img and og_img.get("content"):
                return og_img["content"]
            # Fallback to general images
            for img in soup.find_all("img"):
                src = img.get("src")
                if src and ("product" in src or "cdn" in src) and src.startswith("http"):
                    return src
    except Exception as e:
        print(f"    Failed to fetch page or extract image from '{url}': {e}")
    return None

def process_and_save_image(image_url, filepath):
    """Downloads, resizes to 400x400 WebP and saves locally."""
    try:
        r = requests.get(image_url, headers=HEADERS, timeout=10)
        if r.status_code == 200:
            img = Image.open(BytesIO(r.content))
            if img.mode != "RGB":
                img = img.convert("RGB")
            img = img.resize((400, 400), Image.Resampling.LANCZOS)
            img.save(filepath, format="WEBP", quality=75)
            return True
    except Exception as e:
        print(f"    Image processing/save error for '{image_url}': {e}")
    return False

def get_slug(name):
    s = name.lower()
    s = s.replace("á", "a").replace("é", "e").replace("í", "i").replace("ó", "o").replace("ú", "u")
    s = s.replace("ñ", "n")
    s = re.sub(r'[^a-z0-9\s-]', '', s)
    s = re.sub(r'[\s-]+', '-', s)
    return s.strip("-")

# --- MAIN ---
def main():
    print("--- STARTING CESTA BASICA & MEAT CUTS WEB-SEARCH SCRAPER (146 ITEMS) ---")
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # Load targets (Original 46 + 100 new common purchases)
    targets = [
        # Original 46
        {"category": "Cereales", "name": "Harina de Maíz P.A.N."},
        {"category": "Cereales", "name": "Harina de Maiz Juana"},
        {"category": "Cereales", "name": "Pasta Primor"},
        {"category": "Cereales", "name": "Pasta Ronco"},
        {"category": "Cereales", "name": "Pasta Mary"},
        {"category": "Cereales", "name": "Arroz Mary"},
        {"category": "Cereales", "name": "Harina de Trigo Robin Hood"},
        {"category": "Cereales", "name": "Harina de Trigo Blanca Flor"},
        {"category": "Grasas", "name": "Margarina Mavesa"},
        {"category": "Grasas", "name": "Mayonesa Mavesa"},
        {"category": "Grasas", "name": "Aceite Vegetal Vatel"},
        {"category": "Grasas", "name": "Aceite Diana"},
        {"category": "Lácteos y Café", "name": "Leche en Polvo La Campiña"},
        {"category": "Lácteos y Café", "name": "Leche en Polvo San Simón"},
        {"category": "Lácteos y Café", "name": "Leche en Polvo Purísima"},
        {"category": "Lácteos y Café", "name": "Leche en Polvo El Rodeo"},
        {"category": "Lácteos y Café", "name": "Café Fama de América"},
        {"category": "Lácteos y Café", "name": "Café El Peñón"},
        {"category": "Lácteos y Café", "name": "Café Amanecer"},
        {"category": "Bebidas", "name": "Refresco Glup Cola"},
        {"category": "Bebidas", "name": "Coca Cola 2L"},
        {"category": "Bebidas", "name": "Pepsi 2L"},
        {"category": "Bebidas", "name": "Refresco Golden Naranja"},
        {"category": "Carnes", "name": "Lomito de Res"},
        {"category": "Carnes", "name": "Solomo de Cuerito"},
        {"category": "Carnes", "name": "Punta Trasera"},
        {"category": "Carnes", "name": "Muchacho Redondo"},
        {"category": "Carnes", "name": "Muchacho Cuadrado"},
        {"category": "Carnes", "name": "Chocozuela de Res"},
        {"category": "Carnes", "name": "Pulpa Negra"},
        {"category": "Carnes", "name": "Ganso de Res"},
        {"category": "Carnes", "name": "Pollo de Res"},
        {"category": "Carnes", "name": "Falda de Res"},
        {"category": "Carnes", "name": "Lagarto con Hueso"},
        {"category": "Carnes", "name": "Pecho de Res"},
        {"category": "Carnes", "name": "Solomo Abierto"},
        {"category": "Pollo", "name": "Pollo Entero"},
        {"category": "Pollo", "name": "Pechuga de Pollo"},
        {"category": "Pollo", "name": "Muslo de Pollo"},
        {"category": "Pollo", "name": "Alitas de Pollo"},
        {"category": "Pollo", "name": "Espinazo de Pollo"},
        {"category": "Cerdo", "name": "Pernil de Cerdo"},
        {"category": "Cerdo", "name": "Lomo de Cerdo"},
        {"category": "Cerdo", "name": "Costillas de Cerdo"},
        {"category": "Cerdo", "name": "Chuletas de Cerdo"},
        {"category": "Cerdo", "name": "Cueritos de Cerdo"},

        # --- 100 NUEVOS PRODUCTOS COMUNES ---
        # Snacks / Galletas (16)
        {"category": "Snacks", "name": "Cocosette Nestlé"},
        {"category": "Snacks", "name": "Susy Nestlé"},
        {"category": "Snacks", "name": "Samba Fresa Savoy"},
        {"category": "Snacks", "name": "Galletas María Puig"},
        {"category": "Snacks", "name": "Galletas Soda Puig"},
        {"category": "Snacks", "name": "Chocolate de Leche Savoy"},
        {"category": "Snacks", "name": "Chocolate Cri Cri Savoy"},
        {"category": "Snacks", "name": "Pepito Alimentos"},
        {"category": "Snacks", "name": "Cheetos Kraft"},
        {"category": "Snacks", "name": "Papas Ruffles"},
        {"category": "Snacks", "name": "Doritos PepsiCo"},
        {"category": "Snacks", "name": "Cheese Tris Kraft"},
        {"category": "Snacks", "name": "Galletas Oreo"},
        {"category": "Snacks", "name": "Chocolate Bolero"},
        {"category": "Snacks", "name": "Ovomaltina Tubito"},
        {"category": "Snacks", "name": "Nucita Tubito"},
        # Abarrotes / Despensa (24)
        {"category": "Abarrotes", "name": "Azúcar Montalbán"},
        {"category": "Abarrotes", "name": "Sal Refinada"},
        {"category": "Abarrotes", "name": "Salsa de Tomate Pampero"},
        {"category": "Abarrotes", "name": "Salsa de Tomate Heinz"},
        {"category": "Abarrotes", "name": "Vinagre Blanco"},
        {"category": "Abarrotes", "name": "Lentejas Mary"},
        {"category": "Abarrotes", "name": "Caraotas Negras Mary"},
        {"category": "Abarrotes", "name": "Arvejas Verdes Mary"},
        {"category": "Abarrotes", "name": "Garbanzos Mary"},
        {"category": "Abarrotes", "name": "Salsa de Soya"},
        {"category": "Abarrotes", "name": "Salsa Inglesa"},
        {"category": "Abarrotes", "name": "Mostaza Heinz"},
        {"category": "Abarrotes", "name": "Diablitos Underwood 115g"},
        {"category": "Abarrotes", "name": "Jamón Endiablado Plumrose"},
        {"category": "Abarrotes", "name": "Atún en Aceite Margarita"},
        {"category": "Abarrotes", "name": "Atún en Agua Margarita"},
        {"category": "Abarrotes", "name": "Sardinas Tomate Eveba"},
        {"category": "Abarrotes", "name": "Salchichas Plumrose"},
        {"category": "Abarrotes", "name": "Pasta de Tomate Capri"},
        {"category": "Abarrotes", "name": "Avena Lassie"},
        {"category": "Abarrotes", "name": "Avena Quaker"},
        {"category": "Abarrotes", "name": "Cubitos Maggi"},
        {"category": "Abarrotes", "name": "Salsa Boloñesa Capri"},
        {"category": "Abarrotes", "name": "Gelatina Golden"},
        # Lácteos / Quesos / Embutidos (15)
        {"category": "Lácteos y Charcutería", "name": "Queso Llanero"},
        {"category": "Lácteos y Charcutería", "name": "Queso Palmizulia"},
        {"category": "Lácteos y Charcutería", "name": "Queso Amarillo"},
        {"category": "Lácteos y Charcutería", "name": "Queso Mozzarella"},
        {"category": "Lácteos y Charcutería", "name": "Queso Crema Paisa"},
        {"category": "Lácteos y Charcutería", "name": "Suero de Leche"},
        {"category": "Lácteos y Charcutería", "name": "Mantequilla Paisa"},
        {"category": "Lácteos y Charcutería", "name": "Jamón Cocido Plumrose"},
        {"category": "Lácteos y Charcutería", "name": "Jamón de Espalda"},
        {"category": "Lácteos y Charcutería", "name": "Salchichón Hermo"},
        {"category": "Lácteos y Charcutería", "name": "Mortadela Especial Hermo"},
        {"category": "Lácteos y Charcutería", "name": "Leche Líquida Mi Vaca"},
        {"category": "Lácteos y Charcutería", "name": "Yogurt Fresa Alpina"},
        {"category": "Lácteos y Charcutería", "name": "Yogurt Griego Yolo"},
        {"category": "Lácteos y Charcutería", "name": "Queso Blanco Duro"},
        # Bebidas / Jugos (12)
        {"category": "Bebidas", "name": "Chicha El Chichero"},
        {"category": "Bebidas", "name": "Toddy 400g"},
        {"category": "Bebidas", "name": "Nestea Durazno"},
        {"category": "Bebidas", "name": "Nestea Limón"},
        {"category": "Bebidas", "name": "Jugo Yukery Manzana"},
        {"category": "Bebidas", "name": "Jugo Yukery Pera"},
        {"category": "Bebidas", "name": "Jugo Yukery Durazno"},
        {"category": "Bebidas", "name": "Maltín Polar"},
        {"category": "Bebidas", "name": "Cerveza Polar Light"},
        {"category": "Bebidas", "name": "Cerveza Polar Pilsen"},
        {"category": "Bebidas", "name": "Ron Santa Teresa Linaje"},
        {"category": "Bebidas", "name": "Agua Mineral Minalba"},
        # Higiene Personal (16)
        {"category": "Higiene", "name": "Jabón Las Llaves Bebé"},
        {"category": "Higiene", "name": "Jabón Protex Avena"},
        {"category": "Higiene", "name": "Desodorante Speed Stick"},
        {"category": "Higiene", "name": "Desodorante Rexona"},
        {"category": "Higiene", "name": "Crema Dental Colgate"},
        {"category": "Higiene", "name": "Champú Drene"},
        {"category": "Higiene", "name": "Champú Pantene"},
        {"category": "Higiene", "name": "Acondicionador Drene"},
        {"category": "Higiene", "name": "Jabón de Baño Moncler"},
        {"category": "Higiene", "name": "Crema Corporal Hinds"},
        {"category": "Higiene", "name": "Papel Higiénico Rosal"},
        {"category": "Higiene", "name": "Toallas Sanitarias Nosotras"},
        {"category": "Higiene", "name": "Pañales Huggies"},
        {"category": "Higiene", "name": "Crema Dental Dento"},
        {"category": "Higiene", "name": "Champú Head & Shoulders"},
        {"category": "Higiene", "name": "Afeitar Gillette Prestobarba"},
        # Limpieza del Hogar (17)
        {"category": "Limpieza", "name": "Detergente Las Llaves Limón"},
        {"category": "Limpieza", "name": "Lavaplatos Crema Axion"},
        {"category": "Limpieza", "name": "Lavaplatos Crema Las Llaves"},
        {"category": "Limpieza", "name": "Desinfectante Mistolin Bebé"},
        {"category": "Limpieza", "name": "Cloro Lavansan"},
        {"category": "Limpieza", "name": "Cloro Nevex"},
        {"category": "Limpieza", "name": "Suavizante Ensueño"},
        {"category": "Limpieza", "name": "Esponja Scotch Brite"},
        {"category": "Limpieza", "name": "Insecticida Baygon"},
        {"category": "Limpieza", "name": "Jabón en Polvo Ariel"},
        {"category": "Limpieza", "name": "Desinfectante Pinesol"},
        {"category": "Limpieza", "name": "Desinfectante Ajax Bicloro"},
        {"category": "Limpieza", "name": "Desinfectante Fabuloso"},
        {"category": "Limpieza", "name": "Esponja de Alambre"},
        {"category": "Limpieza", "name": "Suavizante Downy"},
        {"category": "Limpieza", "name": "Detergente en Polvo Las Llaves"},
        {"category": "Limpieza", "name": "Detergente Líquido Ariel"}
    ]
    
    # Load index if exists
    index_file = os.path.join(OUTPUT_DIR, "index.json")
    index_data = []
    existing_slugs = set()
    if os.path.exists(index_file):
        try:
            with open(index_file, "r", encoding="utf-8") as f:
                index_data = json.load(f)
                existing_slugs = {item["slug"] for item in index_data}
        except Exception as e:
            print(f"Error loading index: {e}")
            
    success_count = 0
    for idx, t in enumerate(targets, 1):
        name = t["name"]
        cat = t["category"]
        slug = get_slug(name)
        filename = f"{slug}.webp"
        filepath = os.path.join(OUTPUT_DIR, filename)
        
        # Skip if already exists and size > 0
        if slug in existing_slugs and os.path.exists(filepath) and os.path.getsize(filepath) > 0:
            print(f"[{idx}/{len(targets)}] Skipping '{name}' (Already exists).")
            continue
            
        print(f"\n[{idx}/{len(targets)}] Scraping: '{name}' ({cat})")
        query_str = clean_query_with_groq(name)
        print(f"  Search Query: '{query_str}'")
        
        found = False
        for store in SUPERMARKETS:
            # Skip Farmatodo for meat products to stay targeted
            if cat in ["Carnes", "Pollo", "Cerdo"] and store["name"] == "Farmatodo":
                continue
                
            print(f"  Trying {store['name']}...")
            url = search_product_page(store["domain"], store["path_kw"], query_str)
            if url:
                print(f"    Found Page: {url}")
                img_url = get_og_image_from_page(url)
                if img_url:
                    print(f"    Found Image: {img_url}")
                    if process_and_save_image(img_url, filepath):
                        print(f"    SUCCESS: Saved to {filename}")
                        
                        # Remove existing with same slug
                        index_data = [item for item in index_data if item["slug"] != slug]
                        index_data.append({
                            "name": name,
                            "slug": slug,
                            "category": cat,
                            "local_path": f"/images/cesta_basica/{filename}",
                            "source_url": url,
                            "image_url": img_url
                        })
                        success_count += 1
                        found = True
                        break
            time.sleep(1.5) # Polite delay
            
        if not found:
            print(f"  Could not find product page/image for '{name}'.")
            
    # Save updated index.json with ensure_ascii=False to support Ñ and Accents correctly
    with open(index_file, "w", encoding="utf-8") as f:
        json.dump(index_data, f, ensure_ascii=False, indent=2)
        
    print(f"\n--- SCRAPING COMPLETED ---")
    print(f"Added {success_count} new images to public/images/cesta_basica/")
    print(f"Total cataloged images: {len(index_data)}")
    print(f"Index saved to: {index_file}")

if __name__ == "__main__":
    main()
