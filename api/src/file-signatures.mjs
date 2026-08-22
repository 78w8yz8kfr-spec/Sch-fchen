const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const ZIP_CENTRAL_SIGNATURE = 0x02014b50;
const ZIP_END_SIGNATURE = 0x06054b50;
const MAXIMUM_ZIP_ENTRIES = 2048;
const MAXIMUM_UNCOMPRESSED_BYTES = 50_000_000;

function startsWith(content, signature) {
  return content.length >= signature.length && content.subarray(0, signature.length).equals(signature);
}

function zipEntries(content) {
  if (content.length < 22 || !startsWith(content, Buffer.from([0x50, 0x4b]))) return null;
  const minimumOffset = Math.max(0, content.length - 22 - 65535);
  let endOffset = -1;
  for (let offset = content.length - 22; offset >= minimumOffset; offset -= 1) {
    if (content.readUInt32LE(offset) === ZIP_END_SIGNATURE) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) return null;

  const diskNumber = content.readUInt16LE(endOffset + 4);
  const centralDisk = content.readUInt16LE(endOffset + 6);
  const entriesOnDisk = content.readUInt16LE(endOffset + 8);
  const entryCount = content.readUInt16LE(endOffset + 10);
  const centralSize = content.readUInt32LE(endOffset + 12);
  const centralOffset = content.readUInt32LE(endOffset + 16);
  if (
    diskNumber !== 0
    || centralDisk !== 0
    || entriesOnDisk !== entryCount
    || entryCount < 1
    || entryCount > MAXIMUM_ZIP_ENTRIES
    || centralOffset + centralSize > endOffset
  ) return null;

  const names = new Set();
  let offset = centralOffset;
  let uncompressedTotal = 0;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > endOffset || content.readUInt32LE(offset) !== ZIP_CENTRAL_SIGNATURE) return null;
    const flags = content.readUInt16LE(offset + 8);
    const method = content.readUInt16LE(offset + 10);
    const compressedSize = content.readUInt32LE(offset + 20);
    const uncompressedSize = content.readUInt32LE(offset + 24);
    const nameLength = content.readUInt16LE(offset + 28);
    const extraLength = content.readUInt16LE(offset + 30);
    const commentLength = content.readUInt16LE(offset + 32);
    const nextOffset = offset + 46 + nameLength + extraLength + commentLength;
    if (
      nextOffset > endOffset
      || nameLength < 1
      || (flags & 0x1) !== 0
      || ![0, 8].includes(method)
      || compressedSize === 0xffffffff
      || uncompressedSize === 0xffffffff
    ) return null;

    const nameBytes = content.subarray(offset + 46, offset + 46 + nameLength);
    let name;
    try {
      name = new TextDecoder("utf-8", { fatal: true }).decode(nameBytes);
    } catch {
      return null;
    }
    if (
      name.includes("\\")
      || name.includes("\u0000")
      || name.startsWith("/")
      || name.split("/").includes("..")
      || names.has(name)
    ) return null;
    names.add(name);
    uncompressedTotal += uncompressedSize;
    if (uncompressedTotal > MAXIMUM_UNCOMPRESSED_BYTES) return null;
    offset = nextOffset;
  }
  if (offset !== centralOffset + centralSize) return null;
  return names;
}

function officeDocumentIsValid(content, rootPart) {
  const entries = zipEntries(content);
  if (!entries) return false;
  const lowerNames = new Set([...entries].map((name) => name.toLowerCase()));
  if (
    !entries.has("[Content_Types].xml")
    || !entries.has("_rels/.rels")
    || !entries.has(rootPart)
  ) return false;
  return ![...lowerNames].some((name) => (
    name.endsWith("vbaproject.bin")
    || name.includes("/activex/")
    || name.includes("/embeddings/")
    || name.endsWith(".exe")
    || name.endsWith(".dll")
  ));
}

export function fileSignatureMatches(content, mimeType) {
  if (!Buffer.isBuffer(content) || content.length < 1) return false;
  if (mimeType === "application/pdf") {
    return startsWith(content, Buffer.from("%PDF-", "ascii"));
  }
  if (mimeType === "image/jpeg") {
    return content.length >= 5
      && content[0] === 0xff
      && content[1] === 0xd8
      && content[2] === 0xff
      && content.at(-2) === 0xff
      && content.at(-1) === 0xd9;
  }
  if (mimeType === "image/png") return startsWith(content, PNG_SIGNATURE);
  if (mimeType === "image/webp") {
    return content.length >= 12
      && content.subarray(0, 4).toString("ascii") === "RIFF"
      && content.subarray(8, 12).toString("ascii") === "WEBP";
  }
  if (mimeType === "text/plain") {
    if (content.includes(0)) return false;
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(content);
      return true;
    } catch {
      return false;
    }
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet") {
    return officeDocumentIsValid(content, "xl/workbook.xml");
  }
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return officeDocumentIsValid(content, "word/document.xml");
  }
  return false;
}
