var hasMap = typeof Map === 'function' && Map.prototype;
var mapSizeDescriptor = Object.getOwnPropertyDescriptor && hasMap ? Object.getOwnPropertyDescriptor(Map.prototype, 'size') : null;
var mapSize = hasMap && mapSizeDescriptor && typeof mapSizeDescriptor.get === 'function' ? mapSizeDescriptor.get : null;
var mapForEach = hasMap && Map.prototype.forEach;
var mapEntries = hasMap && Map.prototype.entries;
var hasSet = typeof Set === 'function' && Set.prototype;
var setSizeDescriptor = Object.getOwnPropertyDescriptor && hasSet ? Object.getOwnPropertyDescriptor(Set.prototype, 'size') : null;
var setSize = hasSet && setSizeDescriptor && typeof setSizeDescriptor.get === 'function' ? setSizeDescriptor.get : null;
var setForEach = hasSet && Set.prototype.forEach;
var setValues = hasSet && Set.prototype.values;
var hasWeakMap = typeof WeakMap === 'function' && WeakMap.prototype;
var weakMapHas = hasWeakMap ? WeakMap.prototype.has : null;
var hasWeakSet = typeof WeakSet === 'function' && WeakSet.prototype;
var weakSetHas = hasWeakSet ? WeakSet.prototype.has : null;
var hasWeakRef = typeof WeakRef === 'function' && WeakRef.prototype;
var weakRefDeref = hasWeakRef ? WeakRef.prototype.deref : null;
var booleanValueOf = Boolean.prototype.valueOf;
var objectToString = Object.prototype.toString;
var functionToString = Function.prototype.toString;
var $match = String.prototype.match;
var $slice = String.prototype.slice;
var $replace = String.prototype.replace;
var $toUpperCase = String.prototype.toUpperCase;
var $toLowerCase = String.prototype.toLowerCase;
var $test = RegExp.prototype.test;
var $concat = Array.prototype.concat;
var $join = Array.prototype.join;
var $arrSlice = Array.prototype.slice;
var $floor = Math.floor;
var $max = Math.max;
var $min = Math.min;
var $round = Math.round;
var $sqrt = Math.sqrt;
var bigIntValueOf = typeof BigInt === 'function' ? BigInt.prototype.valueOf : null;
var gOPS = Object.getOwnPropertySymbols;
var symToString = typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol' ? Symbol.prototype.toString : null;
var hasShammedSymbols = typeof Symbol === 'function' && typeof Symbol.iterator === 'object';
// ie, `has-tostringtag/shams
var toStringTag = typeof Symbol === 'function'
    && Symbol.toStringTag
    && (
        hasShammedSymbols
            ? typeof Symbol.toStringTag === 'object'
            : typeof Symbol.toStringTag === 'symbol'
    )
    ? Symbol.toStringTag
    : null;
var isEnumerable = Object.prototype.propertyIsEnumerable;

var gPO = (typeof Reflect === 'function' ? Reflect.getPrototypeOf : Object.getPrototypeOf) || (
    [].__proto__ === Array.prototype // eslint-disable-line no-proto
        ? function (O) {
            return O.__proto__; // eslint-disable-line no-proto
        }
        : null
);

var mapIteratorNext = mapEntries && gPO ? gPO(mapEntries.call(new Map())).next : null;
var setIteratorNext = setValues && gPO ? gPO(setValues.call(new Set())).next : null;

// TODO: replace with `which-typed-array`, and `call-bound` for `TypedArray.prototype.length`
/* global Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array */
var typedArrayProto = typeof Uint8Array === 'function' && gPO ? gPO(Uint8Array.prototype) : null;
var typedArrayTag = typedArrayProto && toStringTag ? getterOf(typedArrayProto, toStringTag) : null;
var typedArrayLength = typedArrayProto ? getterOf(typedArrayProto, 'length') : null;
var typedArrayToString = /^\[object (?:Int8|Uint8|Uint8Clamped|Int16|Uint16|Int32|Uint32|Float16|Float32|Float64|BigInt64|BigUint64)Array\]$/;
var typedArrayLengths = { __proto__: null };
if (!typedArrayLength) {
    var TypedArrays = [
        typeof Int8Array === 'function' && Int8Array,
        typeof Uint8Array === 'function' && Uint8Array,
        typeof Uint8ClampedArray === 'function' && Uint8ClampedArray,
        typeof Int16Array === 'function' && Int16Array,
        typeof Uint16Array === 'function' && Uint16Array,
        typeof Int32Array === 'function' && Int32Array,
        typeof Uint32Array === 'function' && Uint32Array,
        typeof Float32Array === 'function' && Float32Array,
        typeof Float64Array === 'function' && Float64Array
    ];
    for (var ta = 0; ta < TypedArrays.length; ta++) {
        var TypedArray = TypedArrays[ta];
        var lengthGetter = TypedArray && getterOf(TypedArray.prototype, 'length');
        if (lengthGetter) {
            typedArrayLengths[toStr(new TypedArray(0))] = lengthGetter;
        }
    }
}

function addNumericSeparator(num, str) {
    if (
        num === Infinity
        || num === -Infinity
        || num !== num
        || (num && num > -1000 && num < 1000)
        || $test.call(/e/, str)
    ) {
        return str;
    }
    var sepRegex = /[0-9](?=(?:[0-9]{3})+(?![0-9]))/g;
    if (typeof num === 'number') {
        var int = num < 0 ? -$floor(-num) : $floor(num); // trunc(num)
        if (int !== num) {
            var intStr = String(int);
            var dec = $slice.call(str, intStr.length + 1);
            return $replace.call(intStr, sepRegex, '$&_') + '.' + $replace.call($replace.call(dec, /([0-9]{3})/g, '$&_'), /_$/, '');
        }
    }
    return $replace.call(str, sepRegex, '$&_');
}

var utilInspect = require('./util.inspect');
var getStringWidth = require('./stringWidth');
var inspectCustom = utilInspect.custom;
var inspectSymbol = isSymbol(inspectCustom) ? inspectCustom : null;

var quotes = {
    __proto__: null,
    'double': '"',
    single: "'"
};
var quoteREs = {
    __proto__: null,
    'double': /(["\\])/g,
    single: /(['\\])/g
};

module.exports = function inspect_(obj, options, depth, seen, breakState) { // eslint-disable-line max-params
    var opts = options || {};

    if (has(opts, 'quoteStyle') && !has(quotes, opts.quoteStyle)) {
        throw new TypeError('option "quoteStyle" must be "single" or "double"');
    }
    if (
        has(opts, 'maxStringLength') && (typeof opts.maxStringLength === 'number'
            ? opts.maxStringLength < 0 && opts.maxStringLength !== Infinity
            : opts.maxStringLength !== null
        )
    ) {
        throw new TypeError('option "maxStringLength", if provided, must be a non-negative integer, Infinity, or `null`');
    }
    if (
        has(opts, 'maxCollectionLength')
        && opts.maxCollectionLength !== null
        && opts.maxCollectionLength !== Infinity
        && !(
            typeof opts.maxCollectionLength === 'number'
            && opts.maxCollectionLength >= 0
            && $floor(opts.maxCollectionLength) === opts.maxCollectionLength
        )
    ) {
        throw new TypeError('option "maxCollectionLength", if provided, must be a non-negative integer, Infinity, or `null`');
    }
    var maxCollectionLength = typeof opts.maxCollectionLength === 'number' ? opts.maxCollectionLength : Infinity;
    var customInspect = has(opts, 'customInspect') ? opts.customInspect : true;
    if (typeof customInspect !== 'boolean' && customInspect !== 'symbol') {
        throw new TypeError('option "customInspect", if provided, must be `true`, `false`, or `\'symbol\'`');
    }

    if (
        has(opts, 'indent')
        && opts.indent !== null
        && opts.indent !== '\t'
        && !(parseInt(opts.indent, 10) === opts.indent && opts.indent > 0)
    ) {
        throw new TypeError('option "indent" must be "\\t", an integer > 0, or `null`');
    }
    if (has(opts, 'numericSeparator') && typeof opts.numericSeparator !== 'boolean') {
        throw new TypeError('option "numericSeparator", if provided, must be `true` or `false`');
    }
    var numericSeparator = opts.numericSeparator;
    if (has(opts, 'multilineStrings') && typeof opts.multilineStrings !== 'boolean') {
        throw new TypeError('option "multilineStrings", if provided, must be `true` or `false`');
    }

    var hasBreakLength = has(opts, 'breakLength');
    if (
        hasBreakLength
        && opts.breakLength !== Infinity
        && (
            typeof opts.breakLength !== 'number'
            || opts.breakLength < 0
            || parseInt(opts.breakLength, 10) !== opts.breakLength
        )
    ) {
        throw new TypeError('option "breakLength", if provided, must be a non-negative integer or `Infinity`');
    }

    if (typeof obj === 'undefined') {
        return 'undefined';
    }
    if (obj === null) {
        return 'null';
    }
    if (typeof obj === 'boolean') {
        return obj ? 'true' : 'false';
    }

    if (typeof obj === 'string') {
        return inspectString(obj, opts);
    }
    if (typeof obj === 'number') {
        if (obj === 0) {
            return Infinity / obj > 0 ? '0' : '-0';
        }
        var str = String(obj);
        return numericSeparator ? addNumericSeparator(obj, str) : str;
    }
    if (typeof obj === 'bigint') {
        var bigIntStr = String(obj) + 'n';
        return numericSeparator ? addNumericSeparator(obj, bigIntStr) : bigIntStr;
    }

    var maxDepth = typeof opts.depth === 'undefined' ? 5 : opts.depth;
    if (typeof depth === 'undefined') { depth = 0; }
    if (depth >= maxDepth && maxDepth > 0 && typeof obj === 'object') {
        return isArray(obj) ? '[Array]' : '[Object]';
    }

    var indent = getIndent(hasBreakLength && (typeof opts.indent === 'undefined' || opts.indent === null) ? { indent: 2 } : opts, depth);
    var layout = hasBreakLength ? {
        breakLength: opts.breakLength,
        depth: depth,
        indent: indent,
        maxCollectionLength: maxCollectionLength,
        state: breakState || { currentDepth: depth }
    } : null;

    if (typeof seen === 'undefined') {
        seen = [];
    } else if (indexOf(seen, obj) >= 0) {
        return '[Circular]';
    }

    function inspect(value, from, noIndent) {
        var nextSeen = seen;
        if (from) {
            nextSeen = $arrSlice.call(seen);
            nextSeen.push(from);
        }
        if (noIndent && !layout) {
            var newOpts = {
                depth: opts.depth
            };
            if (has(opts, 'quoteStyle')) {
                newOpts.quoteStyle = opts.quoteStyle;
            }
            if (has(opts, 'maxCollectionLength')) {
                newOpts.maxCollectionLength = opts.maxCollectionLength;
            }
            return inspect_(value, newOpts, depth + 1, nextSeen);
        }
        return inspect_(value, opts, depth + 1, nextSeen, layout ? layout.state : breakState);
    }

    // like `util.inspect`, track the depth of the most recently entered non-empty object, so a container only fits on one line when few levels are nested below it
    function enter() {
        if (layout) {
            var previousDepth = layout.state.currentDepth;
            layout.state.currentDepth = depth;
            return previousDepth;
        }
        return null;
    }
    function leaveIfEmpty(entries, previousDepth) {
        if (layout && entries.length === 0) {
            layout.state.currentDepth = previousDepth;
        }
    }

    if (typeof obj === 'function' && !isRegExp(obj)) { // in older engines, regexes are callable
        var name = nameOf(obj);
        var fnDepth = enter();
        var keys = arrObjKeys(obj, inspect);
        leaveIfEmpty(keys, fnDepth);
        if (layout && keys.length > 0) {
            return breakLines(keys, bracesOf('{', '}', '[Function' + (name ? ': ' + name : ' (anonymous)') + ']', ' '), layout);
        }
        return '[Function' + (name ? ': ' + name : ' (anonymous)') + ']' + (keys.length > 0 ? ' { ' + $join.call(keys, ', ') + ' }' : '');
    }
    if (isSymbol(obj)) {
        var symString = hasShammedSymbols ? $replace.call(String(obj), /^(Symbol\(.*\))_[^)]*$/, '$1') : symToString.call(obj);
        return typeof obj === 'object' && !hasShammedSymbols ? markBoxed(symString) : symString;
    }
    if (isElement(obj)) {
        var s = '<' + $toLowerCase.call(String(obj.nodeName));
        var attrs = obj.attributes || [];
        for (var i = 0; i < attrs.length; i++) {
            s += ' ' + attrs[i].name + '=' + wrapQuotes(quote(attrs[i].value), 'double', opts);
        }
        s += '>';
        if (obj.childNodes && obj.childNodes.length) { s += '...'; }
        s += '</' + $toLowerCase.call(String(obj.nodeName)) + '>';
        return s;
    }
    if (isArray(obj)) {
        if (obj.length === 0) { return '[]'; }
        enter();
        var xs = arrObjKeys(obj, inspect, maxCollectionLength);
        if (layout) {
            return breakLines(xs, bracesOf('[', ']', '', ' '), layout, obj);
        }
        if (indent && !singleLineValues(xs)) {
            return '[' + indentedJoin(xs, indent) + ']';
        }
        return '[ ' + $join.call(xs, ', ') + ' ]';
    }
    if (isError(obj)) {
        var errorDepth = enter();
        var parts = arrObjKeys(obj, inspect);
        if (!('cause' in Error.prototype) && 'cause' in obj && !isEnumerable.call(obj, 'cause')) {
            parts = $concat.call(['[cause]: ' + inspect(obj.cause)], parts);
        }
        leaveIfEmpty(parts, errorDepth);
        if (parts.length === 0) { return '[' + String(obj) + ']'; }
        if (layout) {
            return breakLines(parts, bracesOf('{ [' + String(obj) + ']', '}', '', ' '), layout);
        }
        return '{ [' + String(obj) + '] ' + $join.call(parts, ', ') + ' }';
    }
    if (typeof obj === 'object' && customInspect) {
        if (inspectSymbol && typeof obj[inspectSymbol] === 'function' && utilInspect) {
            return utilInspect(obj, { depth: maxDepth - depth });
        } else if (customInspect !== 'symbol' && typeof obj.inspect === 'function') {
            return obj.inspect();
        }
    }
    if (isMap(obj)) {
        var mapParts = [];
        var mapDepth = enter();
        if (mapIteratorNext && maxCollectionLength < mapSize.call(obj)) {
            var mapIterator = mapEntries.call(obj);
            var mapStep;
            while (mapParts.length < maxCollectionLength && !(mapStep = mapIteratorNext.call(mapIterator)).done) {
                mapParts.push(inspect(mapStep.value[0], obj, true) + ' => ' + inspect(mapStep.value[1], obj));
            }
        } else if (mapForEach) {
            mapForEach.call(obj, function (value, key) {
                if (mapParts.length < maxCollectionLength) {
                    mapParts.push(inspect(key, obj, true) + ' => ' + inspect(value, obj));
                }
            });
        }
        var mapLength = mapSize.call(obj);
        if (maxCollectionLength !== Infinity && mapLength > mapParts.length) {
            mapParts.push(moreItems(mapLength - mapParts.length));
        }
        leaveIfEmpty(mapParts, mapDepth);
        if (layout) {
            return breakLines(mapParts, bracesOf('Map (' + mapLength + ') {', '}', '', ''), layout);
        }
        return collectionOf('Map', mapLength, mapParts, indent);
    }
    if (isSet(obj)) {
        var setParts = [];
        var setDepth = enter();
        if (setIteratorNext && maxCollectionLength < setSize.call(obj)) {
            var setIterator = setValues.call(obj);
            var setStep;
            while (setParts.length < maxCollectionLength && !(setStep = setIteratorNext.call(setIterator)).done) {
                setParts.push(inspect(setStep.value, obj));
            }
        } else if (setForEach) {
            setForEach.call(obj, function (value) {
                if (setParts.length < maxCollectionLength) {
                    setParts.push(inspect(value, obj));
                }
            });
        }
        var setLength = setSize.call(obj);
        if (maxCollectionLength !== Infinity && setLength > setParts.length) {
            setParts.push(moreItems(setLength - setParts.length));
        }
        leaveIfEmpty(setParts, setDepth);
        if (layout) {
            return breakLines(setParts, bracesOf('Set (' + setLength + ') {', '}', '', ''), layout);
        }
        return collectionOf('Set', setLength, setParts, indent);
    }
    if (isWeakMap(obj)) {
        return weakCollectionOf('WeakMap');
    }
    if (isWeakSet(obj)) {
        return weakCollectionOf('WeakSet');
    }
    if (isWeakRef(obj)) {
        return weakCollectionOf('WeakRef');
    }
    if (isNumber(obj)) {
        return markBoxed(inspect(Number(obj)));
    }
    if (isBigInt(obj)) {
        return markBoxed(inspect(bigIntValueOf.call(obj)));
    }
    if (isBoolean(obj)) {
        return markBoxed(booleanValueOf.call(obj));
    }
    if (isString(obj)) {
        return markBoxed(inspect(String(obj)));
    }
    // note: in IE 8, sometimes `global !== window` but both are the prototypes of each other
    /* global window */
    if (typeof window !== 'undefined' && obj === window) {
        return '{ [object Window] }';
    }
    if (
        (typeof globalThis !== 'undefined' && obj === globalThis)
        || (typeof global !== 'undefined' && obj === global)
    ) {
        return '{ [object globalThis] }';
    }
    if (!isDate(obj) && !isRegExp(obj)) {
        var objectDepth = enter();
        var ys = arrObjKeys(obj, inspect, maxCollectionLength);
        leaveIfEmpty(ys, objectDepth);
        var isPlainObject = gPO ? gPO(obj) === Object.prototype : obj instanceof Object || obj.constructor === Object;
        var protoTag = (gPO ? gPO(obj) === null : !(obj instanceof Object)) ? 'null prototype' : '';
        var stringTag = !isPlainObject && toStringTag && Object(obj) === obj && toStringTag in obj ? $slice.call(toStr(obj), 8, -1) : protoTag ? 'Object' : '';
        var constructorTag = isPlainObject || typeof obj.constructor !== 'function' ? '' : obj.constructor.name ? obj.constructor.name + ' ' : '';
        var tag = constructorTag + (stringTag || protoTag ? '[' + $join.call($concat.call([], stringTag || [], protoTag || []), ': ') + '] ' : '');
        if (ys.length === 0) { return tag + '{}'; }
        if (layout) {
            return breakLines(ys, bracesOf(tag + '{', '}', '', ' '), layout);
        }
        if (indent) {
            return tag + '{' + indentedJoin(ys, indent) + '}';
        }
        return tag + '{ ' + $join.call(ys, ', ') + ' }';
    }
    return String(obj);
};

function wrapQuotes(s, defaultStyle, opts) {
    var style = opts.quoteStyle || defaultStyle;
    var quoteChar = quotes[style];
    return quoteChar + s + quoteChar;
}

function quote(s) {
    return $replace.call(String(s), /"/g, '&quot;');
}

function canTrustToString(obj) {
    return !toStringTag || !(typeof obj === 'object' && (toStringTag in obj || typeof obj[toStringTag] !== 'undefined'));
}
function isArray(obj) { return toStr(obj) === '[object Array]' && canTrustToString(obj); }
function isDate(obj) { return toStr(obj) === '[object Date]' && canTrustToString(obj); }
function isRegExp(obj) { return toStr(obj) === '[object RegExp]' && canTrustToString(obj); }
function isError(obj) { return toStr(obj) === '[object Error]' && canTrustToString(obj); }
function isString(obj) { return toStr(obj) === '[object String]' && canTrustToString(obj); }
function isNumber(obj) { return toStr(obj) === '[object Number]' && canTrustToString(obj); }
function isBoolean(obj) { return toStr(obj) === '[object Boolean]' && canTrustToString(obj); }

// Symbol and BigInt do have Symbol.toStringTag by spec, so that can't be used to eliminate false positives
function isSymbol(obj) {
    if (hasShammedSymbols) {
        return obj && typeof obj === 'object' && obj instanceof Symbol;
    }
    if (typeof obj === 'symbol') {
        return true;
    }
    if (!obj || typeof obj !== 'object' || !symToString) {
        return false;
    }
    try {
        symToString.call(obj);
        return true;
    } catch (e) {}
    return false;
}

function isBigInt(obj) {
    if (!obj || typeof obj !== 'object' || !bigIntValueOf) {
        return false;
    }
    try {
        bigIntValueOf.call(obj);
        return true;
    } catch (e) {}
    return false;
}

var hasOwn = Object.prototype.hasOwnProperty || function (key) { return key in this; };
function has(obj, key) {
    return hasOwn.call(obj, key);
}

function toStr(obj) {
    return objectToString.call(obj);
}

function isTypedArray(obj) {
    if (typedArrayTag) {
        return !!typedArrayTag.call(obj);
    }
    return !toStringTag && $test.call(typedArrayToString, toStr(obj));
}

function getTypedArrayLength(obj) {
    if (typedArrayLength) {
        return typedArrayLength.call(obj);
    }
    var getter = typedArrayLengths[toStr(obj)];
    return getter ? getter.call(obj) : obj.length;
}

function getterOf(obj, key) {
    var descriptor = Object.getOwnPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null;
    return descriptor && typeof descriptor.get === 'function' ? descriptor.get : null;
}

function moreItems(count) {
    return '... ' + count + ' more item' + (count > 1 ? 's' : '');
}

function nameOf(f) {
    if (f.name) { return f.name; }
    var m = $match.call(functionToString.call(f), /^function\s*([\w$]+)/);
    if (m) { return m[1]; }
    return null;
}

function indexOf(xs, x) {
    if (xs.indexOf) { return xs.indexOf(x); }
    for (var i = 0, l = xs.length; i < l; i++) {
        if (xs[i] === x) { return i; }
    }
    return -1;
}

function isMap(x) {
    if (!mapSize || !x || typeof x !== 'object') {
        return false;
    }
    try {
        mapSize.call(x);
        try {
            setSize.call(x);
        } catch (s) {
            return true;
        }
        return x instanceof Map; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isWeakMap(x) {
    if (!weakMapHas || !x || typeof x !== 'object') {
        return false;
    }
    try {
        weakMapHas.call(x, weakMapHas);
        try {
            weakSetHas.call(x, weakSetHas);
        } catch (s) {
            return true;
        }
        return x instanceof WeakMap; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isWeakRef(x) {
    if (!weakRefDeref || !x || typeof x !== 'object') {
        return false;
    }
    try {
        weakRefDeref.call(x);
        return true;
    } catch (e) {}
    return false;
}

function isSet(x) {
    if (!setSize || !x || typeof x !== 'object') {
        return false;
    }
    try {
        setSize.call(x);
        try {
            mapSize.call(x);
        } catch (m) {
            return true;
        }
        return x instanceof Set; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isWeakSet(x) {
    if (!weakSetHas || !x || typeof x !== 'object') {
        return false;
    }
    try {
        weakSetHas.call(x, weakSetHas);
        try {
            weakMapHas.call(x, weakMapHas);
        } catch (s) {
            return true;
        }
        return x instanceof WeakSet; // core-js workaround, pre-v2.5.0
    } catch (e) {}
    return false;
}

function isElement(x) {
    if (!x || typeof x !== 'object') { return false; }
    if (typeof HTMLElement !== 'undefined' && x instanceof HTMLElement) {
        return true;
    }
    return typeof x.nodeName === 'string' && typeof x.getAttribute === 'function';
}

function inspectString(str, opts) {
    if (str.length > opts.maxStringLength) {
        var remaining = str.length - opts.maxStringLength;
        var trailer = '... ' + remaining + ' more character' + (remaining > 1 ? 's' : '');
        return inspectString($slice.call(str, 0, opts.maxStringLength), opts) + trailer;
    }
    var quoteRE = quoteREs[opts.quoteStyle || 'single'];
    quoteRE.lastIndex = 0;
    // eslint-disable-next-line no-control-regex
    var s = $replace.call($replace.call(str, quoteRE, '\\$1'), opts.multilineStrings ? /[\x00-\x09\x0b-\x1f]/g : /[\x00-\x1f]/g, lowbyte);
    return wrapQuotes(s, 'single', opts);
}

function lowbyte(c) {
    var n = c.charCodeAt(0);
    var x = {
        8: 'b',
        9: 't',
        10: 'n',
        12: 'f',
        13: 'r'
    }[n];
    if (x) { return '\\' + x; }
    return '\\x' + (n < 0x10 ? '0' : '') + $toUpperCase.call(n.toString(16));
}

function markBoxed(str) {
    return 'Object(' + str + ')';
}

function weakCollectionOf(type) {
    return type + ' { ? }';
}

function collectionOf(type, size, entries, indent) {
    var joinedEntries = indent ? indentedJoin(entries, indent) : $join.call(entries, ', ');
    return type + ' (' + size + ') {' + joinedEntries + '}';
}

// the following three functions port the line-breaking logic of node's `util.inspect` (with its default `compact: 3`), from `lib/internal/util/inspect.js`
function isBelowBreakLength(entries, start, breakLength) {
    if (breakLength === Infinity) {
        return singleLineValues(entries);
    }
    var totalLength = entries.length + start;
    if (totalLength + entries.length > breakLength) {
        return false;
    }
    for (var i = 0; i < entries.length; i++) {
        totalLength += entries[i].length;
        if (totalLength > breakLength) {
            return false;
        }
    }
    return true;
}

function padTo(str, width, atStart) {
    var fill = width > str.length ? $join.call(Array(width - str.length + 1), ' ') : '';
    return atStart ? fill + str : str + fill;
}

function groupArrayElements(entries, layout, value) {
    var separatorSpace = 2; // a comma and a space
    var totalLength = 0;
    var maxLength = 0;
    var outputLength = entries.length;
    if (layout.maxCollectionLength < entries.length) {
        outputLength -= 1; // leave the `... N more items` entry out of the grouping
    }
    var dataLen = [];
    for (var i = 0; i < outputLength; i++) {
        dataLen[i] = getStringWidth(entries[i]);
        totalLength += dataLen[i] + separatorSpace;
        if (maxLength < dataLen[i]) {
            maxLength = dataLen[i];
        }
    }
    var actualMax = maxLength + separatorSpace;
    var indentationLvl = layout.indent.prev.length;
    if ((actualMax * 3) + indentationLvl >= layout.breakLength || (totalLength / actualMax <= 5 && maxLength > 6)) {
        return entries;
    }
    var averageBias = $sqrt(actualMax - (totalLength / entries.length));
    var biasedMax = $max(actualMax - 3 - averageBias, 1);
    var columns = $min(
        $round($sqrt(2.5 * biasedMax * outputLength) / biasedMax),
        $floor((layout.breakLength - indentationLvl) / actualMax),
        12, // `compact` * 4
        15
    );
    if (columns <= 1) {
        return entries;
    }
    var maxLineLength = [];
    for (var c = 0; c < columns; c++) {
        var lineMaxLength = 0;
        for (var j = c; j < entries.length; j += columns) {
            if (dataLen[j] > lineMaxLength) {
                lineMaxLength = dataLen[j];
            }
        }
        maxLineLength[c] = lineMaxLength + separatorSpace;
    }
    var numeric = true;
    for (var k = 0; k < entries.length && numeric; k++) {
        numeric = typeof value[k] === 'number' || typeof value[k] === 'bigint';
    }
    var grouped = [];
    for (var row = 0; row < outputLength; row += columns) {
        var max = $min(row + columns, outputLength);
        var str = '';
        var col = row;
        for (; col < max - 1; col++) {
            str += padTo(entries[col] + ', ', maxLineLength[col - row] + (entries[col].length - dataLen[col]), numeric);
        }
        var lastPadding = maxLineLength[col - row] + (entries[col].length - dataLen[col]) - separatorSpace;
        str += numeric ? padTo(entries[col], lastPadding, true) : entries[col];
        grouped.push(str);
    }
    if (outputLength < entries.length) {
        grouped.push(entries[outputLength]);
    }
    return grouped;
}

// `padding` goes inside the braces only when the entries fit on one line
function bracesOf(opening, closing, base, padding) {
    return [
        opening,
        closing,
        base,
        padding
    ];
}

function breakLines(entries, braces, layout, arrayValue) {
    var output = arrayValue && entries.length > 6 ? groupArrayElements(entries, layout, arrayValue) : entries;
    var base = braces[2] ? braces[2] + ' ' : '';
    if (layout.state.currentDepth - layout.depth < 3 && output.length === entries.length) {
        var start = output.length + layout.indent.prev.length + braces[0].length + braces[2].length + 10;
        if (isBelowBreakLength(output, start, layout.breakLength)) {
            var joined = $join.call(output, ', ');
            if (indexOf(joined, '\n') < 0) {
                return base + braces[0] + braces[3] + joined + braces[3] + braces[1];
            }
        }
    }
    return base + braces[0] + indentedJoin(output, layout.indent) + braces[1];
}

function singleLineValues(xs) {
    for (var i = 0; i < xs.length; i++) {
        if (indexOf(xs[i], '\n') >= 0) {
            return false;
        }
    }
    return true;
}

function getIndent(opts, depth) {
    var baseIndent;
    if (opts.indent === '\t') {
        baseIndent = '\t';
    } else if (typeof opts.indent === 'number' && opts.indent > 0) {
        baseIndent = $join.call(Array(opts.indent + 1), ' ');
    } else {
        return null;
    }
    return {
        base: baseIndent,
        prev: $join.call(Array(depth + 1), baseIndent)
    };
}

function indentedJoin(xs, indent) {
    if (xs.length === 0) { return ''; }
    var lineJoiner = '\n' + indent.prev + indent.base;
    return lineJoiner + $join.call(xs, ',' + lineJoiner) + '\n' + indent.prev;
}

function arrObjKeys(obj, inspect, maxLength) {
    var isArr = isArray(obj);
    var limit = typeof maxLength === 'number' ? maxLength : Infinity;
    var typedLength = !isArr && limit !== Infinity && isTypedArray(obj) ? getTypedArrayLength(obj) : null;
    if (typeof typedLength !== 'number' || typedLength <= limit) {
        typedLength = null;
    }
    var xs = [];
    if (isArr) {
        xs.length = obj.length < limit ? obj.length : limit;
        for (var i = 0; i < obj.length && i < limit; i++) {
            xs[i] = has(obj, i) ? inspect(obj[i], obj) : '';
        }
        if (obj.length > limit) {
            xs.push(moreItems(obj.length - limit));
        }
    } else if (typedLength !== null) {
        for (var t = 0; t < limit; t++) {
            xs.push(t + ': ' + inspect(obj[t], obj));
        }
        xs.push(moreItems(typedLength - limit));
    }
    var syms = typeof gOPS === 'function' ? gOPS(obj) : [];
    var symMap;
    if (hasShammedSymbols) {
        symMap = {};
        for (var k = 0; k < syms.length; k++) {
            symMap['$' + syms[k]] = syms[k];
        }
    }

    for (var key in obj) { // eslint-disable-line no-restricted-syntax
        if (!has(obj, key)) { continue; } // eslint-disable-line no-restricted-syntax, no-continue
        if (isArr && String(Number(key)) === key && key < obj.length) { continue; } // eslint-disable-line no-restricted-syntax, no-continue
        if (typedLength !== null && String(Number(key)) === key && key < typedLength) { continue; } // eslint-disable-line no-restricted-syntax, no-continue
        if (hasShammedSymbols && symMap['$' + key] instanceof Symbol) {
            // this is to prevent shammed Symbols, which are stored as strings, from being included in the string key section
            continue; // eslint-disable-line no-restricted-syntax, no-continue
        } else if ($test.call(/[^\w$]/, key)) {
            xs.push(inspect(key, obj) + ': ' + inspect(obj[key], obj));
        } else {
            xs.push(key + ': ' + inspect(obj[key], obj));
        }
    }
    if (typeof gOPS === 'function') {
        for (var j = 0; j < syms.length; j++) {
            if (isEnumerable.call(obj, syms[j])) {
                xs.push('[' + inspect(syms[j]) + ']: ' + inspect(obj[syms[j]], obj));
            }
        }
    }
    return xs;
}
