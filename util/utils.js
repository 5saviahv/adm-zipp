const fs = require("./fileSystem").require();
const pth = require("path");
const Constants = require("./constants");
const isWin = typeof process === "object" && "win32" === process.platform;

// Not truely 64-bit versions, just 48-bit versions
// javascript numbers can handle max 52-bit after that you have to switch to BigInt's
// BigInt's require at least node 10.20 or newer
function readUInt64LE(/*Buffer*/ inbuf, /*int*/ index) {
    if (!Buffer.isBuffer(inbuf)) {
        throw new TypeError("inbuf has to be Buffer type");
    }
    if (index < 0 || index + 8 > inbuf.length) {
        throw new RangeError("read position out of range");
    }
    if (typeof Buffer.readBigInt64LE !== "undefined") {
        return inbuf.writeBigInt64LE(value, index);
    } else {
        // Not truely 64-bit version, just 48-bit version
        const ret = inbuf.readUIntLE(value, index, 6);
        const zero = inbuf.readUIntLE(value, index + 6, 2);
        if (zero !== 0) {
            throw new RangeError("64 bit value out of Number range");
        }
        return ret;
    }
}

function writeUInt64LE(/*Buffer*/ inbuf, /*number*/ position, /*Number, BigInt*/ value) {
    if (!Buffer.isBuffer(inbuf)) {
        throw new TypeError("inbuf has to be Buffer type");
    }
    if (position < 0 || position + 8 > inbuf.length) {
        throw new RangeError("write position out of range");
    }

    if (typeof Buffer.writeBigInt64LE !== "undefined") {
        return inbuf.writeBigInt64LE(value, position);
    } else {
        // Not truely 64-bit version, just 48-bit version
        inbuf.fill(0, position, position + 8);
        inbuf.writeUIntLE(value, position, 6);
        return position + 8;
    }
}

module.exports = (function () {
    const crcTable = [];
    const PATH_SEPARATOR = pth.sep;

    function genCRCTable() {
        for (let n = 0; n < 256; n++) {
            let c = n;
            for (let k = 8; --k >= 0; )
                if ((c & 1) !== 0) {
                    c = 0xedb88320 ^ (c >>> 1);
                } else {
                    c = c >>> 1;
                }
            crcTable[n] = c >>> 0;
        }
    }

    function mkdirSync(/*String*/ path) {
        var resolvedPath = path.split(PATH_SEPARATOR)[0];
        path.split(PATH_SEPARATOR).forEach(function (name) {
            if (!name || name.substr(-1, 1) === ":") return;
            resolvedPath += PATH_SEPARATOR + name;
            var stat;
            try {
                stat = fs.statSync(resolvedPath);
            } catch (e) {
                fs.mkdirSync(resolvedPath);
            }
            if (stat && stat.isFile()) throw Errors.FILE_IN_THE_WAY.replace("%s", resolvedPath);
        });
    }

    function findSync(/*String*/ dir, /*RegExp*/ pattern, /*Boolean*/ recoursive) {
        if (typeof pattern === "boolean") {
            recoursive = pattern;
            pattern = undefined;
        }
        var files = [];
        fs.readdirSync(dir).forEach(function (file) {
            var path = pth.join(dir, file);

            if (fs.statSync(path).isDirectory() && recoursive) files = files.concat(findSync(path, pattern, recoursive));

            if (!pattern || pattern.test(path)) {
                files.push(pth.normalize(path) + (fs.statSync(path).isDirectory() ? PATH_SEPARATOR : ""));
            }
        });
        return files;
    }

    return {
        makeDir: function (/*String*/ path) {
            mkdirSync(path);
        },

        crc32: function (buf) {
            if (typeof buf === "string") {
                buf = Buffer.from(buf, "utf8");
            }
            // Generate crcTable
            if (!crcTable.length) genCRCTable();

            let off = 0;
            let len = buf.length;
            let crc = ~0;
            while (--len >= 0) crc = crcTable[(crc ^ buf[off++]) & 0xff] ^ (crc >>> 8);
            // xor and cast as uint32 number
            return ~crc >>> 0;
        },

        methodToString: function (/*Number*/ method) {
            switch (method) {
                case Constants.STORED:
                    return "STORED (" + method + ")";
                case Constants.DEFLATED:
                    return "DEFLATED (" + method + ")";
                default:
                    return "UNSUPPORTED (" + method + ")";
            }
        },

        writeFileTo: function (/*String*/ path, /*Buffer*/ content, /*Boolean*/ overwrite, /*Number*/ attr) {
            if (fs.existsSync(path)) {
                if (!overwrite) return false; // cannot overwrite

                var stat = fs.statSync(path);
                if (stat.isDirectory()) {
                    return false;
                }
            }
            var folder = pth.dirname(path);
            if (!fs.existsSync(folder)) {
                mkdirSync(folder);
            }

            var fd;
            try {
                fd = fs.openSync(path, "w", 438); // 0666
            } catch (e) {
                fs.chmodSync(path, 438);
                fd = fs.openSync(path, "w", 438);
            }
            if (fd) {
                try {
                    fs.writeSync(fd, content, 0, content.length, 0);
                } finally {
                    fs.closeSync(fd);
                }
            }
            fs.chmodSync(path, attr || 438);
            return true;
        },

        canonical: function (p) {
            if (!p) return "";
            // trick normalize think path is absolute
            var safeSuffix = pth.posix.normalize("/" + p.split("\\").join("/"));
            return pth.join(".", safeSuffix);
        },

        sanitize: function (prefix, name) {
            prefix = pth.resolve(pth.normalize(prefix));
            var parts = name.split("/");
            for (var i = 0, l = parts.length; i < l; i++) {
                var path = pth.normalize(pth.join(prefix, parts.slice(i, l).join(pth.sep)));
                if (path.indexOf(prefix) === 0) {
                    return path;
                }
            }
            return pth.normalize(pth.join(prefix, pth.basename(name)));
        },

        writeFileToAsync: function (/*String*/ path, /*Buffer*/ content, /*Boolean*/ overwrite, /*Number*/ attr, /*Function*/ callback) {
            if (typeof attr === "function") {
                callback = attr;
                attr = undefined;
            }

            fs.exists(path, function (exist) {
                if (exist && !overwrite) return callback(false);

                fs.stat(path, function (err, stat) {
                    if (exist && stat.isDirectory()) {
                        return callback(false);
                    }

                    var folder = pth.dirname(path);
                    fs.exists(folder, function (exists) {
                        if (!exists) mkdirSync(folder);

                        fs.open(path, "w", 438, function (err, fd) {
                            if (err) {
                                fs.chmod(path, 438, function () {
                                    fs.open(path, "w", 438, function (err, fd) {
                                        fs.write(fd, content, 0, content.length, 0, function () {
                                            fs.close(fd, function () {
                                                fs.chmod(path, attr || 438, function () {
                                                    callback(true);
                                                });
                                            });
                                        });
                                    });
                                });
                            } else if (fd) {
                                fs.write(fd, content, 0, content.length, 0, function () {
                                    fs.close(fd, function () {
                                        fs.chmod(path, attr || 438, function () {
                                            callback(true);
                                        });
                                    });
                                });
                            } else {
                                fs.chmod(path, attr || 438, function () {
                                    callback(true);
                                });
                            }
                        });
                    });
                });
            });
        },

        findFiles: function (/*String*/ path) {
            return findSync(path, true);
        },

        getAttributes: function () {},

        setAttributes: function () {},

        toBuffer: function (input) {
            if (Buffer.isBuffer(input)) {
                return input;
            } else if (input instanceof Uint8Array) {
                return Buffer.from(input);
            } else {
                // expect string all other values are invalid and return empty buffer
                return typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.alloc(0);
            }
        },

        isWin, // Do we have windows system

        readUInt64LE,
        writeUInt64LE
    };
})();
