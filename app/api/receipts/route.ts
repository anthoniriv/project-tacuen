import { NextResponse } from "next/server";
import crypto from "crypto";
import { supabaseAdmin } from "@/lib/supabase/server";

export const runtime = "nodejs";

function getMaxUploadBytes() {
  const mb = Number(process.env.MAX_RECEIPT_MB ?? 10);
  if (!Number.isFinite(mb) || mb <= 0) return 10 * 1024 * 1024;
  return Math.round(mb * 1024 * 1024);
}

function sha256(buf: Buffer) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function getExt(fileName: string) {
  const ext = (fileName.split(".").pop() || "jpg").toLowerCase();
  // evita extensiones raras
  if (!["jpg", "jpeg", "png", "webp"].includes(ext)) return "jpg";
  return ext;
}

export async function POST(req: Request) {
  const sb = supabaseAdmin();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "receipts";

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file requerido" }, { status: 400 });
  }

  const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: "Solo se permiten PNG/JPG/WEBP" }, { status: 400 });
  }

  const maxBytes = getMaxUploadBytes();
  if (file.size > maxBytes) {
    return NextResponse.json(
      { error: `Imagen demasiado grande (max ${Math.round(maxBytes / 1024 / 1024)}MB)` },
      { status: 400 }
    );
  }

  // 1) bytes + hash
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const hash = sha256(buffer);

  // 2) Deduplicación: si ya existe un receipt con mismo hash, reúsalo
  // (para MVP: puedes devolver el último; luego puedes usar user_id)
  const { data: existing, error: findErr } = await sb
    .from("receipts")
    .select("id,status,access_token,attempts")
    .eq("image_hash", hash)
    .order("created_at", { ascending: false })
    .limit(1);

  if (findErr && findErr.message?.includes("access_token")) {
    return NextResponse.json(
      { error: "Falta columna access_token en receipts. Ejecuta migracion." },
      { status: 500 }
    );
  }

  if (!findErr && existing && existing.length > 0) {
    const shouldBypassDedup =
      Number(existing[0].attempts ?? 0) >= 3 || existing[0].status === "error";

    if (shouldBypassDedup) {
      // Si el receipt previo falló o agotó intentos, permitir crear uno nuevo
    } else {
      let access_token = existing[0].access_token;
      if (!access_token) {
        access_token = crypto.randomBytes(32).toString("hex");
        const { error: updateErr } = await sb
          .from("receipts")
          .update({ access_token })
          .eq("id", existing[0].id);
        if (updateErr) {
          return NextResponse.json({ error: updateErr.message }, { status: 500 });
        }
      }
      return NextResponse.json({
        id: existing[0].id,
        dedup: true,
        status: existing[0].status,
        access_token,
      });
    }
  }

  // 3) path
  const id = crypto.randomUUID();
  const ext = getExt(file.name);
  const path = `uploads/${id}.${ext}`;
  const access_token = crypto.randomBytes(32).toString("hex");

  // 4) subir a Storage
  const { error: uploadErr } = await sb.storage.from(bucket).upload(path, buffer, {
    contentType: file.type || "image/jpeg",
    upsert: false,
  });

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 });
  }

  // 5) crear fila en DB
  const { error: insertErr } = await sb.from("receipts").insert({
    id,
    country_code: "PE",
    currency: "PEN",
    image_path: path,
    image_hash: hash,
    status: "uploaded",
    attempts: 0,
    access_token,

    // opcionales (solo si tienes columnas, si no las tienes quítalas):
    // original_filename: file.name,
    // mime_type: file.type || "image/jpeg",
    // size_bytes: buffer.length,
  });

  // 6) rollback si insert falla (borra archivo subido)
  if (insertErr) {
    await sb.storage.from(bucket).remove([path]);
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ id, dedup: false, access_token });
}
