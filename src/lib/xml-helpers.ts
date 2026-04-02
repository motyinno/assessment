let paraIdCounter = 0x0000f000;

function nextParaId(): string {
  paraIdCounter++;
  return paraIdCounter.toString(16).toUpperCase().padStart(8, "0");
}

export function resetParaIdCounter() {
  paraIdCounter = 0x0000f000;
}

export function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface ParagraphOpts {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  size?: number;
}

export function mkP(text: string, opts?: ParagraphOpts): string {
  const { bold, italic, underline, size = 24 } = opts || {};
  const bTag = bold ? '<w:b w:val="1"/><w:bCs w:val="1"/>' : "";
  const iTag = italic ? '<w:i w:val="1"/><w:iCs w:val="1"/>' : "";
  const uTag = underline ? '<w:u w:val="single"/>' : "";
  return (
    '<w:p w:rsidR="00000000" w:rsidDel="00000000" w:rsidP="00000000" w:rsidRDefault="00000000" w:rsidRPr="00000000" w14:paraId="' +
    nextParaId() +
    '">' +
    '<w:pPr><w:widowControl w:val="0"/><w:spacing w:line="240" w:lineRule="auto"/></w:pPr>' +
    '<w:r><w:rPr><w:rFonts w:ascii="Mulish" w:cs="Mulish" w:eastAsia="Mulish" w:hAnsi="Mulish"/>' +
    bTag +
    iTag +
    '<w:sz w:val="' +
    size +
    '"/><w:szCs w:val="' +
    size +
    '"/>' +
    uTag +
    '<w:rtl w:val="0"/></w:rPr>' +
    '<w:t xml:space="preserve">' +
    escXml(text) +
    "</w:t></w:r></w:p>"
  );
}

export function mkBullet(text: string, opts?: { size?: number }): string {
  const size = opts?.size || 22;
  return (
    '<w:p w:rsidR="00000000" w:rsidDel="00000000" w:rsidP="00000000" w:rsidRDefault="00000000" w:rsidRPr="00000000" w14:paraId="' +
    nextParaId() +
    '">' +
    '<w:pPr><w:widowControl w:val="0"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="8"/></w:numPr><w:ind w:left="720" w:hanging="360"/></w:pPr>' +
    '<w:r><w:rPr><w:rFonts w:ascii="Mulish" w:cs="Mulish" w:eastAsia="Mulish" w:hAnsi="Mulish"/><w:sz w:val="' +
    size +
    '"/><w:szCs w:val="' +
    size +
    '"/><w:highlight w:val="white"/><w:rtl w:val="0"/></w:rPr>' +
    '<w:t xml:space="preserve">' +
    escXml(text) +
    "</w:t></w:r></w:p>"
  );
}

export function mkCell(inner: string): string {
  return (
    "<w:tc><w:tcPr>" +
    '<w:shd w:fill="auto" w:val="clear"/><w:tcMar>' +
    '<w:top w:w="100.0" w:type="dxa"/><w:left w:w="100.0" w:type="dxa"/>' +
    '<w:bottom w:w="100.0" w:type="dxa"/><w:right w:w="100.0" w:type="dxa"/>' +
    '</w:tcMar><w:vAlign w:val="top"/></w:tcPr>' +
    inner +
    "</w:tc>"
  );
}

export function mkRow(
  catName: string,
  desc: string,
  contentXml: string
): string {
  return (
    "<w:tr><w:trPr>" +
    '<w:cantSplit w:val="0"/><w:trHeight w:val="1223.90625" w:hRule="atLeast"/><w:tblHeader w:val="0"/>' +
    "</w:trPr>" +
    mkCell(mkP(catName)) +
    mkCell(mkP(desc)) +
    mkCell(contentXml) +
    "</w:tr>"
  );
}
