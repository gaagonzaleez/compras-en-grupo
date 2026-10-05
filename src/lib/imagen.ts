/**
 * Achica una foto antes de subirla (los celulares sacan fotos de 5 a 10 MB).
 * Si no es una imagen que el navegador pueda dibujar, devuelve el archivo tal cual.
 */
export async function comprimirImagen(archivo: File, maxLado = 1600, calidad = 0.82): Promise<File> {
  if (!/^image\/(jpeg|png|webp)$/.test(archivo.type)) return archivo;
  try {
    const bitmap = await createImageBitmap(archivo);
    const escala = Math.min(1, maxLado / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * escala);
    canvas.height = Math.round(bitmap.height * escala);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", calidad));
    if (!blob || blob.size >= archivo.size) return archivo;
    return new File([blob], archivo.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return archivo;
  }
}
