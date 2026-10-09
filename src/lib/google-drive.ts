import { getValidAccessToken } from "./google-auth";

interface UploadResult {
  fileId: string;
  webViewLink: string;
}

/**
 * Upload a file buffer to the user's Google Drive using multipart upload.
 * Returns { fileId, webViewLink } on success, or null if Drive is unavailable
 * (user hasn't connected Google, refresh failed, etc.).
 */
export async function uploadPdpToDrive(
  userId: string,
  fileName: string,
  buffer: Buffer,
  mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
): Promise<UploadResult | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  // Multipart upload: metadata + file body in a single request.
  // Drive converts the uploaded .docx into a native Google Doc when the
  // metadata mimeType is `application/vnd.google-apps.document` while the
  // body retains its original Office mime type.
  const boundary = `pdp-${Date.now()}`;
  const folderId = process.env.GOOGLE_DRIVE_PDP_FOLDER_ID?.trim();
  const docName = fileName.replace(/\.docx$/i, "");
  const metadata: Record<string, unknown> = {
    name: docName,
    mimeType: "application/vnd.google-apps.document",
  };
  if (folderId) metadata.parents = [folderId];
  const parts = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`),
    Buffer.from(JSON.stringify(metadata)),
    Buffer.from(`\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--`),
  ]);

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": parts.length.toString(),
      },
      body: parts,
    }
  );

  if (!uploadRes.ok) {
    const errText = await uploadRes.text();
    console.error("Google Drive upload failed:", uploadRes.status, errText);
    return null;
  }

  const data = (await uploadRes.json()) as { id: string; webViewLink: string };
  return { fileId: data.id, webViewLink: data.webViewLink };
}

export interface DriveFileSummary {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  mimeType: string;
  webViewLink?: string;
}

/**
 * Search the user's Drive. `q` is a Drive v3 query string.
 * Returns up to 20 files, newest first.
 */
export async function searchDriveFiles(
  userId: string,
  q: string
): Promise<DriveFileSummary[] | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const params = new URLSearchParams({
    q,
    fields: "files(id,name,createdTime,modifiedTime,mimeType,webViewLink)",
    orderBy: "modifiedTime desc",
    pageSize: "20",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true",
  });

  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params.toString()}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    console.error("Drive search failed:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { files?: DriveFileSummary[] };
  return data.files ?? [];
}


/**
 * Replace the content of an existing Google Doc with a .docx, keeping its id
 * and link. Returns false when the caller can't write to that file (e.g. it
 * lives in someone else's Drive) so the caller can fall back to a new file.
 */
export async function replaceDriveDocContent(
  userId: string,
  fileId: string,
  buffer: Buffer,
  mimeType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
): Promise<UploadResult | null> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return null;

  const res = await fetch(
    `https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&supportsAllDrives=true&fields=id,webViewLink`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": mimeType,
        "Content-Length": buffer.length.toString(),
      },
      body: new Uint8Array(buffer),
    }
  );
  if (!res.ok) {
    console.error("Google Drive content update failed:", res.status, await res.text());
    return null;
  }
  const data = (await res.json()) as { id: string; webViewLink: string };
  return { fileId: data.id, webViewLink: data.webViewLink };
}

/**
 * Give someone access to a Drive file without emailing them (the app sends its
 * own notification). Best-effort: returns false instead of throwing.
 */
export async function shareDriveFile(
  userId: string,
  fileId: string,
  email: string,
  role: "reader" | "commenter" | "writer" = "commenter"
): Promise<boolean> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return false;
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/permissions?sendNotificationEmail=false&supportsAllDrives=true`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ type: "user", role, emailAddress: email }),
    }
  );
  if (!res.ok) {
    console.error("Google Drive share failed:", res.status, await res.text());
    return false;
  }
  return true;
}

export type DriveTextResult =
  | { ok: true; name: string; format: "gdoc" | "docx"; content: Buffer | string }
  | { ok: false; reason: "no-token" | "no-access" | "unsupported" };

const GDOC_MIME = "application/vnd.google-apps.document";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * Fetch a document's raw content with the acting user's token: a native Google
 * Doc is exported as HTML (keeps table structure), an uploaded .docx is
 * downloaded as-is. Anything else (PDF, Sheets, …) is "unsupported".
 */
export async function readDriveDocument(userId: string, fileId: string): Promise<DriveTextResult> {
  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return { ok: false, reason: "no-token" };
  const headers = { Authorization: `Bearer ${accessToken}` };
  const id = encodeURIComponent(fileId);

  const metaRes = await fetch(
    `https://www.googleapis.com/drive/v3/files/${id}?fields=name,mimeType&supportsAllDrives=true`,
    { headers }
  );
  if (!metaRes.ok) return { ok: false, reason: "no-access" };
  const meta = (await metaRes.json()) as { name: string; mimeType: string };

  if (meta.mimeType === GDOC_MIME) {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${id}/export?mimeType=${encodeURIComponent("text/html")}`,
      { headers }
    );
    if (!res.ok) return { ok: false, reason: "no-access" };
    return { ok: true, name: meta.name, format: "gdoc", content: await res.text() };
  }
  if (meta.mimeType === DOCX_MIME) {
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, { headers });
    if (!res.ok) return { ok: false, reason: "no-access" };
    return { ok: true, name: meta.name, format: "docx", content: Buffer.from(await res.arrayBuffer()) };
  }
  return { ok: false, reason: "unsupported" };
}
