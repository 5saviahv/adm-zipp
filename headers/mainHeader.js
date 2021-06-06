var Utils = require("../util"),
    Constants = Utils.Constants;

/* The entries in the end of central directory */

function mainHeader() {
    this.zip64format = false; // zip64 support
    this.size = 0; // CDR size
    this.offset = 0; // CDR offset in file
    this.commentLength = 0;
    this.zip64format = false;
    this.ThisDisk = 0; // Used with split files, it has to be 0
    this.zip64_ext_data = Buffer.alloc(0);

    // for internal use
    this._needed = 20;
    this._volumeEntries = this._totalEntries = 0;
}

mainHeader.prototype = {
    // minimum version needed for extraction
    get needed() {
        return Math.max(this.isZIP64 ? 45 : 20, this._needed);
    },

    get diskEntries() {
        return this._volumeEntries;
    },
    set diskEntries(/*Number*/ val) {
        this._volumeEntries = val;
    },

    get totalEntries() {
        return this._totalEntries;
    },
    set totalEntries(/*Number*/ val) {
        this._totalEntries = val;
    },

    get isZIP64() {
        return (
            (this.zip64format && this.diskEntries > 0) ||
            this.disk_number >= Constants.ZIP64_OR_8 ||
            this.diskEntries >= Constants.ZIP64_OR_16 ||
            this.totalEntries >= Constants.ZIP64_OR_16 ||
            this.size >= Constants.ZIP64_OR_32 ||
            this.offset >= Constants.ZIP64_OR_32
        );
    },

    get mainHeaderSize() {
        // zip64 headers are not written if there are no entries
        const zip64HeaderSize = !this.isZIP64 ? 0 : Constants.ZIP64ENDHDR + Constants.ZIP64LOCHDR + this.zip64_ext_data.length;
        return zip64HeaderSize + Constants.ENDHDR + this.commentLength;
    }
};

mainHeader.prototype.ParseEcd64 = function (/*Buffer*/ data, /* Number */ pos) {
    // data should be 56+ bytes and start with "PK 06 06"

    if (data.length < pos + Constants.ZIP64ENDHDR || data.readUInt32LE(pos) !== Constants.ZIP64ENDSIG) {
        throw new Error(Utils.Errors.INVALID_END);
    }

    this.zip64format = true;

    //  1. size of zip64 end of central directory record
    const cdr_size = Utils.readUInt64LE(data, pos + Constants.ZIP64ENDSIZE);

    //  2. version made by
    this.made = data.readUInt16LE(pos + Constants.ZIP64ENDVEM);
    //  3. version needed to extract
    this.needed = data.readUInt16LE(pos + Constants.ZIP64ENDVER);

    //  4. number of this disk
    this.ThisDisk = data.readUInt32LE(pos + Constants.ZIP64ENDDSK);
    //  5. number of the disk with the start of the central directory
    this.cdDisk = data.readUInt32LE(pos + Constants.ZIP64ENDDSKDIR);

    //  6. total number of entries in the central directory on this disk
    this.diskEntries = Utils.readUInt64LE(data, pos + Constants.ZIP64ENDSUB);
    //  7. total number of entries in the central directory
    this.totalEntries = Utils.readUInt64LE(data, pos + Constants.ZIP64ENDTOT);

    //  8. size of the central directory
    this.size = Utils.readUInt64LE(data, pos + Constants.ZIP64ENDSIZ);
    //  9. offset of start of central directory with respect to the starting disk number
    this.offset = Utils.readUInt64LE(data, pos + Constants.ZIP64ENDOFF);

    // zip64 extensible data sector
    this.zip64_ext_data = Buffer.from(data.slice(pos + Constants.ZIP64EXTRA, pos + Constants.ZIP64ENDLEAD + cdr_size));
};

mainHeader.prototype.Parse_Locator = function (/*Buffer*/ data, /* Number */ pos) {
    if (data.length < pos + Constants.ZIP64LOCHDR || data.readUInt32LE(pos) !== Constants.ZIP64LOCSIG) {
        return null;
    } else {
        const out = {};

        // Read "Zip64 end of central directory locator" - 4.3.15
        // 1. disk where CDR starts
        out.Ecd64Disk = data.readUInt32LE(pos + Constants.ZIP64LOCCDR);
        // 2. relative offset of the zip64 end of central directory record disk where CDR starts
        out.Ecd64Offset = Utils.readUInt64LE(data, pos + Constants.ZIP64LOCOFF);
        // 3. disk where CDR starts
        out.NumDisks = data.readUInt32LE(pos + Constants.ZIP64LOCDISKS);

        return out;
    }
};

mainHeader.prototype.ParseEcd32 = function (/*Buffer*/ data, pos) {
    // data should be at least 22 bytes and start with "PK 05 06"
    if (data.length < pos + Constants.ENDHDR || data.readUInt32LE(pos) !== Constants.ENDSIG) {
        throw new Error(Utils.Errors.INVALID_END);
    }
    // 1. number of this disk
    this.ThisDisk = data.readUInt16LE(pos + Constants.ENDDSK);
    // 2. number of the disk where central directory starts
    this.cdDisk = data.readUInt16LE(pos + Constants.ENDCDR);
    // 3. number of entries on this volume
    this.diskEntries = data.readUInt16LE(pos + Constants.ENDSUB);
    // 4. total number of entries
    this.totalEntries = data.readUInt16LE(pos + Constants.ENDTOT);
    // 5. central directory size in bytes
    this.size = data.readUInt32LE(pos + Constants.ENDSIZ);
    // 6. offset of first CEN header
    this.offset = data.readUInt32LE(pos + Constants.ENDOFF);
    // 7. zip file comment length
    this.commentLength = data.readUInt16LE(pos + Constants.ENDCOM);
};

/**
 * Read "End of central directory record"
 *
 * @param  {buffer} data - spliced buffer
 * @return {object} returns header object
 */
mainHeader.prototype.loadFromBinary = function (/*Buffer*/ data) {
    this.ParseEcd32(data, 0);
};

/**
 * @return {buffer} generate mainHeaders binary representation
 */
mainHeader.prototype.toBinary = function (comment, options) {
    // passing current object to all subfunctions
    const self = this;
    // just in case
    comment = comment || Buffer.alloc(0);
    self.commentLength = comment.length;
    // create main header buffer
    const buf = Buffer.alloc(this.mainHeaderSize);

    function Zip64_ENDCDR(/* buffer */ b, /* Number */ offset) {
        // "PK 06 06" signature
        b.writeUInt32LE(Constants.ZIP64ENDSIG, offset + 0);
        //  1. size of zip64 end of central directory record
        Utils.writeUInt64LE(b, offset + Constants.ZIP64ENDSIZE, Constants.ZIP64ENDHDR - Constants.ZIP64ENDLEAD + self.zip64_ext_data.length);

        //  2. version made by
        b.writeUInt16LE(self.made, offset + Constants.ZIP64ENDVEM);
        //  3. version needed to extract
        b.writeUInt16LE(self.needed, offset + Constants.ZIP64ENDVER);

        //  4. number of this disk
        b.writeUInt32LE(self.ThisDisk, offset + Constants.ZIP64ENDDSK);
        //  5. number of the disk with the start of the central directory
        b.writeUInt32LE(self.ThisDisk, offset + Constants.ZIP64ENDDSKDIR);

        //  6. total number of entries in the central directory on this disk
        Utils.writeUInt64LE(b, offset + Constants.ZIP64ENDSUB, self.diskEntries);
        //  7. total number of entries in the central directory
        Utils.writeUInt64LE(b, offset + Constants.ZIP64ENDTOT, self.totalEntries);
        //  8. size of the central directory
        Utils.writeUInt64LE(b, offset + Constants.ZIP64ENDSIZ, self.size);
        //  9. offset of start of central directory with respect to the starting disk number
        Utils.writeUInt64LE(b, offset + Constants.ZIP64ENDOFF, self.offset);
        return offset + Constants.ZIP64ENDHDR + self.zip64_ext_data.length;
    }

    function Zip64_Zip64Locator(/* buffer */ b, /* Number */ offset) {
        // "PK 06 07" signature
        b.writeUInt32LE(Constants.ZIP64LOCSIG, offset + 0);

        // 1. disk where CDR starts
        b.writeUInt32LE(self.ThisDisk, offset + Constants.ZIP64LOCCDR);

        // 2. relative offset of the zip64 end of central directory recorddisk where CDR starts
        Utils.writeUInt64LE(b, offset + Constants.ZIP64LOCOFF, self.size + self.offset);

        // 3. disk where CDR starts
        b.writeUInt32LE(self.totaldisks ? self.totaldisks : 1, offset + Constants.ZIP64LOCDISKS);
        return offset + Constants.ZIP64LOCHDR;
    }

    function Zip_ENDCDR(/* buffer */ b, /* Number */ offset, /* boolean */ masked) {
        const maskme = (mask, value) => (!masked ? Math.min(mask, value) : mask);
        // "PK 05 06" signature
        b.writeUInt32LE(Constants.ENDSIG, offset + 0);
        // This Disk number
        b.writeUInt16LE(self.ThisDisk, offset + Constants.ENDDSK);
        // Disk where Central Directory begins
        b.writeUInt16LE(this.cdDisk, offset + Constants.ENDCDR);
        // number of entries on this volume
        b.writeUInt16LE(Math.min(Constants.ZIP64_OR_16, self.diskEntries), offset + Constants.ENDSUB);
        // total number of entries
        b.writeUInt16LE(Math.min(Constants.ZIP64_OR_16, self.totalEntries), offset + Constants.ENDTOT);
        // central directory size in bytes
        b.writeUInt32LE(maskme(Constants.ZIP64_OR_32, self.size), offset + Constants.ENDSIZ);
        // offset of first CEN header
        b.writeUInt32LE(maskme(Constants.ZIP64_OR_32, self.offset), offset + Constants.ENDOFF);
        // zip file comment length
        b.writeUInt16LE(self.commentLength, offset + Constants.ENDCOM);
        if (self.commentLength) {
            comment.copy(b, offset + Constants.ENDHDR); // add zip file comment
        }
        return offset + Constants.ENDHDR + self.commentLength;
    }

    // if there is no files, only regular zip end CDR has to be written
    if (!self.isZIP64) {
        Zip_ENDCDR(buf, 0, false);
    } else {
        let pos = Zip64_Zip64Locator(buf, Zip64_ENDCDR(buf, 0));
        pos = Zip_ENDCDR(buf, pos, true);
    }

    return buf;
};

mainHeader.prototype.toJSON = function () {
    // creates 0x0000 style output
    const offset = function (nr, len) {
        let offs = nr.toString(16).toUpperCase();
        while (offs.length < len) offs = "0" + offs;
        return "0x" + offs;
    };

    return {
        diskEntries: this.diskEntries,
        totalEntries: this.totalEntries,
        size: this.size + " bytes",
        offset: offset(this.offset, 4),
        commentLength: this.commentLength,
        zip64: this.isZIP64
    };
};

mainHeader.prototype.toString = function () {
    return JSON.stringify(this.toJSON(), null, "\t");
};

module.exports = mainHeader;
