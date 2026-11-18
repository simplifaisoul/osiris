'use strict';

var test = require('tape');
var qs = require('../');
var utils = require('../lib/utils');
var iconv = require('iconv-lite');
var SaferBuffer = require('safer-buffer').Buffer;
var url = require('url');
var hasSymbols = require('has-symbols');
var mockProperty = require('mock-property');
var emptyTestCases = require('./empty-keys-cases').emptyTestCases;
var hasProto = require('has-proto')();
var hasBigInt = require('has-bigints')();

test('stringify()', function (t) {
    t.test('stringifies a querystring object', function (st) {
        st.equal(qs.stringify({ a: 'b' }), 'a=b');
        st.equal(qs.stringify({ a: 1 }), 'a=1');
        st.equal(qs.stringify({ a: 1, b: 2 }), 'a=1&b=2');
        st.equal(qs.stringify({ a: 'A_Z' }), 'a=A_Z');
        st.equal(qs.stringify({ a: '€' }), 'a=%E2%82%AC');
        st.equal(qs.stringify({ a: '' }), 'a=%EE%80%80');
        st.equal(qs.stringify({ a: 'א' }), 'a=%D7%90');
        st.equal(qs.stringify({ a: '𐐷' }), 'a=%F0%90%90%B7');
        st.end();
    });

    t.test('stringifies lone surrogates as U+FFFD', function (st) {
        st.equal(qs.stringify({ a: '\uD800x' }), 'a=%EF%BF%BDx', 'lone high surrogate does not swallow the next character');
        st.equal(qs.stringify({ a: '\uDC00x' }), 'a=%EF%BF%BDx', 'lone low surrogate does not swallow the next character');
        st.equal(qs.stringify({ '\uD800': 'b' }), '%EF%BF%BD=b', 'lone surrogate in a key');
        st.deepEqual(qs.parse(qs.stringify({ a: 'x\uD800y' })), { a: 'x\uFFFDy' }, 'parses back with U+FFFD in place of the lone surrogate');
        st.equal(qs.stringify({ '\uDC00': 'b' }), '%EF%BF%BD=b', 'lone low surrogate in a key');
        st.equal(qs.stringify({ a: { 'b\uD800': 'c' } }), 'a%5Bb%EF%BF%BD%5D=c', 'lone surrogate in a nested key does not swallow the closing bracket');
        st.equal(qs.stringify({ a: '\uD800 x' }, { format: 'RFC1738' }), 'a=%EF%BF%BD+x', 'lone surrogate does not swallow a space in RFC1738');
        st.equal(
            qs.stringify({ 'a\uD800': { b: 'c' } }, { allowDots: true, encodeDotInKeys: true }),
            'a%EF%BF%BD.b=c',
            'lone surrogate does not swallow a dot separator'
        );
        st.equal(qs.stringify({ a: ['x\uD800', 'y'] }, { arrayFormat: 'comma' }), 'a=x%EF%BF%BD%2Cy', 'lone surrogate does not swallow a comma');
        st.equal(
            qs.stringify({ a: ['x\uD800', 'y'] }, { arrayFormat: 'comma', encodeValuesOnly: true }),
            'a=x%EF%BF%BD,y',
            'lone surrogate at the end of a comma-joined element encodes as U+FFFD'
        );
        st.end();
    });

    t.test('stringifies falsy values', function (st) {
        st.equal(qs.stringify(undefined), '');
        st.equal(qs.stringify(null), '');
        st.equal(qs.stringify(null, { strictNullHandling: true }), '');
        st.equal(qs.stringify(false), '');
        st.equal(qs.stringify(0), '');
        st.end();
    });

    t.test('stringifies symbols', { skip: !hasSymbols() }, function (st) {
        st.equal(qs.stringify(Symbol.iterator), '');
        st.equal(qs.stringify([Symbol.iterator]), '0=Symbol%28Symbol.iterator%29');
        st.equal(qs.stringify({ a: Symbol.iterator }), 'a=Symbol%28Symbol.iterator%29');
        st.equal(
            qs.stringify({ a: [Symbol.iterator] }, { encodeValuesOnly: true, arrayFormat: 'brackets' }),
            'a[]=Symbol%28Symbol.iterator%29'
        );
        st.end();
    });

    t.test('stringifies bigints', { skip: !hasBigInt }, function (st) {
        var three = BigInt(3);
        var encodeWithN = function (value, defaultEncoder, charset) {
            var result = defaultEncoder(value, defaultEncoder, charset);
            return typeof value === 'bigint' ? result + 'n' : result;
        };
        st.equal(qs.stringify(three), '');
        st.equal(qs.stringify([three]), '0=3');
        st.equal(qs.stringify([three], { encoder: encodeWithN }), '0=3n');
        st.equal(qs.stringify({ a: three }), 'a=3');
        st.equal(qs.stringify({ a: three }, { encoder: encodeWithN }), 'a=3n');
        st.equal(
            qs.stringify({ a: [three] }, { encodeValuesOnly: true, arrayFormat: 'brackets' }),
            'a[]=3'
        );
        st.equal(
            qs.stringify({ a: [three] }, { encodeValuesOnly: true, encoder: encodeWithN, arrayFormat: 'brackets' }),
            'a[]=3n'
        );
        st.end();
    });

    t.test('encodes dot in key of object when encodeDotInKeys and allowDots is provided', function (st) {
        st.equal(
            qs.stringify(
                { 'name.obj': { first: 'John', last: 'Doe' } },
                { allowDots: false, encodeDotInKeys: false }
            ),
            'name.obj%5Bfirst%5D=John&name.obj%5Blast%5D=Doe',
            'with allowDots false and encodeDotInKeys false'
        );
        st.equal(
            qs.stringify(
                { 'name.obj': { first: 'John', last: 'Doe' } },
                { allowDots: true, encodeDotInKeys: false }
            ),
            'name.obj.first=John&name.obj.last=Doe',
            'with allowDots true and encodeDotInKeys false'
        );
        st.equal(
            qs.stringify(
                { 'name.obj': { first: 'John', last: 'Doe' } },
                { allowDots: false, encodeDotInKeys: true }
            ),
            'name%252Eobj%5Bfirst%5D=John&name%252Eobj%5Blast%5D=Doe',
            'with allowDots false and encodeDotInKeys true'
        );
        st.equal(
            qs.stringify(
                { 'name.obj': { first: 'John', last: 'Doe' } },
                { allowDots: true, encodeDotInKeys: true }
            ),
            'name%252Eobj.first=John&name%252Eobj.last=Doe',
            'with allowDots true and encodeDotInKeys true'
        );

        st.equal(
            qs.stringify(
                { 'name.obj.subobject': { 'first.godly.name': 'John', last: 'Doe' } },
                { allowDots: false, encodeDotInKeys: false }
            ),
            'name.obj.subobject%5Bfirst.godly.name%5D=John&name.obj.subobject%5Blast%5D=Doe',
            'with allowDots false and encodeDotInKeys false'
        );
        st.equal(
            qs.stringify(
                { 'name.obj.subobject': { 'first.godly.name': 'John', last: 'Doe' } },
                { allowDots: true, encodeDotInKeys: false }
            ),
            'name.obj.subobject.first.godly.name=John&name.obj.subobject.last=Doe',
            'with allowDots false and encodeDotInKeys false'
        );
        st.equal(
            qs.stringify(
                { 'name.obj.subobject': { 'first.godly.name': 'John', last: 'Doe' } },
                { allowDots: false, encodeDotInKeys: true }
            ),
            'name%252Eobj%252Esubobject%5Bfirst.godly.name%5D=John&name%252Eobj%252Esubobject%5Blast%5D=Doe',
            'with allowDots false and encodeDotInKeys true'
        );
        st.equal(
            qs.stringify(
                { 'name.obj.subobject': { 'first.godly.name': 'John', last: 'Doe' } },
                { allowDots: true, encodeDotInKeys: true }
            ),
            'name%252Eobj%252Esubobject.first%252Egodly%252Ename=John&name%252Eobj%252Esubobject.last=Doe',
            'with allowDots true and encodeDotInKeys true'
        );

        st.end();
    });

    t.test('encodes dot in key of object with a primitive value when encodeDotInKeys and allowDots is provided', function (st) {
        st.equal(
            qs.stringify(
                { 'name.obj': 'John' },
                { allowDots: true, encodeDotInKeys: true }
            ),
            'name%252Eobj=John',
            'with allowDots true and encodeDotInKeys true'
        );
        st.equal(
            qs.stringify(
                { 'name.obj': 'John' },
                { allowDots: false, encodeDotInKeys: true }
            ),
            'name%252Eobj=John',
            'with allowDots false and encodeDotInKeys true'
        );
        st.equal(
            qs.stringify(
                { 'name.obj': 'John' },
                { encodeDotInKeys: true, allowDots: true, encodeValuesOnly: true }
            ),
            'name%2Eobj=John',
            'with encodeValuesOnly true'
        );

        // With `encodeValuesOnly` the key encoder is skipped, so the dot is encoded once
        // (`%2E`) rather than twice. That single `%2E` decodes back to a structural dot, so
        // unlike the default output below this does not round-trip to the original dotted key
        // (a pre-existing `encodeValuesOnly` + `encodeDotInKeys` limitation, not new here).
        st.deepEqual(
            qs.parse(
                qs.stringify(
                    { 'name.obj': 'John' },
                    { encodeDotInKeys: true, allowDots: true, encodeValuesOnly: true }
                ),
                { allowDots: true, decodeDotInKeys: true }
            ),
            { name: { obj: 'John' } },
            'with encodeValuesOnly the single-encoded dot decodes structurally (does not round-trip)'
        );

        st.deepEqual(
            qs.parse(
                qs.stringify({ 'name.obj': 'John' }, { allowDots: true, encodeDotInKeys: true }),
                { allowDots: true, decodeDotInKeys: true }
            ),
            { 'name.obj': 'John' },
            'round-trips a dotted key with a primitive value'
        );

        st.equal(
            qs.stringify({ 'a.b': null }, { allowDots: true, encodeDotInKeys: true, strictNullHandling: true }),
            'a%252Eb',
            'encodes a dotted key with a null value'
        );
        st.equal(
            qs.stringify({ 'a.b': '1', 'c.d': '2' }, { allowDots: true, encodeDotInKeys: true }),
            'a%252Eb=1&c%252Ed=2',
            'encodes dots in every top-level key, not just the first'
        );
        st.equal(
            qs.stringify({ 'a.b.c': 'x' }, { allowDots: true, encodeDotInKeys: true }),
            'a%252Eb%252Ec=x',
            'encodes every dot in a key'
        );
        var primitiveKey = qs.stringify({ 'a.b': 'c' }, { allowDots: true, encodeDotInKeys: true }).split('=')[0];
        st.equal(
            qs.stringify({ 'a.b': { x: 'c' } }, { allowDots: true, encodeDotInKeys: true }).indexOf(primitiveKey + '.'),
            0,
            'a top-level dotted key encodes identically for primitive and object values'
        );

        st.end();
    });

    t.test('does not encode the structural separator dots between nested keys when encodeDotInKeys and allowDots are provided', function (st) {
        st.equal(
            qs.stringify(
                { a: { b: { c: 'd' } } },
                { allowDots: true, encodeDotInKeys: true }
            ),
            'a.b.c=d',
            'no key contains a literal dot, so encodeDotInKeys is a no-op on the separators'
        );
        st.equal(
            qs.stringify(
                { a: { b: { c: { d: 'e' } } } },
                { allowDots: true, encodeDotInKeys: true }
            ),
            'a.b.c.d=e',
            'every nesting separator is preserved, not just the last one'
        );

        st.deepEqual(
            qs.parse(
                qs.stringify({ a: { b: { c: 'd' } } }, { allowDots: true, encodeDotInKeys: true }),
                { allowDots: true, decodeDotInKeys: true }
            ),
            { a: { b: { c: 'd' } } },
            'stringify -> parse round-trips a deeply nested object'
        );

        st.end();
    });

    t.test('encodeDotInKeys encodes only literal dots inside nested keys, never the structural separators, at any depth', function (st) {
        st.equal(
            qs.stringify({ a: { 'b.c': { d: 'e' } } }, { allowDots: true, encodeDotInKeys: true }),
            'a.b%252Ec.d=e',
            'a nested key with a literal dot and an object value encodes only its own dot'
        );
        st.equal(
            qs.stringify({ 'a.b': { c: { d: 'e' } } }, { allowDots: true, encodeDotInKeys: true }),
            'a%252Eb.c.d=e',
            'a top-level dotted key stays encoded while deeper separators stay literal'
        );
        st.equal(
            qs.stringify({ a: { b: { 'c.d': { e: 'f' } } } }, { allowDots: true, encodeDotInKeys: true }),
            'a.b.c%252Ed.e=f',
            'a literal dot in a deeply nested key is encoded without touching the separators around it'
        );

        st.equal(
            qs.stringify({ a: { b: [1, 2] } }, { allowDots: true, encodeDotInKeys: true }),
            'a.b%5B0%5D=1&a.b%5B1%5D=2',
            'separator dots are preserved for an array value nested under keys'
        );
        st.equal(
            qs.stringify({ a: { 'b.c': [1, 2] } }, { allowDots: true, encodeDotInKeys: true }),
            'a.b%252Ec%5B0%5D=1&a.b%252Ec%5B1%5D=2',
            'a nested dotted key with an array value encodes only its own dot'
        );

        st.deepEqual(
            qs.parse(
                qs.stringify({ a: { 'b.c': { d: 'e' } } }, { allowDots: true, encodeDotInKeys: true }),
                { allowDots: true, decodeDotInKeys: true }
            ),
            { a: { 'b.c': { d: 'e' } } },
            'stringify -> parse round-trips a nested dotted key with an object value'
        );
        st.deepEqual(
            qs.parse(
                qs.stringify({ 'a.b': { c: { d: 'e' } } }, { allowDots: true, encodeDotInKeys: true }),
                { allowDots: true, decodeDotInKeys: true }
            ),
            { 'a.b': { c: { d: 'e' } } },
            'stringify -> parse round-trips a top-level dotted key with deep nesting'
        );

        st.end();
    });

    t.test('with allowDots false, encodeDotInKeys leaves nested-key dots literal, consistently for object and primitive values', function (st) {
        st.equal(
            qs.stringify({ a: { 'b.c': { d: 'e' } } }, { allowDots: false, encodeDotInKeys: true }),
            'a%5Bb.c%5D%5Bd%5D=e',
            'nested dotted key with an object value'
        );
        st.equal(
            qs.stringify({ a: { 'b.c': 'e' } }, { allowDots: false, encodeDotInKeys: true }),
            'a%5Bb.c%5D=e',
            'nested dotted key with a primitive value matches the object-value case'
        );

        st.end();
    });

    t.test('should encode dot in key of object, and automatically set allowDots to `true` when encodeDotInKeys is true and allowDots in undefined', function (st) {
        st.equal(
            qs.stringify(
                { 'name.obj.subobject': { 'first.godly.name': 'John', last: 'Doe' } },
                { encodeDotInKeys: true }
            ),
            'name%252Eobj%252Esubobject.first%252Egodly%252Ename=John&name%252Eobj%252Esubobject.last=Doe',
            'with allowDots undefined and encodeDotInKeys true'
        );
        st.end();
    });

    t.test('should encode dot in key of object when encodeDotInKeys and allowDots is provided, and nothing else when encodeValuesOnly is provided', function (st) {
        st.equal(
            qs.stringify({ 'name.obj': { first: 'John', last: 'Doe' } }, {
                encodeDotInKeys: true, allowDots: true, encodeValuesOnly: true
            }),
            'name%2Eobj.first=John&name%2Eobj.last=Doe'
        );

        st.equal(
            qs.stringify({ 'name.obj.subobject': { 'first.godly.name': 'John', last: 'Doe' } }, { allowDots: true, encodeDotInKeys: true, encodeValuesOnly: true }),
            'name%2Eobj%2Esubobject.first%2Egodly%2Ename=John&name%2Eobj%2Esubobject.last=Doe'
        );

        st.end();
    });

    t.test('throws when `commaRoundTrip` is not a boolean', function (st) {
        st['throws'](
            function () { qs.stringify({}, { commaRoundTrip: 'not a boolean' }); },
            TypeError,
            'throws when `commaRoundTrip` is not a boolean'
        );

        st.end();
    });

    t.test('throws when `encodeDotInKeys` is not a boolean', function (st) {
        st['throws'](
            function () { qs.stringify({ a: [], b: 'zz' }, { encodeDotInKeys: 'foobar' }); },
            TypeError
        );

        st['throws'](
            function () { qs.stringify({ a: [], b: 'zz' }, { encodeDotInKeys: 0 }); },
            TypeError
        );

        st['throws'](
            function () { qs.stringify({ a: [], b: 'zz' }, { encodeDotInKeys: NaN }); },
            TypeError
        );

        st['throws'](
            function () { qs.stringify({ a: [], b: 'zz' }, { encodeDotInKeys: null }); },
            TypeError
        );

        st.end();
    });

    t.test('adds query prefix', function (st) {
        st.equal(qs.stringify({ a: 'b' }, { addQueryPrefix: true }), '?a=b');
        st.end();
    });

    t.test('with query prefix, outputs blank string given an empty object', function (st) {
        st.equal(qs.stringify({}, { addQueryPrefix: true }), '');
        st.end();
    });

    t.test('stringifies nested falsy values', function (st) {
        st.equal(qs.stringify({ a: { b: { c: null } } }), 'a%5Bb%5D%5Bc%5D=');
        st.equal(qs.stringify({ a: { b: { c: null } } }, { strictNullHandling: true }), 'a%5Bb%5D%5Bc%5D');
        st.equal(qs.stringify({ a: { b: { c: false } } }), 'a%5Bb%5D%5Bc%5D=false');
        st.end();
    });

    t.test('stringifies a nested object', function (st) {
        st.equal(qs.stringify({ a: { b: 'c' } }), 'a%5Bb%5D=c');
        st.equal(qs.stringify({ a: { b: { c: { d: 'e' } } } }), 'a%5Bb%5D%5Bc%5D%5Bd%5D=e');
        st.end();
    });

    t.test('`allowDots` option: stringifies a nested object with dots notation', function (st) {
        st.equal(qs.stringify({ a: { b: 'c' } }, { allowDots: true }), 'a.b=c');
        st.equal(qs.stringify({ a: { b: { c: { d: 'e' } } } }, { allowDots: true }), 'a.b.c.d=e');
        st.end();
    });

    t.test('stringifies an array value', function (st) {
        st.equal(
            qs.stringify({ a: ['b', 'c', 'd'] }, { arrayFormat: 'indices' }),
            'a%5B0%5D=b&a%5B1%5D=c&a%5B2%5D=d',
            'indices => indices'
        );
        st.equal(
            qs.stringify({ a: ['b', 'c', 'd'] }, { arrayFormat: 'brackets' }),
            'a%5B%5D=b&a%5B%5D=c&a%5B%5D=d',
            'brackets => brackets'
        );
        st.equal(
            qs.stringify({ a: ['b', 'c', 'd'] }, { arrayFormat: 'comma' }),
            'a=b%2Cc%2Cd',
            'comma => comma'
        );
        st.equal(
            qs.stringify({ a: ['b', 'c', 'd'] }, { arrayFormat: 'comma', commaRoundTrip: true }),
            'a=b%2Cc%2Cd',
            'comma round trip => comma'
        );
        st.equal(
            qs.stringify({ a: ['b', 'c', 'd'] }),
            'a%5B0%5D=b&a%5B1%5D=c&a%5B2%5D=d',
            'default => indices'
        );
        st.end();
    });

    t.test('ignores inherited array format names', function (st) {
        var array = { a: ['b', 'c'] };
        var indices = 'a%5B0%5D=b&a%5B1%5D=c';
        var repeat = 'a=b&a=c';

        st.equal(qs.stringify(array, { arrayFormat: 'unsupported' }), indices, 'unknown format falls back to `indices`');

        var names = [
            'constructor',
            'toString',
            '__proto__',
            'valueOf',
            'hasOwnProperty',
            'isPrototypeOf',
            'propertyIsEnumerable',
            'toLocaleString'
        ];
        for (var i = 0; i < names.length; i++) {
            var name = names[i];
            st.equal(qs.stringify(array, { arrayFormat: name }), indices, '`' + name + '` falls back to `indices`');
            st.equal(
                qs.stringify(array, { arrayFormat: name, indices: true }),
                indices,
                '`' + name + '` with `indices: true` falls back to `indices`'
            );
            st.equal(
                qs.stringify(array, { arrayFormat: name, indices: false }),
                repeat,
                '`' + name + '` with `indices: false` falls back to `repeat`'
            );
        }

        st.end();
    });

    t.test('`skipNulls` option', function (st) {
        st.equal(
            qs.stringify({ a: 'b', c: null }, { skipNulls: true }),
            'a=b',
            'omits nulls when asked'
        );

        st.equal(
            qs.stringify({ a: { b: 'c', d: null } }, { skipNulls: true }),
            'a%5Bb%5D=c',
            'omits nested nulls when asked'
        );

        st.end();
    });

    t.test('omits array indices when asked', function (st) {
        st.equal(qs.stringify({ a: ['b', 'c', 'd'] }, { indices: false }), 'a=b&a=c&a=d');

        st.end();
    });

    t.test('omits object key/value pair when value is empty array', function (st) {
        st.equal(qs.stringify({ a: [], b: 'zz' }), 'b=zz');

        st.end();
    });

    t.test('should not omit object key/value pair when value is empty array and when asked', function (st) {
        st.equal(qs.stringify({ a: [], b: 'zz' }), 'b=zz');
        st.equal(qs.stringify({ a: [], b: 'zz' }, { allowEmptyArrays: false }), 'b=zz');
        st.equal(qs.stringify({ a: [], b: 'zz' }, { allowEmptyArrays: true }), 'a[]&b=zz');

        st.end();
    });

    t.test('should throw when allowEmptyArrays is not of type boolean', function (st) {
        st['throws'](
            function () { qs.stringify({ a: [], b: 'zz' }, { allowEmptyArrays: 'foobar' }); },
            TypeError
        );

        st['throws'](
            function () { qs.stringify({ a: [], b: 'zz' }, { allowEmptyArrays: 0 }); },
            TypeError
        );

        st['throws'](
            function () { qs.stringify({ a: [], b: 'zz' }, { allowEmptyArrays: NaN }); },
            TypeError
        );

        st['throws'](
            function () { qs.stringify({ a: [], b: 'zz' }, { allowEmptyArrays: null }); },
            TypeError
        );

        st.end();
    });

    t.test('allowEmptyArrays keys that need no encoding', function (st) {
        st.equal(qs.stringify({ foo: [] }, { allowEmptyArrays: true, format: 'RFC1738' }), 'foo[]', 'a top-level key in RFC1738');
        st.equal(
            qs.stringify({ a: { b: [] }, c: 'd e' }, { allowEmptyArrays: true, encodeValuesOnly: true }),
            'a[b][]&c=d%20e',
            'a nested key with encodeValuesOnly'
        );
        st.equal(qs.stringify({ a: { b: [] } }, { allowEmptyArrays: true, encode: false }), 'a[b][]', 'a nested key with encode: false');
        st.equal(qs.stringify({ a: { b: [] } }, { allowEmptyArrays: true, allowDots: true }), 'a.b[]', 'a nested key with allowDots');
        st.equal(
            qs.stringify({ a: { b: [] } }, { allowEmptyArrays: true, allowDots: true, format: 'RFC1738' }),
            'a.b[]',
            'a nested key with allowDots in RFC1738'
        );

        st.end();
    });

    t.test('allowEmptyArrays + strictNullHandling', function (st) {
        st.equal(
            qs.stringify(
                { testEmptyArray: [] },
                { strictNullHandling: true, allowEmptyArrays: true }
            ),
            'testEmptyArray[]'
        );

        st.end();
    });

    t.test('allowEmptyArrays only short-circuits arrays with no own keys', function (st) {
        st.equal(
            qs.stringify({ a: [] }, { allowEmptyArrays: true }),
            'a[]',
            'a genuinely empty array is still emitted as `[]`'
        );

        var withKey = [];
        withKey.extra = 'x';
        st.equal(
            qs.stringify({ a: withKey }, { allowEmptyArrays: true }),
            'a%5Bextra%5D=x',
            'an own key on an empty array is serialized rather than dropped'
        );
        st.equal(
            qs.stringify({ a: withKey }, { allowEmptyArrays: true }),
            qs.stringify({ a: withKey }),
            'the allowEmptyArrays fast path matches the default path when the array has own keys'
        );

        var container = {};
        var cyclic = [];
        cyclic.back = container;
        container.a = cyclic;
        st['throws'](
            function () { qs.stringify(container, { allowEmptyArrays: true }); },
            RangeError,
            'a cycle through an empty array with an own key is still detected'
        );

        st.end();
    });

    t.test('should encode the key of an empty array when allowEmptyArrays is set', function (st) {
        st.equal(
            qs.stringify({ 'a b': [] }, { allowEmptyArrays: true }),
            'a%20b[]',
            'default (RFC3986) percent-encodes the space in the key'
        );
        st.equal(
            qs.stringify({ 'a b': [] }, { allowEmptyArrays: true, format: 'RFC1738' }),
            'a+b[]',
            'RFC1738 encodes the space in the key as a plus'
        );
        st.equal(
            qs.stringify({ 'a b': [] }, { allowEmptyArrays: true, encodeValuesOnly: true }),
            'a b[]',
            'encodeValuesOnly leaves the key unencoded'
        );
        st.equal(
            qs.stringify({ 'a b': [] }, { allowEmptyArrays: true, encode: false }),
            'a b[]',
            'encode: false leaves the key unencoded'
        );

        st.deepEqual(
            qs.parse(qs.stringify({ 'a b': [], 'a&b=c': [] }, { allowEmptyArrays: true }), { allowEmptyArrays: true }),
            { 'a b': [], 'a&b=c': [] },
            'the encoded keys round-trip back to the original, including `&` and `=`'
        );
        st.equal(
            qs.stringify({ 'a b': ['x'] }, { allowEmptyArrays: true, arrayFormat: 'brackets' }),
            'a%20b%5B%5D=x',
            'the same key with a value encodes the key prefix identically'
        );
        st.equal(
            qs.stringify({ a: { 'b c': [] } }, { allowEmptyArrays: true }),
            'a%5Bb%20c%5D[]',
            'a nested key prefix is encoded like the value path encodes it'
        );
        st.equal(
            qs.stringify({ a: { b: [] } }, { allowEmptyArrays: true }),
            'a%5Bb%5D[]',
            'a nested key that needs no encoding still has its brackets encoded'
        );
        st.equal(
            qs.stringify({ 'a.b': [] }, { allowEmptyArrays: true, allowDots: true, encodeDotInKeys: true }),
            'a%252Eb[]',
            'encodeDotInKeys double-encodes the dot, as on the value path'
        );
        st.deepEqual(
            qs.parse('a%252Eb[]', { allowEmptyArrays: true, allowDots: true, decodeDotInKeys: true }),
            { 'a.b': [] },
            'the encodeDotInKeys output round-trips'
        );

        st.end();
    });

    t.test('stringifies an array value with one item vs multiple items', function (st) {
        st.test('non-array item', function (s2t) {
            s2t.equal(qs.stringify({ a: 'c' }, { encodeValuesOnly: true, arrayFormat: 'indices' }), 'a=c');
            s2t.equal(qs.stringify({ a: 'c' }, { encodeValuesOnly: true, arrayFormat: 'brackets' }), 'a=c');
            s2t.equal(qs.stringify({ a: 'c' }, { encodeValuesOnly: true, arrayFormat: 'comma' }), 'a=c');
            s2t.equal(qs.stringify({ a: 'c' }, { encodeValuesOnly: true }), 'a=c');

            s2t.end();
        });

        st.test('array with a single item', function (s2t) {
            s2t.equal(qs.stringify({ a: ['c'] }, { encodeValuesOnly: true, arrayFormat: 'indices' }), 'a[0]=c');
            s2t.equal(qs.stringify({ a: ['c'] }, { encodeValuesOnly: true, arrayFormat: 'brackets' }), 'a[]=c');
            s2t.equal(qs.stringify({ a: ['c'] }, { encodeValuesOnly: true, arrayFormat: 'comma' }), 'a=c');
            s2t.equal(qs.stringify({ a: ['c'] }, { encodeValuesOnly: true, arrayFormat: 'comma', commaRoundTrip: true }), 'a[]=c'); // so it parses back as an array
            s2t.equal(qs.stringify({ a: ['c'] }, { encodeValuesOnly: true }), 'a[0]=c');

            s2t.end();
        });

        st.test('array with multiple items', function (s2t) {
            s2t.equal(qs.stringify({ a: ['c', 'd'] }, { encodeValuesOnly: true, arrayFormat: 'indices' }), 'a[0]=c&a[1]=d');
            s2t.equal(qs.stringify({ a: ['c', 'd'] }, { encodeValuesOnly: true, arrayFormat: 'brackets' }), 'a[]=c&a[]=d');
            s2t.equal(qs.stringify({ a: ['c', 'd'] }, { encodeValuesOnly: true, arrayFormat: 'comma' }), 'a=c,d');
            s2t.equal(qs.stringify({ a: ['c', 'd'] }, { encodeValuesOnly: true, arrayFormat: 'comma', commaRoundTrip: true }), 'a=c,d');
            s2t.equal(qs.stringify({ a: ['c', 'd'] }, { encodeValuesOnly: true }), 'a[0]=c&a[1]=d');

            s2t.end();
        });

        st.test('array with multiple items with a comma inside', function (s2t) {
            s2t.equal(qs.stringify({ a: ['c,d', 'e'] }, { encodeValuesOnly: true, arrayFormat: 'comma' }), 'a=c%2Cd,e');
            s2t.equal(qs.stringify({ a: ['c,d', 'e'] }, { arrayFormat: 'comma' }), 'a=c%2Cd%2Ce');

            s2t.equal(qs.stringify({ a: ['c,d', 'e'] }, { encodeValuesOnly: true, arrayFormat: 'comma', commaRoundTrip: true }), 'a=c%2Cd,e');
            s2t.equal(qs.stringify({ a: ['c,d', 'e'] }, { arrayFormat: 'comma', commaRoundTrip: true }), 'a=c%2Cd%2Ce');

            s2t.end();
        });

        st.end();
    });

    t.test('stringifies a nested array value', function (st) {
        st.equal(qs.stringify({ a: { b: ['c', 'd'] } }, { encodeValuesOnly: true, arrayFormat: 'indices' }), 'a[b][0]=c&a[b][1]=d');
        st.equal(qs.stringify({ a: { b: ['c', 'd'] } }, { encodeValuesOnly: true, arrayFormat: 'brackets' }), 'a[b][]=c&a[b][]=d');
        st.equal(qs.stringify({ a: { b: ['c', 'd'] } }, { encodeValuesOnly: true, arrayFormat: 'comma' }), 'a[b]=c,d');
        st.equal(qs.stringify({ a: { b: ['c', 'd'] } }, { encodeValuesOnly: true }), 'a[b][0]=c&a[b][1]=d');
        st.end();
    });

    t.test('stringifies comma and empty array values', function (st) {
        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: false, arrayFormat: 'indices' }), 'a[0]=,&a[1]=&a[2]=c,d%');
        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: false, arrayFormat: 'brackets' }), 'a[]=,&a[]=&a[]=c,d%');
        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: false, arrayFormat: 'comma' }), 'a=,,,c,d%');
        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: false, arrayFormat: 'repeat' }), 'a=,&a=&a=c,d%');

        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: true, encodeValuesOnly: true, arrayFormat: 'indices' }), 'a[0]=%2C&a[1]=&a[2]=c%2Cd%25');
        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: true, encodeValuesOnly: true, arrayFormat: 'brackets' }), 'a[]=%2C&a[]=&a[]=c%2Cd%25');
        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: true, encodeValuesOnly: true, arrayFormat: 'comma' }), 'a=%2C,,c%2Cd%25');
        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: true, encodeValuesOnly: true, arrayFormat: 'repeat' }), 'a=%2C&a=&a=c%2Cd%25');

        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: true, encodeValuesOnly: false, arrayFormat: 'indices' }), 'a%5B0%5D=%2C&a%5B1%5D=&a%5B2%5D=c%2Cd%25');
        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: true, encodeValuesOnly: false, arrayFormat: 'brackets' }), 'a%5B%5D=%2C&a%5B%5D=&a%5B%5D=c%2Cd%25');
        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: true, encodeValuesOnly: false, arrayFormat: 'comma' }), 'a=%2C%2C%2Cc%2Cd%25');
        st.equal(qs.stringify({ a: [',', '', 'c,d%'] }, { encode: true, encodeValuesOnly: false, arrayFormat: 'repeat' }), 'a=%2C&a=&a=c%2Cd%25');

        st.end();
    });

    t.test('encodes comma array values with the same encoder arguments as other values, with encodeValuesOnly', function (st) {
        var commaValuesOnly = { arrayFormat: 'comma', encodeValuesOnly: true };

        st.equal(
            qs.stringify({ a: ['é', 'x'], b: 'é' }, utils.assign({ charset: 'iso-8859-1' }, commaValuesOnly)),
            'a=%E9,x&b=%E9',
            'respects charset iso-8859-1'
        );
        st.deepEqual(
            qs.parse(qs.stringify({ a: ['é', 'x'] }, utils.assign({ charset: 'iso-8859-1' }, commaValuesOnly)), { charset: 'iso-8859-1', comma: true }),
            { a: ['é', 'x'] },
            'round-trips in iso-8859-1'
        );
        st.equal(
            qs.stringify({ a: ['☺'] }, utils.assign({ charset: 'iso-8859-1' }, commaValuesOnly)),
            'a=%26%239786%3B',
            'encodes unrepresentable chars as numeric entities in iso-8859-1'
        );
        st.equal(
            qs.stringify({ a: ['(x)', 'y z'], b: '(x)' }, utils.assign({ format: qs.formats.RFC1738 }, commaValuesOnly)),
            'a=(x),y+z&b=(x)',
            'respects format RFC1738'
        );

        var calls = [];
        st.equal(
            qs.stringify({ a: ['b', 'c'] }, utils.assign({
                encoder: function (str, defaultEncoder, charset, kind, format) {
                    calls[calls.length] = [str, typeof defaultEncoder, charset, kind, format];
                    return defaultEncoder(str, defaultEncoder, charset, kind, format).toUpperCase();
                }
            }, commaValuesOnly)),
            'a=B,C',
            'a custom encoder can call defaultEncoder'
        );
        st.deepEqual(
            calls,
            [
                ['b', 'function', 'utf-8', 'value', qs.formats.RFC3986],
                ['c', 'function', 'utf-8', 'value', qs.formats.RFC3986]
            ],
            'a custom encoder receives defaultEncoder, charset, kind, and format'
        );

        st.end();
    });

    t.test('stringifies comma and empty non-array values', function (st) {
        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: false, arrayFormat: 'indices' }), 'a=,&b=&c=c,d%');
        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: false, arrayFormat: 'brackets' }), 'a=,&b=&c=c,d%');
        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: false, arrayFormat: 'comma' }), 'a=,&b=&c=c,d%');
        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: false, arrayFormat: 'repeat' }), 'a=,&b=&c=c,d%');

        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: true, encodeValuesOnly: true, arrayFormat: 'indices' }), 'a=%2C&b=&c=c%2Cd%25');
        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: true, encodeValuesOnly: true, arrayFormat: 'brackets' }), 'a=%2C&b=&c=c%2Cd%25');
        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: true, encodeValuesOnly: true, arrayFormat: 'comma' }), 'a=%2C&b=&c=c%2Cd%25');
        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: true, encodeValuesOnly: true, arrayFormat: 'repeat' }), 'a=%2C&b=&c=c%2Cd%25');

        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: true, encodeValuesOnly: false, arrayFormat: 'indices' }), 'a=%2C&b=&c=c%2Cd%25');
        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: true, encodeValuesOnly: false, arrayFormat: 'brackets' }), 'a=%2C&b=&c=c%2Cd%25');
        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: true, encodeValuesOnly: false, arrayFormat: 'comma' }), 'a=%2C&b=&c=c%2Cd%25');
        st.equal(qs.stringify({ a: ',', b: '', c: 'c,d%' }, { encode: true, encodeValuesOnly: false, arrayFormat: 'repeat' }), 'a=%2C&b=&c=c%2Cd%25');

        st.end();
    });

    t.test('stringifies a nested array value with dots notation', function (st) {
        st.equal(
            qs.stringify(
                { a: { b: ['c', 'd'] } },
                { allowDots: true, encodeValuesOnly: true, arrayFormat: 'indices' }
            ),
            'a.b[0]=c&a.b[1]=d',
            'indices: stringifies with dots + indices'
        );
        st.equal(
            qs.stringify(
                { a: { b: ['c', 'd'] } },
                { allowDots: true, encodeValuesOnly: true, arrayFormat: 'brackets' }
            ),
            'a.b[]=c&a.b[]=d',
            'brackets: stringifies with dots + brackets'
        );
        st.equal(
            qs.stringify(
                { a: { b: ['c', 'd'] } },
                { allowDots: true, encodeValuesOnly: true, arrayFormat: 'comma' }
            ),
            'a.b=c,d',
            'comma: stringifies with dots + comma'
        );
        st.equal(
            qs.stringify(
                { a: { b: ['c', 'd'] } },
                { allowDots: true, encodeValuesOnly: true }
            ),
            'a.b[0]=c&a.b[1]=d',
            'default: stringifies with dots + indices'
        );
        st.end();
    });

    t.test('stringifies an object inside an array', function (st) {
        st.equal(
            qs.stringify({ a: [{ b: 'c' }] }, { arrayFormat: 'indices', encodeValuesOnly: true }),
            'a[0][b]=c',
            'indices => indices'
        );
        st.equal(
            qs.stringify({ a: [{ b: 'c' }] }, { arrayFormat: 'repeat', encodeValuesOnly: true }),
            'a[b]=c',
            'repeat => repeat'
        );
        st.equal(
            qs.stringify({ a: [{ b: 'c' }] }, { arrayFormat: 'brackets', encodeValuesOnly: true }),
            'a[][b]=c',
            'brackets => brackets'
        );
        st.equal(
            qs.stringify({ a: [{ b: 'c' }] }, { encodeValuesOnly: true }),
            'a[0][b]=c',
            'default => indices'
        );

        st.equal(
            qs.stringify({ a: [{ b: { c: [1] } }] }, { arrayFormat: 'indices', encodeValuesOnly: true }),
            'a[0][b][c][0]=1',
            'indices => indices'
        );
        st.equal(
            qs.stringify({ a: [{ b: { c: [1] } }] }, { arrayFormat: 'repeat', encodeValuesOnly: true }),
            'a[b][c]=1',
            'repeat => repeat'
        );
        st.equal(
            qs.stringify({ a: [{ b: { c: [1] } }] }, { arrayFormat: 'brackets', encodeValuesOnly: true }),
            'a[][b][c][]=1',
            'brackets => brackets'
        );
        st.equal(
            qs.stringify({ a: [{ b: { c: [1] } }] }, { encodeValuesOnly: true }),
            'a[0][b][c][0]=1',
            'default => indices'
        );

        st.end();
    });

    t.test('stringifies an array with mixed objects and primitives', function (st) {
        st.equal(
            qs.stringify({ a: [{ b: 1 }, 2, 3] }, { encodeValuesOnly: true, arrayFormat: 'indices' }),
            'a[0][b]=1&a[1]=2&a[2]=3',
            'indices => indices'
        );
        st.equal(
            qs.stringify({ a: [{ b: 1 }, 2, 3] }, { encodeValuesOnly: true, arrayFormat: 'brackets' }),
            'a[][b]=1&a[]=2&a[]=3',
            'brackets => brackets'
        );
        st.equal(
            qs.stringify({ a: [{ b: 1 }, 2, 3] }, { encodeValuesOnly: true, arrayFormat: 'comma' }),
            '???',
            'brackets => brackets',
            { skip: 'TODO: figure out what this should do' }
        );
        st.equal(
            qs.stringify({ a: [{ b: 1 }, 2, 3] }, { encodeValuesOnly: true }),
            'a[0][b]=1&a[1]=2&a[2]=3',
            'default => indices'
        );

        st.end();
    });

    t.test('stringifies an object inside an array with dots notation', function (st) {
        st.equal(
            qs.stringify(
                { a: [{ b: 'c' }] },
                { allowDots: true, encode: false, arrayFormat: 'indices' }
            ),
            'a[0].b=c',
            'indices => indices'
        );
        st.equal(
            qs.stringify(
                { a: [{ b: 'c' }] },
                { allowDots: true, encode: false, arrayFormat: 'brackets' }
            ),
            'a[].b=c',
            'brackets => brackets'
        );
        st.equal(
            qs.stringify(
                { a: [{ b: 'c' }] },
                { allowDots: true, encode: false }
            ),
            'a[0].b=c',
            'default => indices'
        );

        st.equal(
            qs.stringify(
                { a: [{ b: { c: [1] } }] },
                { allowDots: true, encode: false, arrayFormat: 'indices' }
            ),
            'a[0].b.c[0]=1',
            'indices => indices'
        );
        st.equal(
            qs.stringify(
                { a: [{ b: { c: [1] } }] },
                { allowDots: true, encode: false, arrayFormat: 'brackets' }
            ),
            'a[].b.c[]=1',
            'brackets => brackets'
        );
        st.equal(
            qs.stringify(
                { a: [{ b: { c: [1] } }] },
                { allowDots: true, encode: false }
            ),
            'a[0].b.c[0]=1',
            'default => indices'
        );

        st.end();
    });

    t.test('does not omit object keys when indices = false', function (st) {
        st.equal(qs.stringify({ a: [{ b: 'c' }] }, { indices: false }), 'a%5Bb%5D=c');
        st.end();
    });

    t.test('uses indices notation for arrays when indices=true', function (st) {
        st.equal(qs.stringify({ a: ['b', 'c'] }, { indices: true }), 'a%5B0%5D=b&a%5B1%5D=c');
        st.end();
    });

    t.test('uses indices notation for arrays when no arrayFormat is specified', function (st) {
        st.equal(qs.stringify({ a: ['b', 'c'] }), 'a%5B0%5D=b&a%5B1%5D=c');
        st.end();
    });

    t.test('uses indices notation for arrays when arrayFormat=indices', function (st) {
        st.equal(qs.stringify({ a: ['b', 'c'] }, { arrayFormat: 'indices' }), 'a%5B0%5D=b&a%5B1%5D=c');
        st.end();
    });

    t.test('uses repeat notation for arrays when arrayFormat=repeat', function (st) {
        st.equal(qs.stringify({ a: ['b', 'c'] }, { arrayFormat: 'repeat' }), 'a=b&a=c');
        st.end();
    });

    t.test('uses brackets notation for arrays when arrayFormat=brackets', function (st) {
        st.equal(qs.stringify({ a: ['b', 'c'] }, { arrayFormat: 'brackets' }), 'a%5B%5D=b&a%5B%5D=c');
        st.end();
    });

    t.test('stringifies a complicated object', function (st) {
        st.equal(qs.stringify({ a: { b: 'c', d: 'e' } }), 'a%5Bb%5D=c&a%5Bd%5D=e');
        st.end();
    });

    t.test('stringifies an empty value', function (st) {
        st.equal(qs.stringify({ a: '' }), 'a=');
        st.equal(qs.stringify({ a: null }, { strictNullHandling: true }), 'a');

        st.equal(qs.stringify({ a: '', b: '' }), 'a=&b=');
        st.equal(qs.stringify({ a: null, b: '' }, { strictNullHandling: true }), 'a&b=');

        st.equal(qs.stringify({ a: { b: '' } }), 'a%5Bb%5D=');
        st.equal(qs.stringify({ a: { b: null } }, { strictNullHandling: true }), 'a%5Bb%5D');
        st.equal(qs.stringify({ a: { b: null } }, { strictNullHandling: false }), 'a%5Bb%5D=');

        st.end();
    });

    t.test('stringifies an empty array in different arrayFormat', function (st) {
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false }), 'b[0]=&c=c');
        // arrayFormat default
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'indices' }), 'b[0]=&c=c');
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'brackets' }), 'b[]=&c=c');
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'repeat' }), 'b=&c=c');
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'comma' }), 'b=&c=c');
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'comma', commaRoundTrip: true }), 'b[]=&c=c');
        // with strictNullHandling
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'indices', strictNullHandling: true }), 'b[0]&c=c');
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'brackets', strictNullHandling: true }), 'b[]&c=c');
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'repeat', strictNullHandling: true }), 'b&c=c');
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'comma', strictNullHandling: true }), 'b&c=c');
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'comma', strictNullHandling: true, commaRoundTrip: true }), 'b[]&c=c');
        // with skipNulls
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'indices', skipNulls: true }), 'c=c');
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'brackets', skipNulls: true }), 'c=c');
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'repeat', skipNulls: true }), 'c=c');
        st.equal(qs.stringify({ a: [], b: [null], c: 'c' }, { encode: false, arrayFormat: 'comma', skipNulls: true }), 'c=c');

        st.end();
    });

    t.test('does not crash on null/undefined entries in arrayFormat=comma with encodeValuesOnly', function (st) {
        st.doesNotThrow(
            function () { qs.stringify({ a: [null, 'b'] }, { arrayFormat: 'comma', encodeValuesOnly: true }); },
            'does not pass a raw null array entry to the encoder'
        );
        st.doesNotThrow(
            function () { qs.stringify({ a: [undefined, 'b'] }, { arrayFormat: 'comma', encodeValuesOnly: true }); },
            'does not pass a raw undefined array entry to the encoder'
        );
        st.doesNotThrow(
            function () { qs.stringify({ a: [null] }, { arrayFormat: 'comma', encodeValuesOnly: true }); },
            'does not crash on a single-null array'
        );

        st.equal(
            qs.stringify({ a: [null, 'b'] }, { arrayFormat: 'comma', encodeValuesOnly: true }),
            'a=,b',
            'null entry joins as empty, comma stays unencoded under encodeValuesOnly'
        );
        st.equal(
            qs.stringify({ a: [undefined, 'b'] }, { arrayFormat: 'comma', encodeValuesOnly: true }),
            'a=,b',
            'undefined entry joins as empty, comma stays unencoded under encodeValuesOnly'
        );
        st.equal(
            qs.stringify({ a: [null] }, { arrayFormat: 'comma', encodeValuesOnly: true }),
            'a=',
            'single-null array stringifies as empty value'
        );
        st.equal(
            qs.stringify({ a: [null] }, { arrayFormat: 'comma', encodeValuesOnly: true, strictNullHandling: true }),
            'a',
            'strictNullHandling drops the equals sign for a single-null array'
        );
        st.equal(
            qs.stringify({ a: [null] }, { arrayFormat: 'comma', encodeValuesOnly: true, skipNulls: true }),
            '',
            'skipNulls drops a single-null array entirely'
        );

        st.end();
    });

    t.test('arrayFormat=comma: does not crash on entries with no callable `toString`', function (st) {
        var json = JSON.parse('{ "a": ["b", { "toString": "x" }, "c"] }');
        st.equal(qs.stringify(json, { arrayFormat: 'comma' }), 'a=b%2C%5Bobject%20Object%5D%2Cc', 'JSON own `toString`');
        st.equal(qs.stringify(json, { arrayFormat: 'comma', encode: false }), 'a=b,[object Object],c', 'with encode: false');
        st.equal(
            qs.stringify(json, { arrayFormat: 'comma', encodeValuesOnly: true }),
            'a=b,%5Bobject%20Object%5D,c',
            'with encodeValuesOnly'
        );
        st.equal(
            qs.stringify(JSON.parse('{ "a": [{ "toString": "x" }] }'), { arrayFormat: 'comma', commaRoundTrip: true }),
            'a%5B%5D=%5Bobject%20Object%5D',
            'with commaRoundTrip'
        );
        st.equal(
            qs.stringify(JSON.parse('{ "a": [{ "toString": "x" }] }'), { arrayFormat: 'comma' }),
            qs.stringify({ a: [{ b: 1 }] }, { arrayFormat: 'comma' }),
            'renders the same as a plain object entry'
        );

        st.equal(
            qs.stringify(qs.parse('a[][b]=c', { plainObjects: true }), { arrayFormat: 'comma' }),
            'a=%5Bobject%20Object%5D',
            'null-prototype entry from `parse` with plainObjects'
        );
        st.equal(
            qs.stringify(qs.parse('a[][b]=c', { plainObjects: true }), { arrayFormat: 'comma', encodeValuesOnly: true }),
            'a=%5Bobject%20Object%5D',
            'null-prototype entry from `parse` with plainObjects, with encodeValuesOnly'
        );
        st.equal(
            qs.stringify(qs.parse('a[0][toString]=x', { allowPrototypes: true }), { arrayFormat: 'comma' }),
            'a=%5Bobject%20Object%5D',
            'own `toString` entry from `parse` with allowPrototypes'
        );

        var nested = JSON.parse('{ "a": [[1, [{ "toString": "x" }]], "y"] }');
        st.equal(qs.stringify(nested, { arrayFormat: 'comma', encode: false }), 'a=1,[object Object],y', 'nested array');
        st.equal(
            qs.stringify(nested, { arrayFormat: 'comma', encodeValuesOnly: true }),
            'a=1%2C%5Bobject%20Object%5D,y',
            'nested array, with encodeValuesOnly'
        );
        st.equal(qs.stringify({ a: [[1, 2], 3] }, { arrayFormat: 'comma', encode: false }), 'a=1,2,3', 'nested array is still flattened');

        var cyclic = [{ toString: 'x' }];
        cyclic[cyclic.length] = cyclic;
        st.equal(
            qs.stringify({ a: cyclic }, { arrayFormat: 'comma', encode: false }),
            'a=[object Object],[object Object],',
            'cyclic nested array joins its cycle as empty'
        );

        var customJoin = [{ toString: 'x' }];
        customJoin.join = function () { return 'j'; };
        st.equal(qs.stringify({ a: [customJoin, 'y'] }, { arrayFormat: 'comma', encode: false }), 'a=j,y', 'own `join` is still used');

        st.equal(
            qs.stringify({ a: [{ toString: 'x', valueOf: function () { return 7; } }] }, { arrayFormat: 'comma' }),
            'a=7',
            'primitive `valueOf` is still used'
        );
        st.equal(
            qs.stringify({ a: [{ toString: 'x', valueOf: function () { return null; } }] }, { arrayFormat: 'comma' }),
            'a=null',
            'null `valueOf` is still used'
        );
        st.equal(
            qs.stringify({ a: [{ toString: 'x', valueOf: function () { return {}; } }] }, { arrayFormat: 'comma' }),
            'a=%5Bobject%20Object%5D',
            'non-primitive `valueOf` falls back'
        );

        st.equal(
            qs.stringify({ a: [{ toString: function () { return 't'; } }, new Date(0)] }, { arrayFormat: 'comma', encode: false }),
            'a=t,1970-01-01T00:00:00.000Z',
            'callable `toString` and dates are unaffected'
        );

        st['throws'](
            function () {
                qs.stringify({ a: [{ toString: function () { throw new SyntaxError('mine'); } }] }, { arrayFormat: 'comma' });
            },
            SyntaxError,
            'a throwing `toString` still throws'
        );
        st['throws'](
            function () {
                qs.stringify({ a: [{ toString: 'x', valueOf: function () { throw new EvalError('mine'); } }] }, { arrayFormat: 'comma' });
            },
            EvalError,
            'a throwing `valueOf` still throws'
        );

        st.end();
    });

    t.test('arrayFormat=comma: entries with `Symbol.toPrimitive` are unaffected', { skip: !hasSymbols() || typeof Symbol.toPrimitive !== 'symbol' }, function (st) {
        var entry = { toString: 'x' };
        entry[Symbol.toPrimitive] = function () { return 'p'; };
        st.equal(qs.stringify({ a: [entry] }, { arrayFormat: 'comma' }), 'a=p');
        st.equal(qs.stringify({ a: [entry] }, { arrayFormat: 'comma', encodeValuesOnly: true }), 'a=p');

        st.end();
    });

    t.test('stringifies a null object', { skip: !hasProto }, function (st) {
        st.equal(qs.stringify({ __proto__: null, a: 'b' }), 'a=b');
        st.end();
    });

    t.test('returns an empty string for invalid input', function (st) {
        st.equal(qs.stringify(undefined), '');
        st.equal(qs.stringify(false), '');
        st.equal(qs.stringify(null), '');
        st.equal(qs.stringify(''), '');
        st.end();
    });

    t.test('stringifies an object with a null object as a child', { skip: !hasProto }, function (st) {
        st.equal(qs.stringify({ a: { __proto__: null, b: 'c' } }), 'a%5Bb%5D=c');
        st.end();
    });

    t.test('drops keys with a value of undefined', function (st) {
        st.equal(qs.stringify({ a: undefined }), '');

        st.equal(qs.stringify({ a: { b: undefined, c: null } }, { strictNullHandling: true }), 'a%5Bc%5D');
        st.equal(qs.stringify({ a: { b: undefined, c: null } }, { strictNullHandling: false }), 'a%5Bc%5D=');
        st.equal(qs.stringify({ a: { b: undefined, c: '' } }), 'a%5Bc%5D=');
        st.end();
    });

    t.test('url encodes values', function (st) {
        st.equal(qs.stringify({ a: 'b c' }), 'a=b%20c');
        st.end();
    });

    t.test('stringifies a date', function (st) {
        var now = new Date();
        var str = 'a=' + encodeURIComponent(now.toISOString());
        st.equal(qs.stringify({ a: now }), str);
        st.end();
    });

    t.test('stringifies the weird object from qs', function (st) {
        st.equal(qs.stringify({ 'my weird field': '~q1!2"\'w$5&7/z8)?' }), 'my%20weird%20field=~q1%212%22%27w%245%267%2Fz8%29%3F');
        st.end();
    });

    t.test('skips properties that are part of the object prototype', function (st) {
        st.intercept(Object.prototype, 'crash', { value: 'test' });

        st.equal(qs.stringify({ a: 'b' }), 'a=b');
        st.equal(qs.stringify({ a: { b: 'c' } }), 'a%5Bb%5D=c');

        st.end();
    });

    t.test('stringifies boolean values', function (st) {
        st.equal(qs.stringify({ a: true }), 'a=true');
        st.equal(qs.stringify({ a: { b: true } }), 'a%5Bb%5D=true');
        st.equal(qs.stringify({ b: false }), 'b=false');
        st.equal(qs.stringify({ b: { c: false } }), 'b%5Bc%5D=false');
        st.end();
    });

    t.test('stringifies buffer values', function (st) {
        st.equal(qs.stringify({ a: SaferBuffer.from('test') }), 'a=test');
        st.equal(qs.stringify({ a: { b: SaferBuffer.from('test') } }), 'a%5Bb%5D=test');
        st.end();
    });

    t.test('does not throw on a non-callable `constructor.isBuffer` key', function (st) {
        var input = { a: { constructor: { isBuffer: 'x' } } };
        st.doesNotThrow(function () { qs.stringify(input); });
        st.equal(qs.stringify(input), 'a%5Bconstructor%5D%5BisBuffer%5D=x');
        st.equal(qs.stringify({ a: { constructor: { isBuffer: { b: 'c' } } } }), 'a%5Bconstructor%5D%5BisBuffer%5D%5Bb%5D=c');
        st.equal(qs.stringify({ a: { constructor: { isBuffer: ['b'] } } }), 'a%5Bconstructor%5D%5BisBuffer%5D%5B0%5D=b');
        st.equal(qs.stringify({ a: { constructor: { isBuffer: true } } }), 'a%5Bconstructor%5D%5BisBuffer%5D=true');
        st.end();
    });

    t.test('round-trips a parsed `constructor[isBuffer]` key', function (st) {
        var str = 'x%5Bconstructor%5D%5BisBuffer%5D=y';

        var plain = qs.parse(str, { plainObjects: true });
        st.deepEqual(plain, { __proto__: null, x: { __proto__: null, constructor: { __proto__: null, isBuffer: 'y' } } }, 'plainObjects keeps the key');
        st.doesNotThrow(function () { qs.stringify(plain); });
        st.equal(qs.stringify(plain), str, 'plainObjects round-trips');

        var proto = qs.parse(str, { allowPrototypes: true });
        st.deepEqual(proto, { x: { constructor: { isBuffer: 'y' } } }, 'allowPrototypes keeps the key');
        st.doesNotThrow(function () { qs.stringify(proto); });
        st.equal(qs.stringify(proto), str, 'allowPrototypes round-trips');

        st.equal(qs.stringify(qs.parse(str)), '', 'default options drop the key');
        st.end();
    });

    t.test('stringifies an object using an alternative delimiter', function (st) {
        st.equal(qs.stringify({ a: 'b', c: 'd' }, { delimiter: ';' }), 'a=b;c=d');
        st.end();
    });

    t.test('does not blow up when Buffer global is missing', function (st) {
        var restore = mockProperty(global, 'Buffer', { 'delete': true });

        var result = qs.stringify({ a: 'b', c: 'd' });

        restore();

        st.equal(result, 'a=b&c=d');
        st.end();
    });

    t.test('does not crash when parsing circular references', function (st) {
        var a = {};
        a.b = a;

        st['throws'](
            function () { qs.stringify({ 'foo[bar]': 'baz', 'foo[baz]': a }); },
            /RangeError: Cyclic object value/,
            'cyclic values throw'
        );

        var circular = {
            a: 'value'
        };
        circular.a = circular;
        st['throws'](
            function () { qs.stringify(circular); },
            /RangeError: Cyclic object value/,
            'cyclic values throw'
        );

        var arr = ['a'];
        st.doesNotThrow(
            function () { qs.stringify({ x: arr, y: arr }); },
            'non-cyclic values do not throw'
        );

        st.end();
    });

    t.test('non-circular duplicated references can still work', function (st) {
        var hourOfDay = {
            'function': 'hour_of_day'
        };

        var p1 = {
            'function': 'gte',
            arguments: [hourOfDay, 0]
        };
        var p2 = {
            'function': 'lte',
            arguments: [hourOfDay, 23]
        };

        st.equal(
            qs.stringify({ filters: { $and: [p1, p2] } }, { encodeValuesOnly: true, arrayFormat: 'indices' }),
            'filters[$and][0][function]=gte&filters[$and][0][arguments][0][function]=hour_of_day&filters[$and][0][arguments][1]=0&filters[$and][1][function]=lte&filters[$and][1][arguments][0][function]=hour_of_day&filters[$and][1][arguments][1]=23'
        );
        st.equal(
            qs.stringify({ filters: { $and: [p1, p2] } }, { encodeValuesOnly: true, arrayFormat: 'brackets' }),
            'filters[$and][][function]=gte&filters[$and][][arguments][][function]=hour_of_day&filters[$and][][arguments][]=0&filters[$and][][function]=lte&filters[$and][][arguments][][function]=hour_of_day&filters[$and][][arguments][]=23'
        );
        st.equal(
            qs.stringify({ filters: { $and: [p1, p2] } }, { encodeValuesOnly: true, arrayFormat: 'repeat' }),
            'filters[$and][function]=gte&filters[$and][arguments][function]=hour_of_day&filters[$and][arguments]=0&filters[$and][function]=lte&filters[$and][arguments][function]=hour_of_day&filters[$and][arguments]=23'
        );

        st.end();
    });

    t.test('selects properties when filter=array', function (st) {
        st.equal(qs.stringify({ a: 'b' }, { filter: ['a'] }), 'a=b');
        st.equal(qs.stringify({ a: 1 }, { filter: [] }), '');

        st.equal(
            qs.stringify(
                { a: { b: [1, 2, 3, 4], c: 'd' }, c: 'f' },
                { filter: ['a', 'b', 0, 2], arrayFormat: 'indices' }
            ),
            'a%5Bb%5D%5B0%5D=1&a%5Bb%5D%5B2%5D=3',
            'indices => indices'
        );
        st.equal(
            qs.stringify(
                { a: { b: [1, 2, 3, 4], c: 'd' }, c: 'f' },
                { filter: ['a', 'b', 0, 2], arrayFormat: 'brackets' }
            ),
            'a%5Bb%5D%5B%5D=1&a%5Bb%5D%5B%5D=3',
            'brackets => brackets'
        );
        st.equal(
            qs.stringify(
                { a: { b: [1, 2, 3, 4], c: 'd' }, c: 'f' },
                { filter: ['a', 'b', 0, 2] }
            ),
            'a%5Bb%5D%5B0%5D=1&a%5Bb%5D%5B2%5D=3',
            'default => indices'
        );

        st.end();
    });

    t.test('skips null/undefined entries in filter=array', function (st) {
        st.doesNotThrow(
            function () { qs.stringify({ a: 'b', undefined: 'x' }, { filter: ['a', undefined] }); },
            'does not pass a raw undefined filter entry to the encoder'
        );
        st.doesNotThrow(
            function () { qs.stringify({ a: 'b', 'null': 'x' }, { filter: ['a', null] }); },
            'does not pass a raw null filter entry to the encoder'
        );

        st.equal(
            qs.stringify({ a: 'b', undefined: 'x', c: 'd' }, { filter: ['a', undefined, 'c'] }),
            'a=b&c=d',
            'undefined filter entry is skipped, remaining keys are kept'
        );
        st.equal(
            qs.stringify({ a: 'b', 'null': 'x', c: 'd' }, { filter: ['a', null, 'c'] }),
            'a=b&c=d',
            'null filter entry is skipped, remaining keys are kept'
        );
        st.equal(
            qs.stringify({ a: 'b', 'null': 'x' }, { filter: [null] }),
            '',
            'filter array containing only null yields empty string'
        );

        st.end();
    });

    t.test('applies sort to nested keys selected by filter=array', function (st) {
        var asc = function (a, b) { return a.localeCompare(b); };
        var desc = function (a, b) { return b.localeCompare(a); };

        st.equal(
            qs.stringify({ a: { c: 1, b: 2 }, z: 3 }, { filter: ['z', 'a', 'c', 'b'], sort: asc, encode: false }),
            'a[b]=2&a[c]=1&z=3',
            'nested keys are sorted, not left in filter order'
        );
        st.equal(
            qs.stringify({ a: { c: 1, b: 2 }, z: 3 }, { filter: ['z', 'b', 'a', 'c'], sort: desc, encode: false }),
            'z=3&a[c]=1&a[b]=2',
            'nested keys follow a descending sort'
        );
        st.equal(
            qs.stringify({ a: [{ y: 1, x: 2 }] }, { filter: ['a', '0', 'y', 'x'], sort: asc, encode: false }),
            'a[0][x]=2&a[0][y]=1',
            'keys of objects nested in arrays are sorted'
        );
        st.equal(
            qs.stringify({ a: { c: 1, b: 2 }, z: 3 }, { filter: ['z', 'a', 'c', 'b'], encode: false }),
            'z=3&a[c]=1&a[b]=2',
            'without sort, keys keep filter order at every level'
        );

        st.end();
    });

    t.test('does not reorder the caller\'s filter array when sorting', function (st) {
        var filter = ['z', 'a', 'c', 'b'];
        var asc = function (a, b) { return a.localeCompare(b); };

        st.equal(
            qs.stringify({ a: { c: 1, b: 2 }, z: 3 }, { filter: filter, sort: asc, encode: false }),
            'a[b]=2&a[c]=1&z=3',
            'keys are sorted at every level'
        );
        st.deepEqual(filter, ['z', 'a', 'c', 'b'], 'filter array is not mutated');
        st.equal(
            qs.stringify({ a: { c: 1, b: 2 }, z: 3 }, { filter: filter, encode: false }),
            'z=3&a[c]=1&a[b]=2',
            'reusing the filter without sort keeps its own order'
        );

        st.end();
    });

    t.test('supports custom representations when filter=function', function (st) {
        var calls = 0;
        var obj = { a: 'b', c: 'd', e: { f: new Date(1257894000000) } };
        var filterFunc = function (prefix, value) {
            calls += 1;
            if (calls === 1) {
                st.equal(prefix, '', 'prefix is empty');
                st.equal(value, obj);
            } else if (prefix === 'c') {
                return void 0;
            } else if (value instanceof Date) {
                st.equal(prefix, 'e[f]');
                return value.getTime();
            }
            return value;
        };

        st.equal(qs.stringify(obj, { filter: filterFunc }), 'a=b&e%5Bf%5D=1257894000000');
        st.equal(calls, 5);
        st.end();
    });

    t.test('serializes Date values unless filter transforms them', function (st) {
        var obj = {
            a: new Date(Date.UTC(2023, 2, 7, 9, 2, 41, 260)),
            b: [new Date(Date.UTC(2023, 2, 7, 9, 2, 41, 260))]
        };
        var iso = '2023-03-07T09%3A02%3A41.260Z';
        st.equal(
            qs.stringify(obj, { filter: function (prefix, value) { return value; } }),
            'a=' + iso + '&b%5B0%5D=' + iso,
            'Dates returned unchanged by a filter are serialized'
        );
        st.equal(
            qs.stringify({ a: new Date(0) }, { filter: function (prefix, value) { return value instanceof Date ? 'kept' : value; } }),
            'a=kept',
            'a filter that transforms a Date wins over default serialization'
        );
        st.end();
    });

    t.test('applies default Date handling to whatever a filter function returns', function (st) {
        var date = new Date(Date.UTC(2023, 2, 7, 9, 2, 41, 260));
        var iso = '2023-03-07T09%3A02%3A41.260Z';
        var identity = function (prefix, value) { return value; };

        st.equal(
            qs.stringify({ a: { b: date } }, { filter: identity }),
            'a%5Bb%5D=' + iso,
            'a nested Date is serialized through a filter'
        );
        st.equal(
            qs.stringify(
                { a: date },
                { filter: identity, serializeDate: function (d) { return String(d.getTime()); } }
            ),
            'a=1678179761260',
            '`serializeDate` is honored after a filter'
        );
        st.equal(
            qs.stringify({ a: [date, 'x'] }, { filter: identity, arrayFormat: 'comma' }),
            'a=' + iso + '%2Cx',
            'Dates inside a comma array are serialized through a filter, not stringified as locale text'
        );
        st.equal(
            qs.stringify({ a: 'x' }, { filter: function (prefix, value) { return prefix === 'a' ? date : value; } }),
            'a=' + iso,
            'a Date produced by the filter is serialized'
        );
        st.equal(
            qs.stringify({ a: date, b: 1 }, { filter: ['a'] }),
            'a=' + iso,
            'an array filter still serializes Dates'
        );
        st['throws'](
            function () { qs.stringify({ a: new Date(NaN) }, { filter: identity }); },
            RangeError,
            'an invalid Date through a filter throws like the no-filter path'
        );
        st.end();
    });

    t.test('can disable uri encoding', function (st) {
        st.equal(qs.stringify({ a: 'b' }, { encode: false }), 'a=b');
        st.equal(qs.stringify({ a: { b: 'c' } }, { encode: false }), 'a[b]=c');
        st.equal(qs.stringify({ a: 'b', c: null }, { strictNullHandling: true, encode: false }), 'a=b&c');
        st.end();
    });

    t.test('can sort the keys', function (st) {
        var sort = function (a, b) {
            return a.localeCompare(b);
        };
        st.equal(qs.stringify({ a: 'c', z: 'y', b: 'f' }, { sort: sort }), 'a=c&b=f&z=y');
        st.equal(qs.stringify({ a: 'c', z: { j: 'a', i: 'b' }, b: 'f' }, { sort: sort }), 'a=c&b=f&z%5Bi%5D=b&z%5Bj%5D=a');
        st.end();
    });

    t.test('can sort the keys at depth 3 or more too', function (st) {
        var sort = function (a, b) {
            return a.localeCompare(b);
        };
        st.equal(
            qs.stringify(
                { a: 'a', z: { zj: { zjb: 'zjb', zja: 'zja' }, zi: { zib: 'zib', zia: 'zia' } }, b: 'b' },
                { sort: sort, encode: false }
            ),
            'a=a&b=b&z[zi][zia]=zia&z[zi][zib]=zib&z[zj][zja]=zja&z[zj][zjb]=zjb'
        );
        st.equal(
            qs.stringify(
                { a: 'a', z: { zj: { zjb: 'zjb', zja: 'zja' }, zi: { zib: 'zib', zia: 'zia' } }, b: 'b' },
                { sort: null, encode: false }
            ),
            'a=a&z[zj][zjb]=zjb&z[zj][zja]=zja&z[zi][zib]=zib&z[zi][zia]=zia&b=b'
        );
        st.end();
    });

    t.test('can stringify with custom encoding', function (st) {
        st.equal(qs.stringify({ 県: '大阪府', '': '' }, {
            encoder: function (str) {
                if (str.length === 0) {
                    return '';
                }
                var buf = iconv.encode(str, 'shiftjis');
                var result = [];
                for (var i = 0; i < buf.length; ++i) {
                    result.push(buf.readUInt8(i).toString(16));
                }
                return '%' + result.join('%');
            }
        }), '%8c%a7=%91%e5%8d%e3%95%7b&=');
        st.end();
    });

    t.test('receives the default encoder as a second argument', function (st) {
        st.plan(8);

        qs.stringify({ a: 1, b: new Date(), c: true, d: [1] }, {
            encoder: function (str) {
                st.match(typeof str, /^(?:string|number|boolean)$/);
                return '';
            }
        });

        st.end();
    });

    t.test('receives the default encoder as a second argument', function (st) {
        st.plan(2);

        qs.stringify({ a: 1 }, {
            encoder: function (str, defaultEncoder) {
                st.equal(defaultEncoder, utils.encode);
            }
        });

        st.end();
    });

    t.test('throws error with wrong encoder', function (st) {
        st['throws'](function () {
            qs.stringify({}, { encoder: 'string' });
        }, new TypeError('Encoder has to be a function.'));
        st.end();
    });

    t.test('can use custom encoder for a buffer object', { skip: typeof Buffer === 'undefined' }, function (st) {
        st.equal(qs.stringify({ a: SaferBuffer.from([1]) }, {
            encoder: function (buffer) {
                if (typeof buffer === 'string') {
                    return buffer;
                }
                return String.fromCharCode(buffer.readUInt8(0) + 97);
            }
        }), 'a=b');

        st.equal(qs.stringify({ a: SaferBuffer.from('a b') }, {
            encoder: function (buffer) {
                return buffer;
            }
        }), 'a=a b');
        st.end();
    });

    t.test('serializeDate option', function (st) {
        var date = new Date();
        st.equal(
            qs.stringify({ a: date }),
            'a=' + date.toISOString().replace(/:/g, '%3A'),
            'default is toISOString'
        );

        var mutatedDate = new Date();
        mutatedDate.toISOString = function () {
            throw new SyntaxError();
        };
        st['throws'](function () {
            mutatedDate.toISOString();
        }, SyntaxError);
        st.equal(
            qs.stringify({ a: mutatedDate }),
            'a=' + Date.prototype.toISOString.call(mutatedDate).replace(/:/g, '%3A'),
            'toISOString works even when method is not locally present'
        );

        var specificDate = new Date(6);
        st.equal(
            qs.stringify(
                { a: specificDate },
                { serializeDate: function (d) { return d.getTime() * 7; } }
            ),
            'a=42',
            'custom serializeDate function called'
        );

        st.equal(
            qs.stringify(
                { a: [date] },
                {
                    serializeDate: function (d) { return d.getTime(); },
                    arrayFormat: 'comma'
                }
            ),
            'a=' + date.getTime(),
            'works with arrayFormat comma'
        );
        st.equal(
            qs.stringify(
                { a: [date] },
                {
                    serializeDate: function (d) { return d.getTime(); },
                    arrayFormat: 'comma',
                    commaRoundTrip: true
                }
            ),
            'a%5B%5D=' + date.getTime(),
            'works with arrayFormat comma'
        );

        st.end();
    });

    t.test('RFC 1738 serialization', function (st) {
        st.equal(qs.stringify({ a: 'b c' }, { format: qs.formats.RFC1738 }), 'a=b+c');
        st.equal(qs.stringify({ 'a b': 'c d' }, { format: qs.formats.RFC1738 }), 'a+b=c+d');
        st.equal(qs.stringify({ 'a b': SaferBuffer.from('a b') }, { format: qs.formats.RFC1738 }), 'a+b=a+b');

        st.equal(qs.stringify({ 'foo(ref)': 'bar' }, { format: qs.formats.RFC1738 }), 'foo(ref)=bar');
        st.equal(qs.stringify({ 'a~*': '~*()' }, { format: qs.formats.RFC1738 }), 'a~%2A=~%2A()', 'leaves `~` unencoded and encodes `*`');

        st.end();
    });

    t.test('RFC 3986 spaces serialization', function (st) {
        st.equal(qs.stringify({ a: 'b c' }, { format: qs.formats.RFC3986 }), 'a=b%20c');
        st.equal(qs.stringify({ 'a b': 'c d' }, { format: qs.formats.RFC3986 }), 'a%20b=c%20d');
        st.equal(qs.stringify({ 'a b': SaferBuffer.from('a b') }, { format: qs.formats.RFC3986 }), 'a%20b=a%20b');
        st.equal(qs.stringify({ 'a~*': '~*()' }, { format: qs.formats.RFC3986 }), 'a~%2A=~%2A%28%29', 'leaves `~` unencoded, and encodes `*` and parens');

        st.end();
    });

    t.test('WHATWG serialization', function (st) {
        st.equal(qs.formats.WHATWG, 'WHATWG', 'is exported');
        st.equal(qs.stringify({ a: 'b c' }, { format: qs.formats.WHATWG }), 'a=b+c');
        st.equal(qs.stringify({ 'a b': 'c d' }, { format: qs.formats.WHATWG }), 'a+b=c+d');
        st.equal(qs.stringify({ 'a b': SaferBuffer.from('a b') }, { format: qs.formats.WHATWG }), 'a+b=a+b');

        st.equal(qs.stringify({ a: '~' }, { format: qs.formats.WHATWG }), 'a=%7E', 'encodes `~`');
        st.equal(qs.stringify({ a: '*' }, { format: qs.formats.WHATWG }), 'a=*', 'does not encode `*`');
        st.equal(qs.stringify({ 'foo(ref)': 'bar' }, { format: qs.formats.WHATWG }), 'foo%28ref%29=bar', 'encodes parentheses');
        st.equal(qs.stringify({ a: '-._' }, { format: qs.formats.WHATWG }), 'a=-._');
        st.equal(qs.stringify({ a: '+&=' }, { format: qs.formats.WHATWG }), 'a=%2B%26%3D');
        st.equal(qs.stringify({ a: { b: 'c d' } }, { format: qs.formats.WHATWG }), 'a%5Bb%5D=c+d');
        st.equal(qs.stringify({ a: 'b c' }, { format: qs.formats.WHATWG, encode: false }), 'a=b c', 'encode: false leaves the value alone');

        st.equal(
            qs.stringify({ 'a~b*': { 'c d': '~* ' } }, { format: qs.formats.WHATWG, encodeValuesOnly: true }),
            'a~b*[c d]=%7E*+',
            'encodeValuesOnly: leaves keys alone'
        );
        st.equal(
            qs.stringify({ a: '~*\u00e9 ' }, { format: qs.formats.WHATWG, charset: 'iso-8859-1' }),
            'a=%7E*%E9+',
            'charset iso-8859-1'
        );
        st.equal(
            qs.stringify({ a: '~* ' }, {
                format: qs.formats.WHATWG,
                encoder: function (str, defaultEncoder, charset, type, format) {
                    return defaultEncoder(str, defaultEncoder, charset, type, format);
                }
            }),
            'a=%7E*+',
            'an encoder wrapping the default encoder'
        );
        st.equal(
            qs.stringify({ a: ['~ x', '*'] }, { format: qs.formats.WHATWG, arrayFormat: 'comma' }),
            'a=%7E+x%2C*',
            'arrayFormat comma'
        );

        st.end();
    });

    var USP = typeof URLSearchParams === 'function' ? URLSearchParams : url.URLSearchParams;

    t.test('WHATWG serialization matches URLSearchParams', { skip: typeof USP !== 'function' }, function (st) {
        var chars = [];
        for (var c = 0; c < 0x80; c++) {
            chars[chars.length] = String.fromCharCode(c);
        }
        chars.push('\u00e9', '\u20ac', '\uFFFF', '\uD83D\uDCA9', 'a b~c*d(e)f', '\uD800', '\uDC00', 'x\uDC00y');

        for (var i = 0; i < chars.length; i++) {
            var key = {};
            key[chars[i]] = 'v';
            st.equal(
                qs.stringify({ k: chars[i] }, { format: qs.formats.WHATWG }),
                new USP([['k', chars[i]]]).toString(),
                'value ' + JSON.stringify(chars[i])
            );
            st.equal(
                qs.stringify(key, { format: qs.formats.WHATWG }),
                new USP([[chars[i], 'v']]).toString(),
                'key ' + JSON.stringify(chars[i])
            );
        }

        st.equal(
            qs.stringify({ a: { 'b~': 'c d' } }, { format: qs.formats.WHATWG }),
            new USP([['a[b~]', 'c d']]).toString(),
            'nested key'
        );

        st.end();
    });

    t.test('Backward compatibility to RFC 3986', function (st) {
        st.equal(qs.stringify({ a: 'b c' }), 'a=b%20c');
        st.equal(qs.stringify({ 'a b': SaferBuffer.from('a b') }), 'a%20b=a%20b');

        st.end();
    });

    t.test('Edge cases and unknown formats', function (st) {
        ['UFO1234', false, 1234, null, {}, []].forEach(function (format) {
            st['throws'](
                function () {
                    qs.stringify({ a: 'b c' }, { format: format });
                },
                new TypeError('Unknown format option provided.')
            );
        });
        st.end();
    });

    t.test('encodeValuesOnly', function (st) {
        st.equal(
            qs.stringify(
                { a: 'b', c: ['d', 'e=f'], f: [['g'], ['h']] },
                { encodeValuesOnly: true, arrayFormat: 'indices' }
            ),
            'a=b&c[0]=d&c[1]=e%3Df&f[0][0]=g&f[1][0]=h',
            'encodeValuesOnly + indices'
        );
        st.equal(
            qs.stringify(
                { a: 'b', c: ['d', 'e=f'], f: [['g'], ['h']] },
                { encodeValuesOnly: true, arrayFormat: 'brackets' }
            ),
            'a=b&c[]=d&c[]=e%3Df&f[][]=g&f[][]=h',
            'encodeValuesOnly + brackets'
        );
        st.equal(
            qs.stringify(
                { a: 'b', c: ['d', 'e=f'], f: [['g'], ['h']] },
                { encodeValuesOnly: true, arrayFormat: 'repeat' }
            ),
            'a=b&c=d&c=e%3Df&f=g&f=h',
            'encodeValuesOnly + repeat'
        );

        st.equal(
            qs.stringify(
                { a: 'b', c: ['d', 'e'], f: [['g'], ['h']] },
                { arrayFormat: 'indices' }
            ),
            'a=b&c%5B0%5D=d&c%5B1%5D=e&f%5B0%5D%5B0%5D=g&f%5B1%5D%5B0%5D=h',
            'no encodeValuesOnly + indices'
        );
        st.equal(
            qs.stringify(
                { a: 'b', c: ['d', 'e'], f: [['g'], ['h']] },
                { arrayFormat: 'brackets' }
            ),
            'a=b&c%5B%5D=d&c%5B%5D=e&f%5B%5D%5B%5D=g&f%5B%5D%5B%5D=h',
            'no encodeValuesOnly + brackets'
        );
        st.equal(
            qs.stringify(
                { a: 'b', c: ['d', 'e'], f: [['g'], ['h']] },
                { arrayFormat: 'repeat' }
            ),
            'a=b&c=d&c=e&f=g&f=h',
            'no encodeValuesOnly + repeat'
        );

        st.end();
    });

    t.test('encodeValuesOnly - strictNullHandling', function (st) {
        st.equal(
            qs.stringify(
                { a: { b: null } },
                { encodeValuesOnly: true, strictNullHandling: true }
            ),
            'a[b]'
        );
        st.end();
    });

    t.test('strictNullHandling: applies the formatter to the encoded key (RFC1738)', function (st) {
        st.equal(
            qs.stringify(
                { 'a b': null, 'c d': 'e f' },
                { strictNullHandling: false, format: 'RFC1738' }
            ),
            'a+b=&c+d=e+f',
            'without: as expected'
        );

        st.equal(
            qs.stringify(
                { 'a b': null, 'c d': 'e f' },
                { strictNullHandling: true, format: 'RFC1738' }
            ),
            'a+b&c+d=e+f',
            'with: as expected'
        );

        st.end();
    });

    t.test('throws if an invalid charset is specified', function (st) {
        st['throws'](function () {
            qs.stringify({ a: 'b' }, { charset: 'foobar' });
        }, new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined'));
        st.end();
    });

    t.test('respects a charset of iso-8859-1', function (st) {
        st.equal(qs.stringify({ æ: 'æ' }, { charset: 'iso-8859-1' }), '%E6=%E6');
        st.end();
    });

    t.test('encodes unrepresentable chars as numeric entities in iso-8859-1 mode', function (st) {
        st.equal(qs.stringify({ a: '☺' }, { charset: 'iso-8859-1' }), 'a=%26%239786%3B');
        st.end();
    });

    t.test('encodes a literal `+` as `%2B` in iso-8859-1 mode so it round-trips', function (st) {
        st.equal(qs.stringify({ a: 'b+c' }, { charset: 'iso-8859-1' }), 'a=b%2Bc', 'a `+` in a value is percent-encoded');
        st.equal(qs.stringify({ 'a+b': 'c' }, { charset: 'iso-8859-1' }), 'a%2Bb=c', 'a `+` in a key is percent-encoded');
        st.deepEqual(
            qs.parse(qs.stringify({ a: 'b+c' }, { charset: 'iso-8859-1' }), { charset: 'iso-8859-1' }),
            { a: 'b+c' },
            'the `+` survives a round-trip instead of decoding to a space'
        );
        st.end();
    });

    t.test('respects an explicit charset of utf-8 (the default)', function (st) {
        st.equal(qs.stringify({ a: 'æ' }, { charset: 'utf-8' }), 'a=%C3%A6');
        st.end();
    });

    t.test('`charsetSentinel` option', function (st) {
        st.equal(
            qs.stringify({ a: 'æ' }, { charsetSentinel: true, charset: 'utf-8' }),
            'utf8=%E2%9C%93&a=%C3%A6',
            'adds the right sentinel when instructed to and the charset is utf-8'
        );

        st.equal(
            qs.stringify({ a: 'æ' }, { charsetSentinel: true, charset: 'iso-8859-1' }),
            'utf8=%26%2310003%3B&a=%E6',
            'adds the right sentinel when instructed to and the charset is iso-8859-1'
        );

        st.equal(
            qs.stringify({ a: 1, b: 2 }, { charsetSentinel: true, delimiter: ';' }),
            'utf8=%E2%9C%93;a=1;b=2',
            'uses the configured delimiter after the sentinel'
        );

        st.end();
    });

    t.test('does not mutate the options argument', function (st) {
        var options = {};
        qs.stringify({}, options);
        st.deepEqual(options, {});
        st.end();
    });

    t.test('strictNullHandling works with custom filter', function (st) {
        var filter = function (prefix, value) {
            return value;
        };

        var options = { strictNullHandling: true, filter: filter };
        st.equal(qs.stringify({ key: null }, options), 'key');
        st.end();
    });

    t.test('strictNullHandling works with null serializeDate', function (st) {
        var serializeDate = function () {
            return null;
        };
        var options = { strictNullHandling: true, serializeDate: serializeDate };
        var date = new Date();
        st.equal(qs.stringify({ key: date }, options), 'key');
        st.end();
    });

    t.test('allows for encoding keys and values differently', function (st) {
        var encoder = function (str, defaultEncoder, charset, type) {
            if (type === 'key') {
                return defaultEncoder(str, defaultEncoder, charset, type).toLowerCase();
            }
            if (type === 'value') {
                return defaultEncoder(str, defaultEncoder, charset, type).toUpperCase();
            }
            throw 'this should never happen! type: ' + type;
        };

        st.deepEqual(qs.stringify({ KeY: 'vAlUe' }, { encoder: encoder }), 'key=VALUE');

        var noopEncoder = function () { return 'x'; };
        noopEncoder();
        st['throws'](
            function () { encoder('x', noopEncoder, 'utf-8', 'unknown'); },
            'this should never happen! type: unknown',
            'encoder throws for unexpected type'
        );

        st.end();
    });

    t.test('objects inside arrays', function (st) {
        var obj = { a: { b: { c: 'd', e: 'f' } } };
        var withArray = { a: { b: [{ c: 'd', e: 'f' }] } };

        st.equal(qs.stringify(obj, { encode: false }), 'a[b][c]=d&a[b][e]=f', 'no array, no arrayFormat');
        st.equal(qs.stringify(obj, { encode: false, arrayFormat: 'brackets' }), 'a[b][c]=d&a[b][e]=f', 'no array, bracket');
        st.equal(qs.stringify(obj, { encode: false, arrayFormat: 'indices' }), 'a[b][c]=d&a[b][e]=f', 'no array, indices');
        st.equal(qs.stringify(obj, { encode: false, arrayFormat: 'repeat' }), 'a[b][c]=d&a[b][e]=f', 'no array, repeat');
        st.equal(qs.stringify(obj, { encode: false, arrayFormat: 'comma' }), 'a[b][c]=d&a[b][e]=f', 'no array, comma');

        st.equal(qs.stringify(withArray, { encode: false }), 'a[b][0][c]=d&a[b][0][e]=f', 'array, no arrayFormat');
        st.equal(qs.stringify(withArray, { encode: false, arrayFormat: 'brackets' }), 'a[b][][c]=d&a[b][][e]=f', 'array, bracket');
        st.equal(qs.stringify(withArray, { encode: false, arrayFormat: 'indices' }), 'a[b][0][c]=d&a[b][0][e]=f', 'array, indices');
        st.equal(qs.stringify(withArray, { encode: false, arrayFormat: 'repeat' }), 'a[b][c]=d&a[b][e]=f', 'array, repeat');
        st.equal(
            qs.stringify(withArray, { encode: false, arrayFormat: 'comma' }),
            '???',
            'array, comma',
            { skip: 'TODO: figure out what this should do' }
        );

        st.end();
    });

    t.test('stringifies sparse arrays', function (st) {
        /* eslint no-sparse-arrays: 0 */
        st.equal(qs.stringify({ a: [, '2', , , '1'] }, { encodeValuesOnly: true, arrayFormat: 'indices' }), 'a[1]=2&a[4]=1');
        st.equal(qs.stringify({ a: [, '2', , , '1'] }, { encodeValuesOnly: true, arrayFormat: 'brackets' }), 'a[]=2&a[]=1');
        st.equal(qs.stringify({ a: [, '2', , , '1'] }, { encodeValuesOnly: true, arrayFormat: 'repeat' }), 'a=2&a=1');

        st.equal(qs.stringify({ a: [, { b: [, , { c: '1' }] }] }, { encodeValuesOnly: true, arrayFormat: 'indices' }), 'a[1][b][2][c]=1');
        st.equal(qs.stringify({ a: [, { b: [, , { c: '1' }] }] }, { encodeValuesOnly: true, arrayFormat: 'brackets' }), 'a[][b][][c]=1');
        st.equal(qs.stringify({ a: [, { b: [, , { c: '1' }] }] }, { encodeValuesOnly: true, arrayFormat: 'repeat' }), 'a[b][c]=1');

        st.equal(qs.stringify({ a: [, [, , [, , , { c: '1' }]]] }, { encodeValuesOnly: true, arrayFormat: 'indices' }), 'a[1][2][3][c]=1');
        st.equal(qs.stringify({ a: [, [, , [, , , { c: '1' }]]] }, { encodeValuesOnly: true, arrayFormat: 'brackets' }), 'a[][][][c]=1');
        st.equal(qs.stringify({ a: [, [, , [, , , { c: '1' }]]] }, { encodeValuesOnly: true, arrayFormat: 'repeat' }), 'a[c]=1');

        st.equal(qs.stringify({ a: [, [, , [, , , { c: [, '1'] }]]] }, { encodeValuesOnly: true, arrayFormat: 'indices' }), 'a[1][2][3][c][1]=1');
        st.equal(qs.stringify({ a: [, [, , [, , , { c: [, '1'] }]]] }, { encodeValuesOnly: true, arrayFormat: 'brackets' }), 'a[][][][c][]=1');
        st.equal(qs.stringify({ a: [, [, , [, , , { c: [, '1'] }]]] }, { encodeValuesOnly: true, arrayFormat: 'repeat' }), 'a[c]=1');

        st.end();
    });

    t.test('encodes a very long string', function (st) {
        var chars = [];
        var expected = [];
        for (var i = 0; i < 5e3; i++) {
            chars.push(' ' + i);

            expected.push('%20' + i);
        }

        var obj = {
            foo: chars.join('')
        };

        st.equal(
            qs.stringify(obj, { arrayFormat: 'brackets', charset: 'utf-8' }),
            'foo=' + expected.join('')
        );

        st.end();
    });

    t.end();
});

test('stringifies empty keys', function (t) {
    emptyTestCases.forEach(function (testCase) {
        t.test('stringifies an object with empty string key with ' + testCase.input, function (st) {
            st.deepEqual(
                qs.stringify(testCase.withEmptyKeys, { encode: false, arrayFormat: 'indices' }),
                testCase.stringifyOutput.indices,
                'test case: ' + testCase.input + ', indices'
            );
            st.deepEqual(
                qs.stringify(testCase.withEmptyKeys, { encode: false, arrayFormat: 'brackets' }),
                testCase.stringifyOutput.brackets,
                'test case: ' + testCase.input + ', brackets'
            );
            st.deepEqual(
                qs.stringify(testCase.withEmptyKeys, { encode: false, arrayFormat: 'repeat' }),
                testCase.stringifyOutput.repeat,
                'test case: ' + testCase.input + ', repeat'
            );

            st.end();
        });
    });

    t.test('edge case with object/arrays', function (st) {
        st.deepEqual(qs.stringify({ '': { '': [2, 3] } }, { encode: false }), '[][0]=2&[][1]=3');
        st.deepEqual(qs.stringify({ '': { '': [2, 3], a: 2 } }, { encode: false }), '[][0]=2&[][1]=3&[a]=2');
        st.deepEqual(qs.stringify({ '': { '': [2, 3] } }, { encode: false, arrayFormat: 'indices' }), '[][0]=2&[][1]=3');
        st.deepEqual(qs.stringify({ '': { '': [2, 3], a: 2 } }, { encode: false, arrayFormat: 'indices' }), '[][0]=2&[][1]=3&[a]=2');

        st.end();
    });

    t.test('stringifies non-string keys', function (st) {
        var S = Object('abc');
        S.toString = function () {
            return 'd';
        };
        var actual = qs.stringify({ a: 'b', 'false': {}, 1e+22: 'c', d: 'e' }, {
            filter: ['a', false, null, 10000000000000000000000, S],
            allowDots: true,
            encodeDotInKeys: true
        });

        st.equal(actual, 'a=b&1e%2B22=c&d=e', 'stringifies correctly');

        st.end();
    });

    t.test('round-trips keys containing percent-encoded bracket text', function (st) {
        var cases = [
            { 'a%5Bb': 'c' },
            { 'a%5Db': 'c' },
            { 'a%255Bb': 'c' },
            { 'a%255Db': 'c' },
            { a: { 'b%5Bc': 'd' } },
            { a: { 'b%255Bc': 'd' } },
            { 'a%5B%255Bb': 'c' }
        ];
        for (var i = 0; i < cases.length; i++) {
            st.deepEqual(
                qs.parse(qs.stringify(cases[i])),
                cases[i],
                'round-trips ' + JSON.stringify(cases[i])
            );
        }

        st.end();
    });

    t.test('parses input containing percent-encoded bracket text without mangling', function (st) {
        st.deepEqual(qs.parse('a%25255Bb=c'), { 'a%255Bb': 'c' }, 'a%25255Bb decodes to a%255Bb, not a%5Bb');
        st.deepEqual(qs.parse('a%25255Db=c'), { 'a%255Db': 'c' }, 'a%25255Db decodes to a%255Db, not a%5Db');
        st.deepEqual(qs.parse('a%5Bb%25255Bc%5D=d'), { a: { 'b%255Bc': 'd' } }, 'nested %25255B decodes to %255B inside segment, not %5B');

        st.end();
    });

    t.test('limits nesting depth with the `depth` option', function (st) {
        st.equal(
            qs.stringify({ a: { b: { c: 'd' } } }),
            'a%5Bb%5D%5Bc%5D=d',
            'the default depth is unlimited and does not alter output'
        );
        st.equal(
            qs.stringify({ a: { b: { c: 'd' } } }, { depth: 2 }),
            'a%5Bb%5D%5Bc%5D=d',
            'does not throw when nesting is within the depth limit'
        );
        st.equal(
            qs.stringify({ a: { b: 'c' } }, { depth: Infinity }),
            'a%5Bb%5D=c',
            'an explicit Infinity depth is unlimited'
        );
        st.equal(
            qs.stringify({ a: { b: { c: { d: 'e' } } } }, { depth: null }),
            qs.stringify({ a: { b: { c: { d: 'e' } } } }),
            'a non-number depth is ignored and treated as unlimited'
        );
        st.equal(
            qs.stringify({ a: 'b' }, { depth: 0 }),
            'a=b',
            'a flat object serializes with a depth of 0'
        );

        var deep = {};
        var cursor = deep;
        for (var i = 0; i < 250; i++) {
            cursor.a = {};
            cursor = cursor.a;
        }
        cursor.b = 'c';
        st.equal(typeof qs.stringify(deep), 'string', 'the default depth serializes deeply nested objects without throwing');

        st['throws'](
            function () { qs.stringify({ a: { b: { c: { d: 'e' } } } }, { depth: 2 }); },
            RangeError,
            'throws a RangeError when nesting exceeds the depth limit'
        );
        st['throws'](
            function () { qs.stringify({ a: { b: 'c' } }, { depth: 0 }); },
            RangeError,
            'a depth of 0 throws for any nested object'
        );

        var caught;
        try {
            qs.stringify({ a: { b: { c: { d: 'e' } } } }, { depth: 2 });
        } catch (e) {
            caught = e;
        }
        st.ok(caught instanceof RangeError, 'the thrown value is a RangeError');
        st.equal(caught.message, 'Input depth exceeded depth option of 2', 'the RangeError names the exceeded depth');

        st.end();
    });
});
