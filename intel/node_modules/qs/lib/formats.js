'use strict';

var replace = String.prototype.replace;
var percentTwenties = /%20/g;

var Format = {
    RFC1738: 'RFC1738',
    RFC3986: 'RFC3986',
    WHATWG: 'WHATWG'
};

module.exports = {
    'default': Format.RFC3986,
    formatters: {
        RFC1738: function (value) {
            return replace.call(value, percentTwenties, '+');
        },
        RFC3986: function (value) {
            return String(value);
        },
        WHATWG: function (value) {
            return replace.call(value, percentTwenties, '+');
        }
    },
    RFC1738: Format.RFC1738,
    RFC3986: Format.RFC3986,
    WHATWG: Format.WHATWG
};
