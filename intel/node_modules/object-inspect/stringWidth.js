var $charCodeAt = String.prototype.charCodeAt;
var $indexOf = String.prototype.indexOf;
var $normalize = String.prototype.normalize;
var $slice = String.prototype.slice;
var $split = String.prototype.split;
var $floor = Math.floor;
var $parseInt = parseInt;

var ranges = require('./stringWidthRanges');

var starts = [];
var ends = [];
var widths = [];
var tokens = $split.call(ranges, ',');
var previousEnd = -1;
for (var t = 0; t < tokens.length; t++) {
    var dot = $indexOf.call(tokens[t], '.');
    starts[t] = previousEnd + 1 + $parseInt($slice.call(tokens[t], 1, dot), 36);
    previousEnd = starts[t] + $parseInt($slice.call(tokens[t], dot + 1), 36);
    ends[t] = previousEnd;
    widths[t] = Number($slice.call(tokens[t], 0, 1));
}

function codePointWidth(code) {
    var low = 0;
    var high = starts.length - 1;
    while (low <= high) {
        var mid = $floor((low + high) / 2);
        if (code < starts[mid]) {
            high = mid - 1;
        } else if (code > ends[mid]) {
            low = mid + 1;
        } else {
            return widths[mid];
        }
    }
    return 1;
}

function unicodeWidth(str) {
    var width = 0;
    for (var i = 0; i < str.length; i++) {
        var code = $charCodeAt.call(str, i);
        if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
            var next = $charCodeAt.call(str, i + 1);
            if (next >= 0xDC00 && next <= 0xDFFF) {
                code = ((code - 0xD800) * 0x400) + (next - 0xDC00) + 0x10000;
                i += 1;
            }
        }
        width += codePointWidth(code);
    }
    return width;
}

// like node, only the part of the string after its first non-ASCII character is NFC-normalized and looked up
module.exports = function getStringWidth(str) {
    var width = 0;
    for (var i = 0; i < str.length; i++) {
        var code = $charCodeAt.call(str, i);
        if (code >= 127) {
            var rest = $slice.call(str, i);
            return width + unicodeWidth($normalize ? $normalize.call(rest, 'NFC') : rest);
        }
        width += code >= 32 ? 1 : 0;
    }
    return width;
};
