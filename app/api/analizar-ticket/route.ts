// app/api/analizar-ticket/route.ts

import { analizarTicketConIA } from "@/lib/ia/analizarTicket";
import type { AnalisisTicketIA } from "@/lib/excel/generarExcel";

export const runtime = "nodejs"; // necesario para usar OpenAI en entorno Node

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const imagenTicket = formData.get("imagenTicket") as File | null;
    const contextoRaw = formData.get("contexto");
    const contexto = typeof contextoRaw === "string" ? contextoRaw : "";

    if (!imagenTicket) {
      return new Response("Debes proporcionar una imagen", { status: 400 });
    }

    const allowedTypes = ["image/png", "image/jpeg"];
    if (!allowedTypes.includes(imagenTicket.type)) {
      return new Response("Solo se permiten imágenes PNG o JPG", {
        status: 400,
      });
    }

    // Analizar ticket con IA
    const analisis = await analizarTicketConIA(imagenTicket, contexto);

    // Devolver JSON con el análisis
    return Response.json(analisis as AnalisisTicketIA);
  } catch (error) {
    console.error("Error en /api/analizar-ticket:", error);
    return new Response(
      JSON.stringify({ error: "Error al analizar el ticket. Intenta nuevamente." }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}