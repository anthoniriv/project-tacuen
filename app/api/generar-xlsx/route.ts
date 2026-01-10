// app/api/generar-xlsx/route.ts
import {
  generarExcelDesdeAnalisis,
  generarExcelPorPersonas,
} from "@/lib/excel/generarExcel";
import { analizarTicketConIA } from "@/lib/ia/analizarTicket";

export const runtime = "nodejs"; // necesario para usar exceljs y OpenAI en entorno Node

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const cantidadPersonasRaw = formData.get("cantidadPersonas");
    const imagenTicket = formData.get("imagenTicket") as File | null;
    const contextoRaw = formData.get("contexto");
    const contexto =
      typeof contextoRaw === "string" ? contextoRaw : "";

    if (!cantidadPersonasRaw || !imagenTicket) {
      return new Response("Faltan datos en el formulario", { status: 400 });
    }

    const cantidadPersonas = Number(cantidadPersonasRaw);

    if (!Number.isFinite(cantidadPersonas) || cantidadPersonas <= 0) {
      return new Response("La cantidad de personas no es válida", {
        status: 400,
      });
    }

    const allowedTypes = ["image/png", "image/jpeg"];
    if (!allowedTypes.includes(imagenTicket.type)) {
      return new Response("Solo se permiten imágenes PNG o JPG", {
        status: 400,
      });
    }

    let buffer: ArrayBuffer;

    try {
      // 🔹 IA: analiza ticket + contexto
      const analisis = await analizarTicketConIA(imagenTicket, contexto);
      console.log("Analisis IA>>>", JSON.stringify(analisis));

      // 🔹 Excel usando análisis (personas + items)
      buffer = await generarExcelDesdeAnalisis(
        analisis,
        cantidadPersonas
      );
    } catch (iaError) {
      // Si la IA o el Excel fallan, generamos el template vacío
      console.error("Error usando IA, generando template:", iaError);
      buffer = await generarExcelPorPersonas(cantidadPersonas);
    }

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": 'attachment; filename="consumo.xlsx"',
      },
    });
  } catch (error) {
    console.error("Error en /api/generar-xlsx:", error);
    return new Response(
      "Error interno al generar el archivo. Intenta nuevamente.",
      { status: 500 }
    );
  }
}
