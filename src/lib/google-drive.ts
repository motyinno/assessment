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

