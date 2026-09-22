// Zero-dependency reader for WoW client DB2 files in the WDC3, WDC4 and WDC5 formats.
//
// Written from the format description on https://wowdev.wiki/DB2 (no code copied). Column
// names and types come from a WoWDBDefs definition (./dbd.mjs), picked by the file's layout
// hash and build.
//
// Layout (all little-endian):
//   header             WDC5 adds `uint32 version; char schema[128]` after the magic
//   section_header[]   tact_key_hash u64, file_offset, record_count, string_table_size,
//                      offset_records_end, id_list_size, relationship_data_size,
//                      offset_map_id_count, copy_table_count
//   field_structure[]  { i16 size; u16 position } per field (size = 32 - bits)
//   field_storage[]    24 bytes per field: offset_bits u16, size_bits u16, additional_data_size,
//                      storage_type, then three type-specific u32s
//   pallet_data        per pallet / pallet-array field, in field order
//   common_data        per common-data field, in field order: { u32 id; u32 value }[]
//   (WDC4+)            for each encrypted section: u32 count; u32 ids[count]
//   per section, at file_offset:
//     records          record_count * record_size   (or, sparse: variable-length records
//                      up to offset_records_end)
//     string table     string_table_size bytes      (non-sparse only)
//     id_list          u32[id_list_size / 4]
//     copy_table       { u32 new_id; u32 source_id }[copy_table_count]
//     offset_map       { u32 offset; u16 size }[offset_map_id_count]   (sparse only)
//     relationship map u32 count, min_id, max_id; { u32 foreign_id; u32 record_index }[count]
//     offset_map_ids   u32[offset_map_id_count]                        (sparse only)
//
// Storage types: 0 none, 1 bitpacked, 2 common data, 3 pallet, 4 pallet array,
// 5 signed bitpacked. Encrypted sections (tact_key_hash != 0) whose record data is all
// zero bytes (key not shipped) are skipped and reported.

const STORAGE = { NONE: 0, BITPACKED: 1, COMMON: 2, PALLET: 3, PALLET_ARRAY: 4, BITPACKED_SIGNED: 5 };
export const STORAGE_NAMES = ["none", "bitpacked", "commonData", "pallet", "palletArray", "bitpackedSigned"];

const FLAG_SPARSE = 0x01;

/** Read `n` (<= 32) bits at absolute bit position `pos`, unsigned, little-endian bit order. */
function readBits(buf, pos, n) {
  if (n <= 0) return 0;
  const byte = pos >>> 3;
  const shift = pos & 7;
  const need = (shift + n + 7) >>> 3;
  let v = 0;
  let mul = 1;
  for (let k = 0; k < need; k++) {
    v += (buf[byte + k] ?? 0) * mul;
    mul *= 256;
  }
  v = Math.floor(v / 2 ** shift);
  return n === 32 ? v % 4294967296 : v % 2 ** n;
}

/** Read `n` (<= 64) bits as a BigInt. */
function readBitsBig(buf, pos, n) {
  let v = 0n;
  for (let k = 0; k < n; k += 32) {
    const take = Math.min(32, n - k);
    v |= BigInt(readBits(buf, pos + k, take)) << BigInt(k);
  }
  return v;
}

const f32 = new DataView(new ArrayBuffer(4));
/** float32 bits -> the shortest decimal that rounds to the same float32 (0.35, not 0.3499999940395355). */
function bitsToFloat(u) {
  f32.setUint32(0, u >>> 0, true);
  const v = f32.getFloat32(0, true);
  if (!Number.isFinite(v) || v === 0) return v === 0 ? 0 : v;
  for (let digits = 1; digits <= 9; digits++) {
    const candidate = Number(v.toPrecision(digits));
    if (Math.fround(candidate) === v) return candidate;
  }
  return v;
}

function signExtend(v, bits) {
  if (bits >= 53) return v;
  const half = 2 ** (bits - 1);
  return v >= half ? v - 2 ** bits : v;
}

/** Convert a raw unsigned value to the DBD column type (float / signed / unsigned). */
function convert(raw, field, storedBits) {
  if (typeof raw === "bigint") {
    let v = raw;
    if (field.signed && (field.size ?? 64) === 64 && v >= 1n << 63n) v -= 1n << 64n;
    return Number.isSafeInteger(Number(v)) ? Number(v) : v.toString();
  }
  if (field.type === "float") return bitsToFloat(raw);
  // Values stored in at least the column's width (raw fields, and the 32-bit words of
  // common/pallet data) keep only the column's low bits: a u8 column in a pallet word
  // 0x0002BF65 is 0x65 = 101. Values stored in fewer bits (bitpacked) are non-negative
  // unless the storage type is signed, which the caller already handled.
  const size = field.size ?? 32;
  if (storedBits >= size) {
    const v = raw % 2 ** size;
    return field.signed ? signExtend(v, size) : v;
  }
  return raw;
}

function readCString(buf, pos) {
  let end = pos;
  while (end < buf.length && buf[end] !== 0) end++;
  return { value: buf.toString("utf8", pos, end), end: end + 1 };
}

/** Read just enough of the header to pick a definition: { magic, tableHash, layoutHash, schemaString }. */
export function peekDb2(buf) {
  const magic = buf.toString("latin1", 0, 4);
  if (!["WDC3", "WDC4", "WDC5"].includes(magic)) throw new Error(`Unsupported DB2 magic ${JSON.stringify(magic)}`);
  let p = 4;
  let schemaString = null;
  if (magic === "WDC5") {
    const raw = buf.subarray(8, 136);
    const nul = raw.indexOf(0);
    schemaString = raw.toString("latin1", 0, nul < 0 ? 128 : nul);
    p = 136;
  }
  const hex = (v) => v.toString(16).toUpperCase().padStart(8, "0");
  return {
    magic,
    recordCount: buf.readUInt32LE(p),
    tableHash: hex(buf.readUInt32LE(p + 16)),
    layoutHash: hex(buf.readUInt32LE(p + 20)),
    schemaString,
  };
}

/**
 * Parse a DB2 file.
 *
 * @param {Buffer} buf
 * @param {{ fields: Array }} definition   a definition block from parseDbd/findDefinition
 * @returns {{ header: object, rows: object[], sections: object[], storage: object[], warnings: string[] }}
 *   rows are plain objects keyed by DBD field name; array fields are arrays. Each row has
 *   `ID`. Rows are sorted by ID.
 */
export function readDb2(buf, definition) {
  const warnings = [];
  const magic = buf.toString("latin1", 0, 4);
  if (!["WDC3", "WDC4", "WDC5"].includes(magic)) throw new Error(`Unsupported DB2 magic ${JSON.stringify(magic)}`);
  const wdcVersion = Number(magic[3]);
  let p = 4;
  const u32 = () => {
    const v = buf.readUInt32LE(p);
    p += 4;
    return v;
  };
  const u16 = () => {
    const v = buf.readUInt16LE(p);
    p += 2;
    return v;
  };
  const header = { magic };
  if (wdcVersion >= 5) {
    header.schemaVersion = u32();
    const raw = buf.subarray(p, p + 128);
    const nul = raw.indexOf(0);
    header.schemaString = raw.toString("latin1", 0, nul < 0 ? 128 : nul);
    p += 128;
  }
  Object.assign(header, {
    recordCount: u32(),
    fieldCount: u32(),
    recordSize: u32(),
    stringTableSize: u32(),
    tableHash: u32(),
    layoutHash: u32(),
    minId: u32(),
    maxId: u32(),
    locale: u32(),
    flags: u16(),
    idIndex: u16(),
    totalFieldCount: u32(),
    bitpackedDataOffset: u32(),
    lookupColumnCount: u32(),
    fieldStorageInfoSize: u32(),
    commonDataSize: u32(),
    palletDataSize: u32(),
    sectionCount: u32(),
  });
  header.tableHashHex = header.tableHash.toString(16).toUpperCase().padStart(8, "0");
  header.layoutHashHex = header.layoutHash.toString(16).toUpperCase().padStart(8, "0");
  const sparse = (header.flags & FLAG_SPARSE) !== 0;

  const sections = [];
  for (let s = 0; s < header.sectionCount; s++) {
    const tactKeyHash = buf.readBigUInt64LE(p);
    p += 8;
    sections.push({
      index: s,
      tactKeyHash: tactKeyHash.toString(16).toUpperCase().padStart(16, "0"),
      encrypted: tactKeyHash !== 0n,
      fileOffset: u32(),
      recordCount: u32(),
      stringTableSize: u32(),
      offsetRecordsEnd: u32(),
      idListSize: u32(),
      relationshipDataSize: u32(),
      offsetMapIdCount: u32(),
      copyTableCount: u32(),
    });
  }

  const fieldStructs = [];
  for (let f = 0; f < header.totalFieldCount; f++) {
    const size = buf.readInt16LE(p);
    const position = buf.readUInt16LE(p + 2);
    p += 4;
    fieldStructs.push({ size, position });
  }

  const storage = [];
  const storageCount = header.fieldStorageInfoSize / 24;
  for (let f = 0; f < storageCount; f++) {
    const s = {
      offsetBits: u16(),
      sizeBits: u16(),
      additionalDataSize: u32(),
      type: u32(),
      a: u32(),
      b: u32(),
      c: u32(),
    };
    storage.push(s);
  }

  // Pallet data, then common data, each split per field in field order.
  const palletStart = p;
  p += header.palletDataSize;
  const commonStart = p;
  p += header.commonDataSize;
  let palletOfs = palletStart;
  let commonOfs = commonStart;
  for (const s of storage) {
    if (s.type === STORAGE.PALLET || s.type === STORAGE.PALLET_ARRAY) {
      s.pallet = [];
      for (let q = 0; q < s.additionalDataSize; q += 4) s.pallet.push(buf.readUInt32LE(palletOfs + q));
      palletOfs += s.additionalDataSize;
    } else if (s.type === STORAGE.COMMON) {
      s.common = new Map();
      for (let q = 0; q < s.additionalDataSize; q += 8) {
        s.common.set(buf.readUInt32LE(commonOfs + q), buf.readUInt32LE(commonOfs + q + 4));
      }
      commonOfs += s.additionalDataSize;
      s.defaultValue = s.a;
    }
  }
  if (palletOfs !== commonStart) warnings.push(`pallet data size mismatch (${palletOfs - palletStart} vs ${header.palletDataSize})`);
  if (commonOfs !== p) warnings.push(`common data size mismatch (${commonOfs - commonStart} vs ${header.commonDataSize})`);

  // WDC4+: per encrypted section, the ids of its encrypted records.
  if (wdcVersion >= 4) {
    for (const sec of sections) {
      if (!sec.encrypted) continue;
      const count = u32();
      sec.encryptedIds = [];
      for (let k = 0; k < count; k++) sec.encryptedIds.push(u32());
    }
  }
  if (sections.length && sections[0].fileOffset !== p) {
    warnings.push(`first section starts at ${sections[0].fileOffset}, expected ${p}`);
  }

  // Map DBD fields to file fields: every field that isn't `noninline` is in the record.
  const inline = definition.fields.filter((f) => !f.noninline);
  if (inline.length !== header.totalFieldCount) {
    throw new Error(`definition has ${inline.length} inline fields, file has ${header.totalFieldCount}`);
  }
  const idField = definition.fields.find((f) => f.id);
  const relationField = definition.fields.find((f) => f.relation && f.noninline);
  const plan = inline.map((field, k) => {
    const st = storage[k] ?? { type: STORAGE.NONE, offsetBits: fieldStructs[k].position * 8, sizeBits: 32 - fieldStructs[k].size };
    const arrayLength = field.arrayLength ?? 1;
    let elementBits = 32 - fieldStructs[k].size;
    if (elementBits <= 0 || st.type !== STORAGE.NONE) elementBits = Math.floor(st.sizeBits / arrayLength);
    if (field.type === "string" || field.type === "locstring") elementBits = 32;
    return { field, st, arrayLength, elementBits, storageName: STORAGE_NAMES[st.type] ?? `unknown(${st.type})` };
  });
  for (const pl of plan) {
    if (pl.st.type > 5) throw new Error(`field ${pl.field.name}: unknown storage type ${pl.st.type}`);
  }

  // Strings in non-sparse tables: offsets are relative to the field's position, and the
  // string tables of all sections are addressed as one block that follows all records.
  const stringBlocks = []; // { start (logical), fileOffset, size }
  {
    let logical = 0;
    for (const sec of sections) {
      if (!sparse) {
        stringBlocks.push({ start: logical, fileOffset: sec.fileOffset + sec.recordCount * header.recordSize, size: sec.stringTableSize });
      }
      logical += sec.stringTableSize;
    }
  }
  const stringAt = (logicalOffset) => {
    for (const blk of stringBlocks) {
      if (logicalOffset >= blk.start && logicalOffset < blk.start + blk.size) {
        return readCString(buf, blk.fileOffset + (logicalOffset - blk.start)).value;
      }
    }
    return null;
  };

  const rows = [];
  let globalRecord = 0;
  for (const sec of sections) {
    const recordsStart = sec.fileOffset;
    const recordsBytes = sparse ? sec.offsetRecordsEnd - sec.fileOffset : sec.recordCount * header.recordSize;
    let q = sparse ? sec.offsetRecordsEnd : recordsStart + recordsBytes + sec.stringTableSize;
    const idList = [];
    for (let k = 0; k < sec.idListSize / 4; k++) idList.push(buf.readUInt32LE(q + k * 4));
    q += sec.idListSize;
    const copies = [];
    for (let k = 0; k < sec.copyTableCount; k++) copies.push([buf.readUInt32LE(q + k * 8), buf.readUInt32LE(q + k * 8 + 4)]);
    q += sec.copyTableCount * 8;
    const offsetMap = [];
    for (let k = 0; k < sec.offsetMapIdCount; k++) offsetMap.push({ offset: buf.readUInt32LE(q + k * 6), size: buf.readUInt16LE(q + k * 6 + 4) });
    q += sec.offsetMapIdCount * 6;
    const relation = new Map();
    if (sec.relationshipDataSize > 0) {
      const n = buf.readUInt32LE(q);
      for (let k = 0; k < n; k++) relation.set(buf.readUInt32LE(q + 12 + k * 8 + 4), buf.readUInt32LE(q + 12 + k * 8));
      q += sec.relationshipDataSize;
    }
    const offsetMapIds = [];
    for (let k = 0; k < sec.offsetMapIdCount; k++) offsetMapIds.push(buf.readUInt32LE(q + k * 4));
    q += sec.offsetMapIdCount * 4;
    sec.copies = copies.length;

    if (sec.encrypted) {
      let zero = true;
      for (let k = recordsStart; k < recordsStart + recordsBytes && zero; k++) if (buf[k] !== 0) zero = false;
      if (zero) {
        sec.skipped = "encrypted (key not available; record data is zeroed)";
        globalRecord += sec.recordCount;
        continue;
      }
      sec.decrypted = true;
    }

    const recordTotal = header.recordCount * header.recordSize;
    const sectionRows = [];
    for (let r = 0; r < sec.recordCount; r++) {
      const row = {};
      let recordByteStart;
      let cursorBits; // sparse: sequential reading
      if (sparse) {
        const entry = offsetMap[r];
        if (!entry || entry.size === 0) continue;
        recordByteStart = entry.offset;
        cursorBits = recordByteStart * 8;
      } else {
        recordByteStart = recordsStart + r * header.recordSize;
      }
      for (const pl of plan) {
        const { field, st, arrayLength, elementBits } = pl;
        const values = [];
        const isString = field.type === "string" || field.type === "locstring";
        if (sparse) {
          for (let e = 0; e < arrayLength; e++) {
            if (isString) {
              const s = readCString(buf, cursorBits >>> 3);
              values.push(s.value);
              cursorBits = s.end * 8;
            } else {
              const bits = field.size ?? 32;
              const raw = bits > 32 ? readBitsBig(buf, cursorBits, bits) : readBits(buf, cursorBits, bits);
              values.push(convert(raw, field, bits));
              cursorBits += bits;
            }
          }
        } else if (st.type === STORAGE.NONE) {
          for (let e = 0; e < arrayLength; e++) {
            const bitPos = recordByteStart * 8 + st.offsetBits + e * elementBits;
            if (isString) {
              // The offset is relative to the field itself. Seen from the logical layout
              // (all records of all sections, then all string tables), the field sits at
              // recordIndex * recordSize + byteInRecord, and the string block at recordTotal.
              const ofs = readBits(buf, bitPos, 32);
              const fieldLogical = (globalRecord + r) * header.recordSize + ((bitPos >>> 3) - recordByteStart);
              values.push(ofs === 0 ? "" : (stringAt(fieldLogical + ofs - recordTotal) ?? ""));
            } else {
              const raw = elementBits > 32 ? readBitsBig(buf, bitPos, elementBits) : readBits(buf, bitPos, elementBits);
              values.push(convert(raw, field, elementBits));
            }
          }
        } else if (st.type === STORAGE.BITPACKED || st.type === STORAGE.BITPACKED_SIGNED) {
          for (let e = 0; e < arrayLength; e++) {
            const bits = st.b;
            let raw = readBits(buf, recordByteStart * 8 + st.offsetBits + e * bits, bits);
            if (st.type === STORAGE.BITPACKED_SIGNED) {
              raw = signExtend(raw, bits);
              values.push(field.type === "float" ? bitsToFloat(raw >>> 0) : raw);
            } else {
              values.push(convert(raw, field, bits));
            }
          }
        } else if (st.type === STORAGE.COMMON) {
          // id resolved below; placeholder
          values.push(undefined);
        } else {
          const index = readBits(buf, recordByteStart * 8 + st.offsetBits, st.b);
          if (st.type === STORAGE.PALLET) {
            for (let e = 0; e < arrayLength; e++) values.push(convert(st.pallet[index] ?? 0, field, 32));
          } else {
            const card = st.c;
            for (let e = 0; e < arrayLength; e++) values.push(convert(st.pallet[index * card + e] ?? 0, field, 32));
          }
        }
        row[field.name] = field.arrayLength ? values : values[0];
      }
      // ID
      let id;
      if (sec.idListSize > 0) id = idList[r];
      else if (sparse && offsetMapIds.length) id = offsetMapIds[r];
      else if (idField && !idField.noninline) id = row[idField.name];
      else id = row[inline[header.idIndex]?.name];
      if (idField) row[idField.name] = id;
      // Common-data fields need the id.
      for (const pl of plan) {
        if (pl.st.type !== STORAGE.COMMON) continue;
        const raw = pl.st.common.has(id) ? pl.st.common.get(id) : pl.st.defaultValue;
        row[pl.field.name] = convert(raw, pl.field, 32);
      }
      if (relationField) row[relationField.name] = relation.get(r) ?? 0;
      sectionRows.push(row);
    }
    // Copy table: duplicate rows under new ids.
    if (copies.length) {
      const byId = new Map(sectionRows.map((row) => [row[idField?.name ?? "ID"], row]));
      for (const [newId, srcId] of copies) {
        const src = byId.get(srcId) ?? rows.find((row) => row[idField?.name ?? "ID"] === srcId);
        if (!src) {
          warnings.push(`section ${sec.index}: copy of missing row ${srcId} -> ${newId}`);
          continue;
        }
        sectionRows.push({ ...src, [idField?.name ?? "ID"]: newId });
      }
    }
    sec.rowsRead = sectionRows.length;
    rows.push(...sectionRows);
    globalRecord += sec.recordCount;
  }

  const idName = idField?.name ?? "ID";
  if (idName !== "ID") for (const row of rows) row.ID = row[idName];
  rows.sort((a, b) => a.ID - b.ID);
  const storageSummary = plan.map((pl) => ({
    field: pl.field.name,
    storage: pl.storageName,
    bits: pl.st.type === STORAGE.NONE ? pl.elementBits : pl.st.b,
    arrayLength: pl.field.arrayLength ?? null,
  }));
  // Ids listed as encrypted in sections that could not be read (WDC4+ lists them).
  const encryptedIds = new Set();
  for (const sec of sections) if (sec.skipped) for (const id of sec.encryptedIds ?? []) encryptedIds.add(id);
  return {
    header,
    rows,
    sections: sections.map(({ encryptedIds: ids, ...s }) => ({ ...s, encryptedIdCount: ids?.length ?? 0 })),
    storage: storageSummary,
    sparse,
    encryptedIds,
    warnings,
  };
}
