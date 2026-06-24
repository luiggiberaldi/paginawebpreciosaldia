import { redirect } from 'next/navigation'

export default function Home() {
  // El entregable es una página HTML estática independiente (preciosaldia-intro.html).
  // Redirigimos la ruta raíz hacia ese archivo servido desde /public para poder previsualizarlo.
  redirect('/preciosaldia-intro.html')
}
