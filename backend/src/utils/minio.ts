import * as Minio from "minio";
import path from "node:path";

const endPoint = process.env.MINIO_ENDPOINT || "minio";
const port = Number(process.env.MINIO_PORT || 9000);
const useSSL = process.env.MINIO_USE_SSL === "true";
const accessKey = process.env.MINIO_ROOT_USER || process.env.MINIO_ACCESS_KEY || "minioadmin";
const secretKey = process.env.MINIO_ROOT_PASSWORD || process.env.MINIO_SECRET_KEY || "minioadmin123";
export const BUCKET_NAME = process.env.MINIO_BUCKET_NAME || "avatars";

export const minioClient = new Minio.Client({
  endPoint,
  port,
  useSSL,
  accessKey,
  secretKey,
});

/**
 * Garante que o bucket no MinIO existe. Se não existir, cria o bucket.
 */
export async function ensureBucketExists(bucket: string = BUCKET_NAME): Promise<void> {
  try {
    const exists = await minioClient.bucketExists(bucket);
    if (!exists) {
      await minioClient.makeBucket(bucket, "us-east-1");
      console.log(`Bucket '${bucket}' criado com sucesso no MinIO.`);
    }
  } catch (err) {
    console.error(`Erro ao verificar ou criar bucket '${bucket}' no MinIO:`, err);
    throw err;
  }
}

/**
 * Valida a imagem e faz o upload para o MinIO
 */
export async function uploadAvatarToMinio(
  fileBuffer: Buffer,
  originalName: string,
  mimeType: string,
  userId: string
): Promise<{ filename: string; url: string }> {
  // 1. Validação do tipo de arquivo (imagem)
  const allowedMimeTypes = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
  ];
  const isImageMime = allowedMimeTypes.includes(mimeType.toLowerCase()) || mimeType.startsWith("image/");
  if (!isImageMime) {
    throw new Error("O arquivo enviado não é uma imagem válida. Tipos permitidos: JPG, PNG, WEBP, GIF.");
  }

  // 2. Validação de tamanho (máximo 5MB)
  const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
  if (fileBuffer.length > MAX_SIZE) {
    throw new Error("O tamanho da imagem excede o limite máximo permitido de 5MB.");
  }

  // 3. Garantir bucket
  await ensureBucketExists(BUCKET_NAME);

  // 4. Gerar nome único para o arquivo
  const ext = path.extname(originalName) || getExtFromMime(mimeType) || ".jpg";
  const filename = `avatar-${userId}-${Date.now()}${ext}`;

  // 5. Enviar para o MinIO
  await minioClient.putObject(BUCKET_NAME, filename, fileBuffer, fileBuffer.length, {
    "Content-Type": mimeType,
  });

  const url = `/api/user/avatar/${filename}`;
  return { filename, url };
}

/**
 * Retorna o stream do objeto armazenado no MinIO
 */
export async function getAvatarFromMinio(filename: string) {
  await ensureBucketExists(BUCKET_NAME);
  return await minioClient.getObject(BUCKET_NAME, filename);
}

/**
 * Remove uma foto de perfil do MinIO
 */
export async function deleteAvatarFromMinio(filenameOrUrl: string): Promise<void> {
  if (!filenameOrUrl) return;
  const filename = path.basename(filenameOrUrl);
  try {
    await ensureBucketExists(BUCKET_NAME);
    await minioClient.removeObject(BUCKET_NAME, filename);
  } catch (err) {
    console.error(`Erro ao deletar avatar ${filename} do MinIO:`, err);
  }
}

function getExtFromMime(mime: string): string {
  switch (mime.toLowerCase()) {
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "image/gif":
      return ".gif";
    default:
      return ".jpg";
  }
}

/* ==========================================================================
   ASSETS (anexos dos conteúdos)
   ========================================================================== */

export const ASSETS_BUCKET = process.env.MINIO_ASSETS_BUCKET || "assets";

/** Envia um arquivo já salvo em disco (upload temporário do multer) para o bucket de assets */
export async function uploadAssetFromFile(key: string, filePath: string, mimeType: string): Promise<void> {
  await ensureBucketExists(ASSETS_BUCKET);
  await minioClient.fPutObject(ASSETS_BUCKET, key, filePath, { "Content-Type": mimeType });
}

export async function getAssetStream(key: string) {
  return minioClient.getObject(ASSETS_BUCKET, key);
}

/** Remove objetos do bucket de assets; falhas são apenas registradas (o banco é a fonte da verdade) */
export async function deleteAssets(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    await minioClient.removeObjects(ASSETS_BUCKET, keys);
  } catch (err) {
    console.error(`Erro ao remover ${keys.length} anexo(s) do MinIO:`, err);
  }
}
