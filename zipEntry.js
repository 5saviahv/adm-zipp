const Utils = require("./util");
const Headers = require("./headers");
const Constants = Utils.Constants;
const Methods = require("./methods");

module.exports = function (/*Buffer*/ input) {
    const _entryHeader = new Headers.EntryHeader();
    let _entryName = Buffer.alloc(0);
    let _comment = Buffer.alloc(0);
    let _isDirectory = false;
    let uncompressedData = null;
    let _extra = Buffer.alloc(0);

    function getCompressedDataFromZip() {
        if (!input || !Buffer.isBuffer(input)) {
            return Buffer.alloc(0);
        }
        _entryHeader.loadDataHeaderFromBinary(input);
        return input.slice(_entryHeader.realDataOffset, _entryHeader.realDataOffset + _entryHeader.compressedSize);
    }

    function crc32OK(data) {
        // if bit 3 (0x08) of the general-purpose flags field is set, then the CRC-32 and file sizes are not known when the header is written
        if ((_entryHeader.flags & 0x8) !== 0x8) {
            if (Utils.crc32(data) !== _entryHeader.dataHeader.crc) {
                return false;
            }
        } else {
            // @TODO: load and check data descriptor header
            // The fields in the local header are filled with zero, and the CRC-32 and size are appended in a 12-byte structure
            // (optionally preceded by a 4-byte signature) immediately after the compressed data:
        }
        return true;
    }

    function decompress(/*Boolean*/ async, /*Function*/ callback, /*String, Buffer*/ pass) {
        if (typeof callback === "undefined" && typeof async === "string") {
            pass = async;
            async = void 0;
        }
        if (_isDirectory) {
            if (async && callback) {
                callback(Buffer.alloc(0), Utils.Errors.DIRECTORY_CONTENT_ERROR); //si added error.
            }
            return Buffer.alloc(0);
        }

        var compressedData = getCompressedDataFromZip();

        if (compressedData.length === 0) {
            // File is empty, nothing to decompress.
            if (async && callback) callback(compressedData);
            return compressedData;
        }

        if (_entryHeader.encripted) {
            if ("string" !== typeof pass && !Buffer.isBuffer(pass)) {
                throw new Error(Utils.Errors.PASS_PARAM);
            }
            compressedData = Methods.ZipCrypto.decrypt(compressedData, _entryHeader, pass);
        }

        var data = Buffer.alloc(_entryHeader.size);

        switch (_entryHeader.method) {
            case Utils.Constants.STORED:
                compressedData.copy(data);
                if (!crc32OK(data)) {
                    if (async && callback) callback(data, Utils.Errors.BAD_CRC); //si added error
                    throw new Error(Utils.Errors.BAD_CRC);
                } else {
                    //si added otherwise did not seem to return data.
                    if (async && callback) callback(data);
                    return data;
                }
            case Utils.Constants.DEFLATED:
                var inflater = new Methods.Inflater(compressedData);
                if (!async) {
                    const result = inflater.inflate(data);
                    result.copy(data, 0);
                    if (!crc32OK(data)) {
                        throw new Error(Utils.Errors.BAD_CRC + " " + _entryName.toString());
                    }
                    return data;
                } else {
                    inflater.inflateAsync(function (result) {
                        result.copy(result, 0);
                        if (callback) {
                            if (!crc32OK(result)) {
                                callback(result, Utils.Errors.BAD_CRC); //si added error
                            } else {
                                callback(result);
                            }
                        }
                    });
                }
                break;
            default:
                if (async && callback) callback(Buffer.alloc(0), Utils.Errors.UNKNOWN_METHOD);
                throw new Error(Utils.Errors.UNKNOWN_METHOD);
        }
    }

    function compress(/*Boolean*/ async, /*Function*/ callback) {
        if (async && typeof callback !== "function") {
            throw new Error(Utils.Errors.CALLBACK_FUNC);
        }

        if ((!uncompressedData || !uncompressedData.length) && Buffer.isBuffer(input)) {
            // no data set or the data wasn't changed to require recompression
            if (async && callback) callback(getCompressedDataFromZip());
            return getCompressedDataFromZip();
        }

        if (uncompressedData.length && !_isDirectory) {
            var compressedData;
            // Local file header
            switch (_entryHeader.method) {
                case Utils.Constants.STORED:
                    _entryHeader.compressedSize = _entryHeader.size;

                    compressedData = Buffer.alloc(uncompressedData.length);
                    uncompressedData.copy(compressedData);

                    if (async && callback) callback(compressedData);
                    return compressedData;
                default:
                case Utils.Constants.DEFLATED:
                    var deflater = new Methods.Deflater(uncompressedData);
                    if (!async) {
                        const deflated = deflater.deflate();
                        // if deflated bitstream is larger switch compression to "stored"
                        if (deflated.length > _entryHeader.size) {
                            _entryHeader.method = Utils.Constants.STORED;
                            _entryHeader.compressedSize = _entryHeader.size;

                            // return source buffer
                            return uncompressedData;
                        } else {
                            // make sure method is correct
                            _entryHeader.method = Utils.Constants.DEFLATED;
                            _entryHeader.compressedSize = deflated.length;
                            return deflated;
                        }
                    } else {
                        deflater.deflateAsync((deflated) => {
                            if (deflated.length > _entryHeader.size) {
                                _entryHeader.method = Utils.Constants.STORED;
                                _entryHeader.compressedSize = _entryHeader.size;

                                // return source buffer
                                callback(uncompressedData);
                            } else {
                                // make sure method is correct
                                _entryHeader.method = Utils.Constants.DEFLATED;
                                _entryHeader.compressedSize = deflated.length;
                                callback(deflated);
                            }
                        });
                    }
                    deflater = null;
                    break;
            }
        } else if (async) {
            callback(Buffer.alloc(0));
        } else {
            return Buffer.alloc(0);
        }
    }

    function readUInt64LE(buffer, offset) {
        return (buffer.readUInt32LE(offset + 4) << 4) + buffer.readUInt32LE(offset);
    }

    function parseExtra(data) {
        var offset = 0;
        var signature, size, part;
        while (offset < data.length) {
            signature = data.readUInt16LE(offset);
            offset += 2;
            size = data.readUInt16LE(offset);
            offset += 2;
            part = data.slice(offset, offset + size);
            offset += size;
            if (Constants.ID_ZIP64 === signature) {
                parseZip64ExtendedInformation(part);
            }
        }
    }

    //Override header field values with values from the ZIP64 extra field
    function parseZip64ExtendedInformation(data) {
        var size, compressedSize, offset, diskNumStart;

        if (data.length >= Constants.EF_ZIP64_SCOMP) {
            size = readUInt64LE(data, Constants.EF_ZIP64_SUNCOMP);
            if (_entryHeader.size === Constants.EF_ZIP64_OR_32) {
                _entryHeader.size = size;
            }
        }
        if (data.length >= Constants.EF_ZIP64_RHO) {
            compressedSize = readUInt64LE(data, Constants.EF_ZIP64_SCOMP);
            if (_entryHeader.compressedSize === Constants.EF_ZIP64_OR_32) {
                _entryHeader.compressedSize = compressedSize;
            }
        }
        if (data.length >= Constants.EF_ZIP64_DSN) {
            offset = readUInt64LE(data, Constants.EF_ZIP64_RHO);
            if (_entryHeader.offset === Constants.EF_ZIP64_OR_32) {
                _entryHeader.offset = offset;
            }
        }
        if (data.length >= Constants.EF_ZIP64_DSN + 4) {
            diskNumStart = data.readUInt32LE(Constants.EF_ZIP64_DSN);
            if (_entryHeader.diskNumStart === Constants.EF_ZIP64_OR_16) {
                _entryHeader.diskNumStart = diskNumStart;
            }
        }
    }

    return {
        /**
         * full entryname with path as string
         * @returns {string}
         */
        get entryName() {
            return _entryName.toString();
        },
        /**
         * full entryname with path as buffer
         * @returns {buffer}
         */
        get rawEntryName() {
            return _entryName;
        },
        /**
         * full entryname with path
         * @param {buffer, string} val - full entryname with path
         */
        set entryName(val) {
            _entryName = Utils.toBuffer(val);
            var lastChar = _entryName[_entryName.length - 1];
            _isDirectory = lastChar === 47 || lastChar === 92;
            _entryHeader.fileNameLength = _entryName.length;
        },

        /**
         * extra data as buffer
         * @returns {buffer}
         */
        get extra() {
            return _extra;
        },
        set extra(val) {
            _extra = val;
            _entryHeader.extraLength = val.length;
            parseExtra(val);
        },

        /**
         * file comment as string
         * @returns {string}
         */
        get comment() {
            return _comment.toString();
        },
        set comment(val) {
            _comment = Utils.toBuffer(val);
            _entryHeader.commentLength = _comment.length;
        },

        /**
         * file name without path
         * @returns {string}
         */
        get name() {
            var n = _entryName.toString();
            return _isDirectory
                ? n
                      .substr(n.length - 1)
                      .split("/")
                      .pop()
                : n.split("/").pop();
        },

        /**
         * is entry directory
         * @returns {boolean}
         */
        get isDirectory() {
            return _isDirectory;
        },

        getCompressedData: function () {
            return compress(false, null);
        },

        getCompressedDataAsync: function (/*Function*/ callback) {
            compress(true, callback);
        },
        /**
         * set file content
         *
         * @param {buffer, string} value - file content
         * @param {boolean} [storemethod] - if true method "store" is used
         */
        setData: function (/*Buffer*/ value, /*Boolean*/ storemethod) {
            uncompressedData = Utils.toBuffer(value);
            if (!_isDirectory && uncompressedData.length) {
                _entryHeader.size = uncompressedData.length;
                _entryHeader.method = !storemethod ? Utils.Constants.DEFLATED : Utils.Constants.STORED;
                _entryHeader.crc = Utils.crc32(value);
                _entryHeader.changed = true;
            } else {
                // folders and blank files should be stored
                _entryHeader.method = Utils.Constants.STORED;
            }
        },

        /**
         * get file content
         *
         * @param {buffer, string} pass - password
         */
        getData: function (pass) {
            if (_entryHeader.changed) {
                return uncompressedData;
            } else {
                return decompress(false, null, pass);
            }
        },

        /**
         * get file content [async]
         *
         * @param {function} callback
         * @param {buffer, string} pass - password
         */
        getDataAsync: function (/*Function*/ callback, pass) {
            if (_entryHeader.changed) {
                callback(uncompressedData);
            } else {
                decompress(true, callback, pass);
            }
        },

        set attr(attr) {
            _entryHeader.attr = attr;
        },
        get attr() {
            return _entryHeader.attr;
        },

        set header(/*Buffer*/ data) {
            _entryHeader.loadFromBinary(data);
        },

        /**
         * get entry data object
         */
        get header() {
            return _entryHeader;
        },

        /**
         * create entryheader binary
         *
         * @returns {buffer} - entry header in binary
         */
        packHeader: function () {
            // 1. create header (buffer)
            var header = _entryHeader.entryHeaderToBinary();
            var addpos = Utils.Constants.CENHDR;
            // 2. add file name
            _entryName.copy(header, addpos);
            addpos += _entryName.length;
            // 3. add extra data
            if (_entryHeader.extraLength) {
                _extra.copy(header, addpos);
                addpos += _entryHeader.extraLength;
            }
            // 4. add file comment
            if (_entryHeader.commentLength) {
                _comment.copy(header, addpos);
            }
            return header;
        },

        /**
         * get basic entry data for json
         * @returns {object}
         */
        toJSON: function () {
            const bytes = function (nr) {
                return "<" + ((nr && nr.length + " bytes buffer") || "null") + ">";
            };

            return {
                entryName: this.entryName,
                name: this.name,
                comment: this.comment,
                isDirectory: this.isDirectory,
                header: _entryHeader.toJSON(),
                compressedData: bytes(input),
                data: bytes(uncompressedData)
            };
        },

        /**
         * get basic entry data as string
         * @returns {string}
         */
        toString: function () {
            return JSON.stringify(this.toJSON(), null, "\t");
        }
    };
};
