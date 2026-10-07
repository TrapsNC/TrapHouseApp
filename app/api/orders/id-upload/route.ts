import { enforceRateLimit } from "@/lib/rate-limit";
import { NextResponse } from "next/server";
import { adminDatabase } from "@/lib/admin-db";

const MAX_FILE_SIZE = 8 * 1024 * 1024;

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const allowedTypes = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);


function detectImageType(
  bytes: Uint8Array
): "image/jpeg" | "image/png" | "image/webp" | null {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

function reply(body: object, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, "idUpload");
  if (limited) return limited;
  try {
    const formData = await request.formData();

    const requestIdValue = formData.get("requestId");
    const fileValue = formData.get("idImage");

    if (
      typeof requestIdValue !== "string" ||
      !uuidPattern.test(requestIdValue)
    ) {
      return reply(
        { error: "Invalid checkout request." },
        400
      );
    }

    if (!(fileValue instanceof File)) {
      return reply(
        { error: "Please upload a photo of your ID." },
        400
      );
    }

    if (fileValue.size <= 0) {
      return reply(
        { error: "The uploaded ID image is empty." },
        400
      );
    }

    if (fileValue.size > MAX_FILE_SIZE) {
      return reply(
        {
          error:
            "ID image must be 8 MB or smaller.",
        },
        413
      );
    }

    const extension = allowedTypes.get(
      fileValue.type
    );

    if (!extension) {
      return reply(
        {
          error:
            "ID image must be JPG, PNG, or WEBP.",
        },
        415
      );
    }


    const bytes =
      new Uint8Array(
        await fileValue.arrayBuffer()
      );

    const detectedType =
      detectImageType(bytes);

    if (!detectedType) {
      return reply(
        {
          error:
            "Uploaded file is not a valid JPG, PNG, or WEBP image.",
        },
        415
      );
    }

    if (detectedType !== fileValue.type) {
      return reply(
        {
          error:
            "Uploaded image type does not match its file contents.",
        },
        415
      );
    }

    const db = adminDatabase();

    /*
      Check whether this checkout request already
      has a private ID upload.
    */
    const {
      data: existing,
      error: existingError,
    } = await db
      .from("pending_id_uploads")
      .select("storage_path")
      .eq("request_id", requestIdValue)
      .maybeSingle();

    if (existingError) {
      throw new Error(
        "Could not check existing ID upload."
      );
    }

    const storagePath =
      `${requestIdValue}/${crypto.randomUUID()}.${extension}`;

    /*
      Upload directly with the server-only service role.
      The bucket remains private.
    */
    const {
      error: uploadError,
    } = await db.storage
      .from("age-verification-ids")
      .upload(
        storagePath,
        bytes,
        {
          contentType: fileValue.type,
          upsert: false,
        }
      );

    if (uploadError) {
      console.error(
        "ID STORAGE ERROR:",
        uploadError.message
      );

      throw new Error(
        "ID image upload failed."
      );
    }

    /*
      Link the private path to this checkout request.
      No public URL is generated.
    */
    const {
      error: recordError,
    } = await db
      .from("pending_id_uploads")
      .upsert(
        {
          request_id: requestIdValue,
          storage_path: storagePath,
          created_at:
            new Date().toISOString(),
        },
        {
          onConflict: "request_id",
        }
      );

    if (recordError) {
      /*
        If the database record fails, remove the
        newly uploaded file so an orphaned ID image
        is not left in Storage.
      */
      await db.storage
        .from(
          "age-verification-ids"
        )
        .remove([storagePath]);

      throw new Error(
        "Could not save ID verification record."
      );
    }

    /*
      If this request already had an older ID image,
      remove it after the replacement succeeds.
    */
    if (
      existing?.storage_path &&
      existing.storage_path !==
        storagePath
    ) {
      const {
        error: cleanupError,
      } = await db.storage
        .from(
          "age-verification-ids"
        )
        .remove([
          existing.storage_path,
        ]);

      if (cleanupError) {
        console.error(
          "OLD ID CLEANUP ERROR:",
          cleanupError.message
        );
      }
    }

    return reply(
      {
        success: true,
        uploaded: true,
      },
      201
    );
  } catch (error) {
    console.error(
      "ID UPLOAD ERROR:",
      error instanceof Error
        ? error.message
        : "Unknown error"
    );

    return reply(
      {
        error:
          "We could not securely upload the ID image. Please try again.",
      },
      503
    );
  }
}