import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "./firebase";

export async function uploadCommentImage(file: File): Promise<string> {
  const safeName = file.name.replace(/[^\w.\-]/g, "_");
  const path = `comments/${Date.now()}_${safeName}`;
  const r = ref(storage, path);
  await uploadBytes(r, file);
  return await getDownloadURL(r);
}
