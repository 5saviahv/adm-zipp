const { Constants } = require("../util");

// We have to convert BigInt to Number (ADM-ZIP internal requirements, at the moment)
// but built in number is not able to be precise if number is above 53-bit.
const toNumber = (val) => {
    const ret = typeof val === "number" ? val : Number(val);
    if (ret > Number.MAX_SAFE_INTEGER) throw "Big Int is To big";
    return ret;
};

const ID_ZIP64_OFFSETS = {
    UNCOMPRESSED: 0, // uncompressed size of a file
    COMPRESSED: 8, // compressed size of a file
    OFFSET: 16, // offset to local header
    DISKNUM: 24, // start disk Number
    _len: 28 // header length
};

function ExtraHeader() {
    this._raw = new Map();
    Object.defineProperty(this, "length", {
        get: function () {
            let length = 0;
            for (const data of this._raw.values()) {
                length += data.length + 4;
            }
            return length;
        }
    });
    Object.defineProperty(this, "size", {
        get: function () {
            return this._raw.size;
        }
    });
}

// Handle register

ExtraHeader.prototype.get = function (id) {
    return this._raw.get(id);
};

ExtraHeader.prototype.has = function (id) {
    return this._raw.has(id);
};

ExtraHeader.prototype.delete = function (id) {
    return this._raw.delete(id);
};

ExtraHeader.prototype.set = function (id, val) {
    if (val instanceof Uint8Array) {
        this._raw.set(id, Buffer.from(val));
    }
};

// Handle Buffer

ExtraHeader.prototype.parseBuffer = function (data) {
    let offset = 0;
    let signature, size, part;
    while (offset < data.length) {
        signature = data.readUInt16LE(offset);
        offset += 2;
        size = data.readUInt16LE(offset);
        offset += 2;
        part = data.slice(offset, offset + size);
        offset += size;
        // Store
        this._raw.set(signature, part);
    }
};

ExtraHeader.prototype.generateBuffer = function () {
    const result = Buffer.alloc(this.length || 0);
    let offset = 0;

    for (const [signature, data] of this._raw.entries()) {
        offset = result.writeUInt16LE(signature, offset);
        offset = result.writeUInt16LE(data.length, offset);
        offset += data.copy(result, offset);
    }

    return result;
};

// Zip64 - Extended Information

/**
 *
 * @returns {object} - zip64 header values
 *
 */
ExtraHeader.prototype.GetZip64 = function (centralHeader) {
    const zip64 = {};
    const big = (val) => (typeof val === "bigint" ? val : BigInt(val || 0));
    if (this.has(Constants.ID_ZIP64)) {
        const data = this.get(Constants.ID_ZIP64);
        if (data.length >= ID_ZIP64_OFFSETS.COMPRESSED) {
            zip64.size = toNumber(data.readBigInt64LE(ID_ZIP64_OFFSETS.UNCOMPRESSED));
        }
        if (data.length >= ID_ZIP64_OFFSETS.OFFSET) {
            zip64.compressedSize = toNumber(data.readBigInt64LE(ID_ZIP64_OFFSETS.COMPRESSED));
        }
        if (data.length >= ID_ZIP64_OFFSETS.DISKNUM) {
            zip64.offset = toNumber(data.readBigInt64LE(ID_ZIP64_OFFSETS.OFFSET));
        }
        if (data.length >= ID_ZIP64_OFFSETS._len) {
            zip64.diskNumStart = toNumber(data.readUInt32LE(ID_ZIP64_OFFSETS.DISKNUM));
        }
    }
    if (typeof centralHeader == "object") {
        if ("size" in zip64 && centralHeader.size === Constants.EF_ZIP64_OR_32) {
            centralHeader.size = zip64.size;
        }
        if ("compressedSize" in zip64 && centralHeader.compressedSize === Constants.EF_ZIP64_OR_32) {
            centralHeader.compressedSize = zip64.compressedSize;
        }
        if ("offset" in zip64 && centralHeader.offset === Constants.EF_ZIP64_OR_32) {
            centralHeader.offset = zip64.offset;
        }
        if ("diskNumStart" in zip64 && centralHeader.diskNumStart === Constants.EF_ZIP64_OR_16) {
            centralHeader.diskNumStart = zip64.diskNumStart;
        }
    }

    return zip64;
};

/**
 * Set Zip64 extra header values
 *
 * @param {object} centralHeader - zip64 header values
 * @param {(number|bigint)} zip64.size - uncompressed file size
 * @param {(number|bigint)} zip64.compressedSize - compressed file size
 * @param {(number|bigint)} zip64.offset - file header offset
 * @param {(number|bigint)} zip64.diskNumStart - disk number where file started
 */
ExtraHeader.prototype.SetZip64 = function (centralHeader) {
    let length = 0;
    const big = (val) => (typeof val === "bigint" ? val : BigInt(val || 0));

    if ("size" in centralHeader) length = ID_ZIP64_OFFSETS.COMPRESSED;
    if ("compressedSize" in centralHeader) length = ID_ZIP64_OFFSETS.OFFSET;
    if ("offset" in centralHeader) length = ID_ZIP64_OFFSETS.DISKNUM;
    if ("diskNumStart" in centralHeader) length = ID_ZIP64_OFFSETS._len;

    if (length > 0) {
        const result = Buffer.alloc(length);

        if (result.length >= ID_ZIP64_OFFSETS.COMPRESSED) {
            result.writeBigInt64LE(big(centralHeader.size), ID_ZIP64_OFFSETS.UNCOMPRESSED);
            if (centralHeader.size >= 0x4fffffff) centralHeader.size = Constants.EF_ZIP64_OR_32;
        }
        if (result.length >= ID_ZIP64_OFFSETS.OFFSET) {
            result.writeBigInt64LE(big(centralHeader.compressedSize), ID_ZIP64_OFFSETS.COMPRESSED);
            if (centralHeader.compressedSize >= 0x4fffffff) centralHeader.compressedSize = Constants.EF_ZIP64_OR_32;
        }
        if (result.length >= ID_ZIP64_OFFSETS.DISKNUM) {
            result.writeBigInt64LE(big(centralHeader.offset), ID_ZIP64_OFFSETS.OFFSET);
            if (centralHeader.offset >= 0x4fffffff) centralHeader.offset = Constants.EF_ZIP64_OR_32;
        }
        if (result.length >= ID_ZIP64_OFFSETS._len) {
            result.writeBigInt64LE(big(centralHeader.diskNumStart), ID_ZIP64_OFFSETS.DISKNUM);
            if (centralHeader.diskNumStart >= 0x4fff) centralHeader.diskNumStart = Constants.EF_ZIP64_OR_32;
        }

        this.set(Constants.ID_ZIP64, result);
    } else {
        this.delete(Constants.ID_ZIP64);
    }
};

module.exports = { ExtraHeader };
