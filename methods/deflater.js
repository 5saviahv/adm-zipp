module.exports = function (/*Buffer*/ inbuf) {
    const zlib = require("zlib");

    const opts = { chunkSize: (parseInt(inbuf.length / 1024) + 1) * 1024 };

    return {
        deflate: function () {
            return zlib.deflateRawSync(inbuf, opts);
        },

        deflateAsync: function (/*Function*/ callback) {
            const tmp = zlib.createDeflateRaw(opts);
            const parts = [];
            let total = 0;
            tmp.on("data", function (data) {
                parts.push(data);
                total += data.length;
            });
            tmp.on("end", function () {
                const result = Buffer.alloc(total);
                let written = 0;
                for (const part of parts) {
                    part.copy(result, written);
                    written += part.length;
                }
                if (callback) callback(result);
            });
            tmp.end(inbuf);
        }
    };
};
