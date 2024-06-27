var Utils = require("../util"),
    Constants = Utils.Constants;

/* The central directory file header */
module.exports = function () {
    var _verMade = 20, // v2.0
        _osType = 0,
        _version = 10, // v1.0
        _flags = 0,
        _method = 0,
        _time = 0,
        _crc = 0,
        _compressedSize = 0,
        _size = 0,
        _fnameLen = 0,
        _extraLen = 0,
        _comLen = 0,
        _diskStart = 0,
        _inattr = 0,
        _attr = 0,
        _offset = 0;

    _osType = Utils.isWin ? 0x0a : 0x03;

    // Set EFS flag since filename and comment fields are all by default encoded using UTF-8.
    // Without it file names may be corrupted for other apps when file names use unicode chars
    _flags |= Constants.FLG_EFS;

    const _localHeader = {
        extraLen: 0
    };

    const _zip64vals = {
        active: false,
        size: 0,
        compressedSize: 0,
        offset: 0,
        diskStart: 0
    };

    // casting
    // >>> removes sign and converts number 32-bit like they would be represented in memory (-1 becomes 0xffffffff)
    const int32 = (val) => val & 0xffffffff; // keep sign but make value 32-bit
    const noneg = (val) => Math.max(0, val); // don't let enter negative values
    const uint32 = (val) => val >>> 0; // keep sign but make value 32-bit
    const uint16 = (val) => (val >>> 0) & 0xffff;
    const uint8 = (val) => (val >>> 0) & 0xff;

    _time = Utils.fromDate2DOS(new Date());

    return {
        get made() {
            return _verMade;
        },
        set made(val) {
            _verMade = uint8(noneg(val));
        },

        get osType() {
            return _osType;
        },
        set osType(val) {
            _osType = uint8(noneg(val));
        },

        get version() {
            return _version;
        },
        set version(val) {
            _version = uint16(noneg(val));
        },

        get flags() {
            return _flags;
        },
        set flags(val) {
            _flags = val;
        },

        get flags_efs() {
            return (_flags & Constants.FLG_EFS) > 0;
        },
        set flags_efs(val) {
            if (val) {
                _flags |= Constants.FLG_EFS;
            } else {
                _flags &= ~Constants.FLG_EFS;
            }
        },

        get flags_desc() {
            return (_flags & Constants.FLG_DESC) > 0;
        },
        set flags_desc(val) {
            if (val) {
                _flags |= Constants.FLG_DESC;
            } else {
                _flags &= ~Constants.FLG_DESC;
            }
        },

        get method() {
            return _method;
        },
        set method(val) {
            switch (val) {
                case Constants.STORED:
                    this.version = 10;
                case Constants.DEFLATED:
                default:
                    this.version = 20;
            }
            _method = val;
        },

        get time() {
            return Utils.fromDOS2Date(this.timeval);
        },
        set time(val) {
            this.timeval = Utils.fromDate2DOS(val);
        },

        get timeval() {
            return _time;
        },
        set timeval(val) {
            _time = uint32(noneg(val));
        },

        get timeHighByte() {
            return uint8(_time >>> 8);
        },

        get zip64() {
            return _zip64vals.active || _size === -1 || _compressedSize === -1 || _offset === -1 || _diskStart === -1;
        },

        set zip64(val) {
            _zip64vals.active = !!val;
        },

        get crc() {
            return _crc;
        },
        set crc(val) {
            _crc = uint32(val);
        },

        get compressedSize() {
            return _compressedSize > -1 ? _compressedSize : _zip64vals.compressedSize;
        },

        set compressedSize(val) {
            if (val > 0xfffffffe) {
                _zip64vals.compressedSize = val;
                _compressedSize = -1;
            } else {
                _zip64vals.compressedSize = _compressedSize = noneg(val);
            }
        },

        get zip32_compressedSize() {
            return _compressedSize;
        },
        set zip32_compressedSize(val) {
            _compressedSize = val;
        },

        get size() {
            return _size > -1 ? _size : _zip64vals.size;
        },
        set size(val) {
            if (val > 0xfffffffe) {
                _zip64vals.size = val;
                _size = -1;
            } else {
                _zip64vals.size = _size = noneg(val);
            }
        },

        get zip32_size() {
            return _size > -1 ? _size : _zip64vals.size;
        },

        set zip32_size(val) {
            _size = val;
        },

        get fileNameLength() {
            return _fnameLen;
        },
        set fileNameLength(val) {
            _fnameLen = val;
        },

        get extraLength() {
            return _extraLen;
        },
        set extraLength(val) {
            _extraLen = val;
        },

        get extraLocalLength() {
            return _localHeader.extraLen;
        },
        set extraLocalLength(val) {
            _localHeader.extraLen = val;
        },

        get commentLength() {
            return _comLen;
        },
        set commentLength(val) {
            _comLen = val;
        },

        get diskNumStart() {
            return _diskStart > -1 ? _diskStart : _zip64vals.diskStart;
        },

        set diskNumStart(val) {
            if (val > 0xfffffffe) {
                _zip64vals.diskStart = val;
                _diskStart = -1;
            } else {
                _zip64vals.diskStart = _diskStart = noneg(val);
            }
        },

        get zip32_diskNumStart() {
            return _diskStart;
        },
        set zip32_diskNumStart(val) {
            _diskStart = val;
        },

        get inAttr() {
            return _inattr;
        },
        set inAttr(val) {
            _inattr = uint16(noneg(val));
        },

        get attr() {
            return _attr;
        },
        set attr(val) {
            _attr = uint32(noneg(val));
        },

        // get Unix file permissions
        get fileAttr() {
            return uint16(_attr >> 16) & 0xfff;
        },

        get offset() {
            return _offset > -1 ? _offset : _zip64vals.offset;
        },
        set offset(val) {
            if (val > 0xfffffffe) {
                _zip64vals.offset = val;
                _offset = -1;
            } else {
                _zip64vals.offset = _offset = noneg(val);
            }
        },

        get zip32_offset() {
            return _offset;
        },
        set zip32_offset(val) {
            _offset = val;
        },

        get encrypted() {
            return (_flags & Constants.FLG_ENC) === Constants.FLG_ENC;
        },

        get centralHeaderSize() {
            return Constants.CENHDR + _fnameLen + _extraLen + _comLen;
        },

        get realDataOffset() {
            return _offset + Constants.LOCHDR + _localHeader.fnameLen + _localHeader.extraLen;
        },

        get localHeader() {
            return _localHeader;
        },

        extra_getZip64ExtInfo: function (central = false) {
            const length = Constants.EF_ZIP64_RHO + (!central ? 0 : 8 + (_diskStart == -1 ? 4 : 0));
            const elems = Math.ceil(length / 8),
                data = Buffer.alloc(length);
            let offset;
            // values
            if (elems > 0) offset = Utils.writeUInt64LE(data, _zip64vals.size, 0);
            if (elems > 1) offset = Utils.writeUInt64LE(data, _zip64vals.compressedSize, offset);
            if (elems > 2) offset = Utils.writeUInt64LE(data, _zip64vals.offset, offset);
            if (elems > 3) offset = data.writeUInt32LE(_zip64vals.diskStart, offset);
        },

        extra_putZip64ExtInfo: function (data) {
            // data is without header
            if (data.length >= Constants.EF_ZIP64_SCOMP) {
                this.size = Utils.readUInt64LE(data, Constants.EF_ZIP64_SUNCOMP);
            }
            if (data.length >= Constants.EF_ZIP64_RHO) {
                this.compressedSize = Utils.readUInt64LE(data, Constants.EF_ZIP64_SCOMP);
            }
            if (data.length >= Constants.EF_ZIP64_DSN) {
                this.offset = Utils.readUInt64LE(data, Constants.EF_ZIP64_RHO);
            }
            if (data.length >= Constants.EF_ZIP64_DSN + 4) {
                this.diskNumStart = data.readUInt32LE(Constants.EF_ZIP64_DSN);
            }
        },

        loadLocalHeaderFromBinary: function (/*Buffer*/ input) {
            var data = input.slice(_offset, _offset + Constants.LOCHDR);
            // 30 bytes and should start with "PK\003\004"
            if (data.readUInt32LE(0) !== Constants.LOCSIG) {
                throw Utils.Errors.INVALID_LOC();
            }

            // version needed to extract
            _localHeader.version = data.readUInt16LE(Constants.LOCVER);
            // general purpose bit flag
            _localHeader.flags = data.readUInt16LE(Constants.LOCFLG);
            // compression method
            _localHeader.method = data.readUInt16LE(Constants.LOCHOW);
            // modification time (2 bytes time, 2 bytes date)
            _localHeader.time = data.readUInt32LE(Constants.LOCTIM);
            // uncompressed file crc-32 valu
            _localHeader.crc = data.readUInt32LE(Constants.LOCCRC);
            // compressed size
            _localHeader.compressedSize = Utils.readUInt32LEF(data, Constants.LOCSIZ);
            // uncompressed size
            _localHeader.size = Utils.readUInt32LEF(data, Constants.LOCLEN);
            // filename length
            _localHeader.fnameLen = data.readUInt16LE(Constants.LOCNAM);
            // extra field length
            _localHeader.extraLen = data.readUInt16LE(Constants.LOCEXT);

            // read extra data
            const extraStart = _offset + Constants.LOCHDR + _localHeader.fnameLen;
            const extraEnd = extraStart + _localHeader.extraLen;
            return input.slice(extraStart, extraEnd);
        },

        loadFromBinary: function (/*Buffer*/ data) {
            // data should be 46 bytes and start with "PK 01 02"
            if (data.length !== Constants.CENHDR || data.readUInt32LE(0) !== Constants.CENSIG) {
                throw Utils.Errors.INVALID_CEN();
            }
            // version made by
            _verMade = data.readUInt8(Constants.CENVEM);
            _osType = data.readUInt8(Constants.CENVEM + 1);
            // version needed to extract
            _version = data.readUInt16LE(Constants.CENVER);
            // encrypt, decrypt flags
            _flags = data.readUInt16LE(Constants.CENFLG);
            // compression method
            _method = data.readUInt16LE(Constants.CENHOW);
            // modification time (2 bytes time, 2 bytes date)
            _time = data.readUInt32LE(Constants.CENTIM);
            // uncompressed file crc-32 value
            _crc = data.readUInt32LE(Constants.CENCRC);
            // compressed size
            _compressedSize = Utils.readUInt32LEF(data, Constants.CENSIZ);
            // uncompressed size
            _size = Utils.readUInt32LEF(data, Constants.CENLEN);
            // filename length
            _fnameLen = data.readUInt16LE(Constants.CENNAM);
            // extra field length
            _extraLen = data.readUInt16LE(Constants.CENEXT);
            // file comment length
            _comLen = data.readUInt16LE(Constants.CENCOM);
            // volume number start
            _diskStart = Utils.readUInt16LEF(data, Constants.CENDSK);
            // internal file attributes
            _inattr = data.readUInt16LE(Constants.CENATT);
            // external file attributes
            _attr = data.readUInt32LE(Constants.CENATX);
            // LOC header offset
            _offset = Utils.readUInt32LEF(data, Constants.CENOFF);
        },

        localHeaderToBinary: function () {
            // LOC header size (30 bytes)
            var data = Buffer.alloc(Constants.LOCHDR);
            // "PK\003\004"
            data.writeUInt32LE(Constants.LOCSIG, 0);
            // version needed to extract
            data.writeUInt16LE(_version, Constants.LOCVER);
            // general purpose bit flag
            data.writeUInt16LE(_flags, Constants.LOCFLG);
            // compression method
            data.writeUInt16LE(_method, Constants.LOCHOW);
            // modification time (2 bytes time, 2 bytes date)
            data.writeUInt32LE(_time, Constants.LOCTIM);
            // uncompressed file crc-32 value
            data.writeUInt32LE(_crc, Constants.LOCCRC);
            // compressed size
            data.writeUInt32LE(uint32(_compressedSize), Constants.LOCSIZ);
            // uncompressed size
            data.writeUInt32LE(uint32(_size), Constants.LOCLEN);
            // filename length
            data.writeUInt16LE(_fnameLen, Constants.LOCNAM);
            // extra field length
            data.writeUInt16LE(_localHeader.extraLen, Constants.LOCEXT);
            return data;
        },

        centralHeaderToBinary: function () {
            // CEN header size (46 bytes)
            var data = Buffer.alloc(Constants.CENHDR + _fnameLen + _extraLen + _comLen);
            // "PK\001\002"
            data.writeUInt32LE(Constants.CENSIG, 0);
            // version made by
            data.writeUInt8(_verMade, Constants.CENVEM);
            data.writeUInt8(_osType, Constants.CENVEM + 1);
            // version needed to extract
            data.writeUInt16LE(_version, Constants.CENVER);
            // encrypt, decrypt flags
            data.writeUInt16LE(_flags, Constants.CENFLG);
            // compression method
            data.writeUInt16LE(_method, Constants.CENHOW);
            // modification time (2 bytes time, 2 bytes date)
            data.writeUInt32LE(_time, Constants.CENTIM);
            // uncompressed file crc-32 value
            data.writeUInt32LE(_crc, Constants.CENCRC);
            // compressed size
            data.writeUInt32LE(uint32(_compressedSize), Constants.CENSIZ);
            // uncompressed size
            data.writeUInt32LE(uint32(_size), Constants.CENLEN);
            // filename length
            data.writeUInt16LE(_fnameLen, Constants.CENNAM);
            // extra field length
            data.writeUInt16LE(_extraLen, Constants.CENEXT);
            // file comment length
            data.writeUInt16LE(_comLen, Constants.CENCOM);
            // volume number start
            data.writeUInt16LE(uint16(_diskStart), Constants.CENDSK);
            // internal file attributes
            data.writeUInt16LE(_inattr, Constants.CENATT);
            // external file attributes
            data.writeUInt32LE(_attr, Constants.CENATX);
            // LOC header offset
            data.writeUInt32LE(uint32(_offset), Constants.CENOFF);
            return data;
        },

        toJSON: function () {
            const bytes = function (nr) {
                return nr + " bytes";
            };

            const hex = (nr, len = 8) => "0x" + nr.toString(16).toUpperCase().padStart(len, "0");

            return {
                made: _verMade,
                osType: _osType,
                version: _version,
                flags: _flags,
                method: Utils.methodToString(_method),
                time: this.time,
                crc: hex(_crc, 8),
                compressedSize: bytes(_compressedSize),
                size: bytes(_size),
                fileNameLength: bytes(_fnameLen),
                extraLength: bytes(_extraLen),
                commentLength: bytes(_comLen),
                diskNumStart: _diskStart,
                inAttr: _inattr,
                exAttr: _attr,
                offset: _offset,
                centralHeaderSize: bytes(Constants.CENHDR + _fnameLen + _extraLen + _comLen)
            };
        },

        toString: function () {
            return JSON.stringify(this.toJSON(), null, "\t");
        }
    };
};
