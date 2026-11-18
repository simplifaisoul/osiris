'use strict';

var test = require('tape');
var forEach = require('for-each');
var hasPropertyDescriptors = require('has-property-descriptors')();
var iconv = require('iconv-lite');
var mockProperty = require('mock-property');
var hasOverrideMistake = require('has-override-mistake')();
var SaferBuffer = require('safer-buffer').Buffer;
var v = require('es-value-fixtures');
var inspect = require('object-inspect');
var emptyTestCases = require('./empty-keys-cases').emptyTestCases;
var hasProto = require('has-proto')();

var qs = require('../');
var utils = require('../lib/utils');

var characterizeParse = function characterizeParse(st, input, opts, expected, label) {
    var result;
    st.doesNotThrow(function () { result = qs.parse(input, opts); }, label + ': does not throw');
    st.deepEqual(result, expected, label + ': parses to the current lenient output');
};

test('parse()', function (t) {
    t.test('parses a simple string', function (st) {
        st.deepEqual(qs.parse('0=foo'), { 0: 'foo' });
        st.deepEqual(qs.parse('foo=c++'), { foo: 'c  ' });
        st.deepEqual(qs.parse('a[>=]=23'), { a: { '>=': '23' } });
        st.deepEqual(qs.parse('a[<=>]==23'), { a: { '<=>': '=23' } });
        st.deepEqual(qs.parse('a[==]=23'), { a: { '==': '23' } });
        st.deepEqual(qs.parse('foo', { strictNullHandling: true }), { foo: null });
        st.deepEqual(qs.parse('foo'), { foo: '' });
        st.deepEqual(qs.parse('foo='), { foo: '' });
        st.deepEqual(qs.parse('foo=bar'), { foo: 'bar' });
        st.deepEqual(qs.parse(' foo = bar = baz '), { ' foo ': ' bar = baz ' });
        st.deepEqual(qs.parse('foo=bar=baz'), { foo: 'bar=baz' });
        st.deepEqual(qs.parse('foo=bar&bar=baz'), { foo: 'bar', bar: 'baz' });
        st.deepEqual(qs.parse('foo2=bar2&baz2='), { foo2: 'bar2', baz2: '' });
        st.deepEqual(qs.parse('foo=bar&baz', { strictNullHandling: true }), { foo: 'bar', baz: null });
        st.deepEqual(qs.parse('foo=bar&baz'), { foo: 'bar', baz: '' });
        st.deepEqual(qs.parse('cht=p3&chd=t:60,40&chs=250x100&chl=Hello|World'), {
            cht: 'p3',
            chd: 't:60,40',
            chs: '250x100',
            chl: 'Hello|World'
        });
        st.end();
    });

    t.test('comma: false', function (st) {
        st.deepEqual(qs.parse('a[]=b&a[]=c'), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a[0]=b&a[1]=c'), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a=b,c'), { a: 'b,c' });
        st.deepEqual(qs.parse('a=b&a=c'), { a: ['b', 'c'] });
        st.end();
    });

    t.test('comma: true', function (st) {
        st.deepEqual(qs.parse('a[]=b&a[]=c', { comma: true }), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a[0]=b&a[1]=c', { comma: true }), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a=b,c', { comma: true }), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a=b&a=c', { comma: true }), { a: ['b', 'c'] });
        st.end();
    });

    t.test('comma: `[]=` in a value does not wrap the value in an extra array', function (st) {
        st.deepEqual(qs.parse('a[b]=1,2,3[]=x', { comma: true }), { a: { b: ['1', '2', '3[]=x'] } });
        st.deepEqual(qs.parse('a[b]=1,2[]=3', { comma: true }), { a: { b: ['1', '2[]=3'] } });
        st.deepEqual(qs.parse('a[]=1,2,3', { comma: true }), { a: [['1', '2', '3']] });
        st.end();
    });

    t.test('allows enabling dot notation', function (st) {
        st.deepEqual(qs.parse('a.b=c'), { 'a.b': 'c' });
        st.deepEqual(qs.parse('a.b=c', { allowDots: true }), { a: { b: 'c' } });

        // a literal dot inside a bracket segment must not be rewritten by allowDots (#617)
        st.deepEqual(
            qs.parse('outer[a.b]=1', { allowDots: true }),
            { outer: { 'a.b': '1' } },
            'a dot inside brackets stays part of the key when allowDots is true'
        );
        st.deepEqual(
            qs.parse('outer[a.b]=1', { allowDots: true }),
            qs.parse('outer[a.b]=1', { allowDots: false }),
            'allowDots does not change how a bracket segment containing a dot is parsed'
        );
        st.deepEqual(
            qs.parse('a].b=c', { allowDots: true }),
            { 'a]': { b: 'c' } },
            'a stray close bracket does not stop a later dot from being converted'
        );
        st.deepEqual(
            qs.parse('a]].b[c.d]=e', { allowDots: true }),
            { 'a]]': { b: { 'c.d': 'e' } } },
            'stray close brackets do not unbalance a later bracket segment'
        );

        st.end();
    });

    t.test('decode dot keys with case-insensitive percent escapes', function (st) {
        var input = 'name%252eobj.first%252ename=John&name%252Eobj.last%252Ename=Doe';
        st.deepEqual(
            qs.parse(input, { decodeDotInKeys: true }),
            { 'name.obj': { 'first.name': 'John', 'last.name': 'Doe' } },
            'lowercase and uppercase escapes decode in both parent and child keys'
        );
        st.deepEqual(
            qs.parse(input, { allowDots: true, decodeDotInKeys: false }),
            { 'name%2eobj': { 'first%2ename': 'John' }, 'name%2Eobj': { 'last%2Ename': 'Doe' } },
            'escaped dots remain unchanged when decoding is disabled'
        );
        st.end();
    });

    t.test('decode dot keys correctly', function (st) {
        st.deepEqual(
            qs.parse('name%252Eobj.first=John&name%252Eobj.last=Doe', { allowDots: false, decodeDotInKeys: false }),
            { 'name%2Eobj.first': 'John', 'name%2Eobj.last': 'Doe' },
            'with allowDots false and decodeDotInKeys false'
        );
        st.deepEqual(
            qs.parse('name.obj.first=John&name.obj.last=Doe', { allowDots: true, decodeDotInKeys: false }),
            { name: { obj: { first: 'John', last: 'Doe' } } },
            'with allowDots false and decodeDotInKeys false'
        );
        st.deepEqual(
            qs.parse('name%252Eobj.first=John&name%252Eobj.last=Doe', { allowDots: true, decodeDotInKeys: false }),
            { 'name%2Eobj': { first: 'John', last: 'Doe' } },
            'with allowDots true and decodeDotInKeys false'
        );
        st.deepEqual(
            qs.parse('name%252Eobj.first=John&name%252Eobj.last=Doe', { allowDots: true, decodeDotInKeys: true }),
            { 'name.obj': { first: 'John', last: 'Doe' } },
            'with allowDots true and decodeDotInKeys true'
        );

        st.deepEqual(
            qs.parse(
                'name%252Eobj%252Esubobject.first%252Egodly%252Ename=John&name%252Eobj%252Esubobject.last=Doe',
                { allowDots: false, decodeDotInKeys: false }
            ),
            { 'name%2Eobj%2Esubobject.first%2Egodly%2Ename': 'John', 'name%2Eobj%2Esubobject.last': 'Doe' },
            'with allowDots false and decodeDotInKeys false'
        );
        st.deepEqual(
            qs.parse(
                'name.obj.subobject.first.godly.name=John&name.obj.subobject.last=Doe',
                { allowDots: true, decodeDotInKeys: false }
            ),
            { name: { obj: { subobject: { first: { godly: { name: 'John' } }, last: 'Doe' } } } },
            'with allowDots true and decodeDotInKeys false'
        );
        st.deepEqual(
            qs.parse(
                'name%252Eobj%252Esubobject.first%252Egodly%252Ename=John&name%252Eobj%252Esubobject.last=Doe',
                { allowDots: true, decodeDotInKeys: true }
            ),
            { 'name.obj.subobject': { 'first.godly.name': 'John', last: 'Doe' } },
            'with allowDots true and decodeDotInKeys true'
        );
        st.deepEqual(
            qs.parse('name%252Eobj.first=John&name%252Eobj.last=Doe'),
            { 'name%2Eobj.first': 'John', 'name%2Eobj.last': 'Doe' },
            'with allowDots and decodeDotInKeys undefined'
        );

        st.end();
    });

    t.test('decodes dot in key of object, and allow enabling dot notation when decodeDotInKeys is set to true and allowDots is undefined', function (st) {
        st.deepEqual(
            qs.parse(
                'name%252Eobj%252Esubobject.first%252Egodly%252Ename=John&name%252Eobj%252Esubobject.last=Doe',
                { decodeDotInKeys: true }
            ),
            { 'name.obj.subobject': { 'first.godly.name': 'John', last: 'Doe' } },
            'with allowDots undefined and decodeDotInKeys true'
        );

        st.end();
    });

    t.test('throws when decodeDotInKeys is not of type boolean', function (st) {
        st['throws'](
            function () { qs.parse('foo[]&bar=baz', { decodeDotInKeys: 'foobar' }); },
            TypeError
        );

        st['throws'](
            function () { qs.parse('foo[]&bar=baz', { decodeDotInKeys: 0 }); },
            TypeError
        );
        st['throws'](
            function () { qs.parse('foo[]&bar=baz', { decodeDotInKeys: NaN }); },
            TypeError
        );

        st['throws'](
            function () { qs.parse('foo[]&bar=baz', { decodeDotInKeys: null }); },
            TypeError
        );

        st.end();
    });

    t.test('allows empty arrays in obj values', function (st) {
        st.deepEqual(qs.parse('foo[]&bar=baz', { allowEmptyArrays: true }), { foo: [], bar: 'baz' });
        st.deepEqual(qs.parse('foo[]&bar=baz', { allowEmptyArrays: false }), { foo: [''], bar: 'baz' });

        st.end();
    });

    t.test('throws when allowEmptyArrays is not of type boolean', function (st) {
        st['throws'](
            function () { qs.parse('foo[]&bar=baz', { allowEmptyArrays: 'foobar' }); },
            TypeError
        );

        st['throws'](
            function () { qs.parse('foo[]&bar=baz', { allowEmptyArrays: 0 }); },
            TypeError
        );
        st['throws'](
            function () { qs.parse('foo[]&bar=baz', { allowEmptyArrays: NaN }); },
            TypeError
        );

        st['throws'](
            function () { qs.parse('foo[]&bar=baz', { allowEmptyArrays: null }); },
            TypeError
        );

        st.end();
    });

    t.test('allowEmptyArrays + strictNullHandling', function (st) {
        st.deepEqual(
            qs.parse('testEmptyArray[]', { strictNullHandling: true, allowEmptyArrays: true }),
            { testEmptyArray: [] }
        );

        st.end();
    });

    t.deepEqual(qs.parse('a[b]=c'), { a: { b: 'c' } }, 'parses a single nested string');
    t.deepEqual(qs.parse('a[b][c]=d'), { a: { b: { c: 'd' } } }, 'parses a double nested string');
    t.deepEqual(
        qs.parse('a[b][c][d][e][f][g][h]=i'),
        { a: { b: { c: { d: { e: { f: { '[g][h]': 'i' } } } } } } },
        'defaults to a depth of 5'
    );

    t.test('only parses one level when depth = 1', function (st) {
        st.deepEqual(qs.parse('a[b][c]=d', { depth: 1 }), { a: { b: { '[c]': 'd' } } });
        st.deepEqual(qs.parse('a[b][c][d]=e', { depth: 1 }), { a: { b: { '[c][d]': 'e' } } });
        st.end();
    });

    t.test('uses original key when depth = 0', function (st) {
        st.deepEqual(qs.parse('a[0]=b&a[1]=c', { depth: 0 }), { 'a[0]': 'b', 'a[1]': 'c' });
        st.deepEqual(qs.parse('a[0][0]=b&a[0][1]=c&a[1]=d&e=2', { depth: 0 }), { 'a[0][0]': 'b', 'a[0][1]': 'c', 'a[1]': 'd', e: '2' });
        st.deepEqual(qs.parse('a.b=c', { depth: 0, allowDots: true }), { 'a[b]': 'c' }, 'normalizes dots before applying depth-0 behavior');
        st.deepEqual(qs.parse('toString=foo', { depth: 0 }), {}, 'respects prototype guard at depth 0');
        st.deepEqual(qs.parse('toString=foo', { depth: 0, allowPrototypes: true }), { toString: 'foo' }, 'allows prototypes at depth 0 when enabled');
        st.end();
    });

    t.test('ignores prototype keys when depth = 0 and allowPrototypes is false', function (st) {
        st.deepEqual(qs.parse('toString=foo', { depth: 0 }), {});
        st.deepEqual(qs.parse('hasOwnProperty=bar', { depth: 0 }), {});
        st.deepEqual(qs.parse('toString=foo&a=b', { depth: 0 }), { a: 'b' });
        st.end();
    });

    t.test('ignores bracket-wrapped prototype keys when depth = 0 and allowPrototypes is false', function (st) {
        st.deepEqual(qs.parse('[toString]=foo', { depth: 0 }), {}, 'the stored key is the bracket content');
        st.deepEqual(qs.parse('[hasOwnProperty]=bar', { depth: 0 }), {});
        st.deepEqual(qs.parse('%5BhasOwnProperty%5D=bar', { depth: 0 }), {}, 'percent-encoded brackets');
        st.deepEqual(qs.parse('[toString]=foo&a=b', { depth: 0 }), { a: 'b' });
        st.deepEqual(qs.parse('[toString]=foo', { depth: false }), {}, 'depth: false');
        st.deepEqual(qs.parse('.toString=foo', { depth: 0, allowDots: true }), {}, 'a leading dot becomes a bracket group');
        st.deepEqual(qs.parse('[a]=b&[toString]=foo', { depth: 0 }), { a: 'b' }, 'other bracket-wrapped keys still strip their brackets');
        st.end();
    });

    t.test('allows prototype keys when depth = 0 and allowPrototypes is true', function (st) {
        st.deepEqual(qs.parse('toString=foo', { depth: 0, allowPrototypes: true }), { toString: 'foo' });
        st.deepEqual(qs.parse('[toString]=foo', { depth: 0, allowPrototypes: true }), { toString: 'foo' });
        st.end();
    });

    t.test('keeps bracket-wrapped prototype keys when depth = 0 and plainObjects is true', function (st) {
        var result = qs.parse('[toString]=foo', { depth: 0, plainObjects: true });
        st.deepEqual(result, { __proto__: null, toString: 'foo' });
        st.equal(Object.getPrototypeOf(result), null);
        st.end();
    });

    t.test('strips one wrapping bracket pair from the key when depth = 0', function (st) {
        st.deepEqual(qs.parse('[a]=b', { depth: 0 }), { a: 'b' });
        st.deepEqual(qs.parse('[[toString]]=foo', { depth: 0 }), { '[toString]': 'foo' }, 'only the outer pair is stripped');
        st.deepEqual(qs.parse('x[toString]=foo', { depth: 0 }), { 'x[toString]': 'foo' }, 'a key with a parent stays literal');
        st.end();
    });

    t.test('uses original key when depth = false', function (st) {
        st.deepEqual(qs.parse('a[0]=b&a[1]=c', { depth: false }), { 'a[0]': 'b', 'a[1]': 'c' });
        st.deepEqual(qs.parse('a[0][0]=b&a[0][1]=c&a[1]=d&e=2', { depth: false }), { 'a[0][0]': 'b', 'a[0][1]': 'c', 'a[1]': 'd', e: '2' });
        st.end();
    });

    t.deepEqual(qs.parse('a=b&a=c'), { a: ['b', 'c'] }, 'parses a simple array');

    t.test('parses an explicit array', function (st) {
        st.deepEqual(qs.parse('a[]=b'), { a: ['b'] });
        st.deepEqual(qs.parse('a[]=b&a[]=c'), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a[]=b&a[]=c&a[]=d'), { a: ['b', 'c', 'd'] });
        st.end();
    });

    t.test('parses a mix of simple and explicit arrays', function (st) {
        st.deepEqual(qs.parse('a=b&a[]=c'), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a[]=b&a=c'), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a[0]=b&a=c'), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a=b&a[0]=c'), { a: ['b', 'c'] });

        st.deepEqual(qs.parse('a[1]=b&a=c', { arrayLimit: 20 }), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a[]=b&a=c', { arrayLimit: 0 }), { a: { 0: 'b', 1: 'c' } });
        st.deepEqual(qs.parse('a[]=b&a=c'), { a: ['b', 'c'] });

        st.deepEqual(qs.parse('a=b&a[1]=c', { arrayLimit: 20 }), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a=b&a[]=c', { arrayLimit: 0 }), { a: { 0: 'b', 1: 'c' } });
        st.deepEqual(qs.parse('a=b&a[]=c'), { a: ['b', 'c'] });

        st.end();
    });

    t.test('parses a nested array', function (st) {
        st.deepEqual(qs.parse('a[b][]=c&a[b][]=d'), { a: { b: ['c', 'd'] } });
        st.deepEqual(qs.parse('a[>=]=25'), { a: { '>=': '25' } });
        st.end();
    });

    t.test('parses keys with literal [] inside a bracket group (#493)', function (st) {
        // A bracket pair inside a bracket group should be treated literally as part of the key
        st.deepEqual(
            qs.parse('search[withbracket[]]=foobar'),
            { search: { 'withbracket[]': 'foobar' } },
            'treats inner [] literally when inside a bracket group'
        );

        // Single-level variant
        st.deepEqual(
            qs.parse('a[b[]]=c'),
            { a: { 'b[]': 'c' } },
            'keeps "b[]" as a literal key'
        );

        // Nested with an array push on the outer level
        st.deepEqual(
            qs.parse('list[][x[]]=y'),
            { list: [{ 'x[]': 'y' }] },
            'preserves inner [] while still treating outer [] as array push'
        );

        // Multiple nested bracket pairs: inner [] remains literal as part of the key
        st.deepEqual(
            qs.parse('a[b[c[]]]=d'),
            { a: { 'b[c[]]': 'd' } },
            'treats "b[c[]]" as a literal key inside the bracket group'
        );

        // Depth limits with literal brackets: preserve inner [] while limiting bracket-group parsing
        st.deepEqual(
            qs.parse('a[b[c[]]][d]=e', { depth: 1 }),
            { a: { 'b[c[]]': { '[d]': 'e' } } },
            'respects depth: 1 and preserves literal inner [] in the parsed key'
        );

        // Unterminated inner bracket group is wrapped as a literal remainder segment
        st.deepEqual(
            qs.parse('a[[]b=c'),
            { a: { '[[]b': 'c' } },
            'handles unterminated inner bracket groups without throwing'
        );

        st.end();
    });

    t.test('currently parses unbalanced bracket keys after a parent leniently to literal segments (issue #558)', function (st) {
        characterizeParse(st, 'a[bc=v', undefined, { a: { '[bc': 'v' } }, 'unclosed group after a parent');
        characterizeParse(st, 'a[=v', undefined, { a: { '[': 'v' } }, 'bare unclosed bracket after a parent');
        characterizeParse(st, 'a[b][c=v', undefined, { a: { b: { '[c': 'v' } } }, 'unclosed group after a valid one');
        characterizeParse(st, 'a[b]c[d=v', undefined, { a: { b: { '[d': 'v' } } }, 'unclosed group after text following a valid one');
        characterizeParse(st, 'filters[customtags:Env: Prod=v', undefined, { filters: { '[customtags:Env: Prod': 'v' } }, 'the issue #558 reproduction');
        characterizeParse(st, '][a=v', undefined, { ']': { '[a': 'v' } }, 'stray close bracket before an unclosed group');
        characterizeParse(st, 'a][b=v', undefined, { 'a]': { '[b': 'v' } }, 'stray close bracket inside the parent');
        st.end();
    });

    t.test('currently parses unbalanced bracket keys containing inner brackets leniently (issue #558)', function (st) {
        characterizeParse(st, 'a[b[c=v', undefined, { a: { '[b[c': 'v' } }, 'unclosed group containing an inner bracket');
        characterizeParse(st, 'a[b[c]=v', undefined, { a: { '[b[c]': 'v' } }, 'unbalanced group with an inner bracket and one close');
        characterizeParse(st, 'a[b][c[d=v', undefined, { a: { b: { '[c[d': 'v' } } }, 'unclosed inner-bracket group after a valid one');
        st.end();
    });

    t.test('currently parses bracket-prefixed unbalanced keys leniently (issue #558)', function (st) {
        characterizeParse(st, '[abc=v', undefined, { '[abc': 'v' }, 'key starting with an unclosed bracket');
        characterizeParse(st, '[[]b=v', undefined, { '[[]b': 'v' }, 'key starting with an unbalanced bracket group');
        st.end();
    });

    t.test('lenient unbalanced-bracket handling currently depends on the depth option (issue #558)', function (st) {
        characterizeParse(st, 'a[b]c[d]e[f=v', { depth: 5 }, { a: { b: { d: { '[f': 'v' } } } }, 'consumes groups up to the depth budget then keeps the unclosed remainder literal');
        characterizeParse(st, 'a[b]c[d]e[f=v', { depth: 1 }, { a: { b: { '[d]e[f': 'v' } } }, 'a lower depth keeps more of the unclosed remainder literal');
        characterizeParse(st, 'a[bc=v', { depth: 0 }, { 'a[bc': 'v' }, 'depth 0 keeps the entire key literal');
        st.end();
    });

    t.test('currently parses an allowDots key with a trailing unclosed bracket leniently (issue #558)', function (st) {
        characterizeParse(st, 'a.b[c=v', { allowDots: true }, { a: { b: { '[c': 'v' } } }, 'allowDots expands the dot then keeps the unclosed bracket literal');
        st.end();
    });

    t.test('valid and stray-close bracket keys are unaffected by unbalanced-bracket handling', function (st) {
        characterizeParse(st, 'a]b=v', undefined, { 'a]b': 'v' }, 'stray close bracket with no open bracket stays a flat key');
        characterizeParse(st, 'a[b]extra=v', undefined, { a: { b: 'v' } }, 'text after a balanced group is ignored');
        st.end();
    });

    t.test('currently moves the key/value split to a later `]=` when the first `=` comes before any bracket group', function (st) {
        characterizeParse(st, 'a=b[c]=d', undefined, { 'a=b': { c: 'd' } }, 'literal brackets after the first `=`');
        characterizeParse(st, 'q=%5B1%5D=2', undefined, { 'q=': ['2'] }, 'encoded brackets collapse to an array');
        characterizeParse(st, 'role=guest%5Bx%5Dy%5D=z', undefined, { 'role=guest': { x: 'z' } }, 'group opens after the first `=`, and the text after it is dropped');
        characterizeParse(st, 'role=guest%5D=admin', undefined, { 'role=guest]': 'admin' }, 'encoded `]=` with no bracket group at all');
        st.end();
    });

    t.test('allows to specify array indices', function (st) {
        st.deepEqual(qs.parse('a[1]=c&a[0]=b&a[2]=d'), { a: ['b', 'c', 'd'] });
        st.deepEqual(qs.parse('a[1]=c&a[0]=b'), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a[1]=c', { arrayLimit: 20 }), { a: ['c'] });
        st.deepEqual(qs.parse('a[1]=c', { arrayLimit: 0 }), { a: { 1: 'c' } });
        st.deepEqual(qs.parse('a[1]=c'), { a: ['c'] });
        st.end();
    });

    t.test('limits specific array indices to arrayLimit', function (st) {
        st.deepEqual(qs.parse('a[19]=a', { arrayLimit: 20 }), { a: ['a'] });
        st.deepEqual(qs.parse('a[20]=a', { arrayLimit: 20 }), { a: { 20: 'a' } });

        st.deepEqual(qs.parse('a[19]=a'), { a: ['a'] });
        st.deepEqual(qs.parse('a[20]=a'), { a: { 20: 'a' } });
        st.end();
    });

    t.deepEqual(qs.parse('a[12b]=c'), { a: { '12b': 'c' } }, 'supports keys that begin with a number');

    t.test('supports encoded = signs', function (st) {
        st.deepEqual(qs.parse('he%3Dllo=th%3Dere'), { 'he=llo': 'th=ere' });
        st.end();
    });

    t.test('is ok with url encoded strings', function (st) {
        st.deepEqual(qs.parse('a[b%20c]=d'), { a: { 'b c': 'd' } });
        st.deepEqual(qs.parse('a[b]=c%20d'), { a: { b: 'c d' } });
        st.end();
    });

    t.test('allows brackets in the value', function (st) {
        st.deepEqual(qs.parse('pets=["tobi"]'), { pets: '["tobi"]' });
        st.deepEqual(qs.parse('operators=[">=", "<="]'), { operators: '[">=", "<="]' });
        st.end();
    });

    t.test('allows empty values', function (st) {
        st.deepEqual(qs.parse(''), {});
        st.deepEqual(qs.parse(null), {});
        st.deepEqual(qs.parse(undefined), {});
        st.end();
    });

    t.test('transforms arrays to objects', function (st) {
        st.deepEqual(qs.parse('foo[0]=bar&foo[bad]=baz'), { foo: { 0: 'bar', bad: 'baz' } });
        st.deepEqual(qs.parse('foo[bad]=baz&foo[0]=bar'), { foo: { bad: 'baz', 0: 'bar' } });
        st.deepEqual(qs.parse('foo[bad]=baz&foo[]=bar'), { foo: { bad: 'baz', 0: 'bar' } });
        st.deepEqual(qs.parse('foo[]=bar&foo[bad]=baz'), { foo: { 0: 'bar', bad: 'baz' } });
        st.deepEqual(qs.parse('foo[bad]=baz&foo[]=bar&foo[]=foo'), { foo: { bad: 'baz', 0: 'bar', 1: 'foo' } });
        st.deepEqual(qs.parse('foo[0][a]=a&foo[0][b]=b&foo[1][a]=aa&foo[1][b]=bb'), { foo: [{ a: 'a', b: 'b' }, { a: 'aa', b: 'bb' }] });

        st.deepEqual(qs.parse('a[]=b&a[t]=u&a[hasOwnProperty]=c', { allowPrototypes: false }), { a: { 0: 'b', t: 'u' } });
        st.deepEqual(qs.parse('a[]=b&a[t]=u&a[hasOwnProperty]=c', { allowPrototypes: true }), { a: { 0: 'b', t: 'u', hasOwnProperty: 'c' } });
        st.deepEqual(qs.parse('a[]=b&a[hasOwnProperty]=c&a[x]=y', { allowPrototypes: false }), { a: { 0: 'b', x: 'y' } });
        st.deepEqual(qs.parse('a[]=b&a[hasOwnProperty]=c&a[x]=y', { allowPrototypes: true }), { a: { 0: 'b', hasOwnProperty: 'c', x: 'y' } });
        st.end();
    });

    t.test('transforms arrays to objects (dot notation)', function (st) {
        st.deepEqual(qs.parse('foo[0].baz=bar&fool.bad=baz', { allowDots: true }), { foo: [{ baz: 'bar' }], fool: { bad: 'baz' } });
        st.deepEqual(qs.parse('foo[0].baz=bar&fool.bad.boo=baz', { allowDots: true }), { foo: [{ baz: 'bar' }], fool: { bad: { boo: 'baz' } } });
        st.deepEqual(qs.parse('foo[0][0].baz=bar&fool.bad=baz', { allowDots: true }), { foo: [[{ baz: 'bar' }]], fool: { bad: 'baz' } });
        st.deepEqual(qs.parse('foo[0].baz[0]=15&foo[0].bar=2', { allowDots: true }), { foo: [{ baz: ['15'], bar: '2' }] });
        st.deepEqual(qs.parse('foo[0].baz[0]=15&foo[0].baz[1]=16&foo[0].bar=2', { allowDots: true }), { foo: [{ baz: ['15', '16'], bar: '2' }] });
        st.deepEqual(qs.parse('foo.bad=baz&foo[0]=bar', { allowDots: true }), { foo: { bad: 'baz', 0: 'bar' } });
        st.deepEqual(qs.parse('foo.bad=baz&foo[]=bar', { allowDots: true }), { foo: { bad: 'baz', 0: 'bar' } });
        st.deepEqual(qs.parse('foo[]=bar&foo.bad=baz', { allowDots: true }), { foo: { 0: 'bar', bad: 'baz' } });
        st.deepEqual(qs.parse('foo.bad=baz&foo[]=bar&foo[]=foo', { allowDots: true }), { foo: { bad: 'baz', 0: 'bar', 1: 'foo' } });
        st.deepEqual(qs.parse('foo[0].a=a&foo[0].b=b&foo[1].a=aa&foo[1].b=bb', { allowDots: true }), { foo: [{ a: 'a', b: 'b' }, { a: 'aa', b: 'bb' }] });
        st.end();
    });

    t.test('correctly prunes undefined values when converting an array to an object', function (st) {
        st.deepEqual(qs.parse('a[2]=b&a[99999999]=c'), { a: { 2: 'b', 99999999: 'c' } });
        st.end();
    });

    t.test('supports malformed uri characters', function (st) {
        st.deepEqual(qs.parse('{%:%}', { strictNullHandling: true }), { '{%:%}': null });
        st.deepEqual(qs.parse('{%:%}='), { '{%:%}': '' });
        st.deepEqual(qs.parse('foo=%:%}'), { foo: '%:%}' });
        st.end();
    });

    t.test('doesn\'t produce empty keys', function (st) {
        st.deepEqual(qs.parse('_r=1&'), { _r: '1' });
        st.end();
    });

    t.test('cannot access Object prototype', function (st) {
        qs.parse('constructor[prototype][bad]=bad');
        qs.parse('bad[constructor][prototype][bad]=bad');
        st.equal(typeof Object.prototype.bad, 'undefined');
        st.end();
    });

    t.test('parses arrays of objects', function (st) {
        st.deepEqual(qs.parse('a[][b]=c'), { a: [{ b: 'c' }] });
        st.deepEqual(qs.parse('a[0][b]=c'), { a: [{ b: 'c' }] });
        st.end();
    });

    t.test('allows for empty strings in arrays', function (st) {
        st.deepEqual(qs.parse('a[]=b&a[]=&a[]=c'), { a: ['b', '', 'c'] });

        st.deepEqual(
            qs.parse('a[0]=b&a[1]&a[2]=c&a[19]=', { strictNullHandling: true, arrayLimit: 20 }),
            { a: ['b', null, 'c', ''] },
            'with arrayLimit 20 + array indices: null then empty string works'
        );
        st.deepEqual(
            qs.parse('a[]=b&a[]&a[]=c&a[]=', { strictNullHandling: true, arrayLimit: 0 }),
            { a: { 0: 'b', 1: null, 2: 'c', 3: '' } },
            'with arrayLimit 0 + array brackets: null then empty string works'
        );

        st.deepEqual(
            qs.parse('a[0]=b&a[1]=&a[2]=c&a[19]', { strictNullHandling: true, arrayLimit: 20 }),
            { a: ['b', '', 'c', null] },
            'with arrayLimit 20 + array indices: empty string then null works'
        );
        st.deepEqual(
            qs.parse('a[]=b&a[]=&a[]=c&a[]', { strictNullHandling: true, arrayLimit: 0 }),
            { a: { 0: 'b', 1: '', 2: 'c', 3: null } },
            'with arrayLimit 0 + array brackets: empty string then null works'
        );

        st.deepEqual(
            qs.parse('a[]=&a[]=b&a[]=c'),
            { a: ['', 'b', 'c'] },
            'array brackets: empty strings work'
        );
        st.end();
    });

    t.test('compacts sparse arrays', function (st) {
        st.deepEqual(qs.parse('a[10]=1&a[2]=2', { arrayLimit: 20 }), { a: ['2', '1'] });
        st.deepEqual(qs.parse('a[1][b][2][c]=1', { arrayLimit: 20 }), { a: [{ b: [{ c: '1' }] }] });
        st.deepEqual(qs.parse('a[1][2][3][c]=1', { arrayLimit: 20 }), { a: [[[{ c: '1' }]]] });
        st.deepEqual(qs.parse('a[1][2][3][c][1]=1', { arrayLimit: 20 }), { a: [[[{ c: ['1'] }]]] });
        st.end();
    });

    t.test('parses sparse arrays', function (st) {
        /* eslint no-sparse-arrays: 0 */
        st.deepEqual(qs.parse('a[4]=1&a[1]=2', { allowSparse: true }), { a: [, '2', , , '1'] });
        st.deepEqual(qs.parse('a[1][b][2][c]=1', { allowSparse: true }), { a: [, { b: [, , { c: '1' }] }] });
        st.deepEqual(qs.parse('a[1][2][3][c]=1', { allowSparse: true }), { a: [, [, , [, , , { c: '1' }]]] });
        st.deepEqual(qs.parse('a[1][2][3][c][1]=1', { allowSparse: true }), { a: [, [, , [, , , { c: [, '1'] }]]] });
        st.end();
    });

    t.test('parses semi-parsed strings', function (st) {
        st.deepEqual(qs.parse({ 'a[b]': 'c' }), { a: { b: 'c' } });
        st.deepEqual(qs.parse({ 'a[b]': 'c', 'a[d]': 'e' }), { a: { b: 'c', d: 'e' } });
        st.end();
    });

    t.test('parses buffers correctly', function (st) {
        var b = SaferBuffer.from('test');
        st.deepEqual(qs.parse({ a: b }), { a: b });
        st.end();
    });

    t.test('parses jquery-param strings', function (st) {
        // readable = 'filter[0][]=int1&filter[0][]==&filter[0][]=77&filter[]=and&filter[2][]=int2&filter[2][]==&filter[2][]=8'
        var encoded = 'filter%5B0%5D%5B%5D=int1&filter%5B0%5D%5B%5D=%3D&filter%5B0%5D%5B%5D=77&filter%5B%5D=and&filter%5B2%5D%5B%5D=int2&filter%5B2%5D%5B%5D=%3D&filter%5B2%5D%5B%5D=8';
        var expected = { filter: [['int1', '=', '77'], 'and', ['int2', '=', '8']] };
        st.deepEqual(qs.parse(encoded), expected);
        st.end();
    });

    t.test('continues parsing when no parent is found', function (st) {
        st.deepEqual(qs.parse('[]=&a=b'), { 0: '', a: 'b' });
        st.deepEqual(qs.parse('[]&a=b', { strictNullHandling: true }), { 0: null, a: 'b' });
        st.deepEqual(qs.parse('[foo]=bar'), { foo: 'bar' });
        st.end();
    });

    t.test('does not error when parsing a very long array', function (st) {
        var str = 'a[]=a';
        while (Buffer.byteLength(str) < 128 * 1024) {
            str = str + '&' + str;
        }

        st.doesNotThrow(function () {
            qs.parse(str);
        });

        st.end();
    });

    t.test('does not throw when a native prototype has an enumerable property', function (st) {
        st.intercept(Object.prototype, 'crash', { value: '' });
        st.intercept(Array.prototype, 'crash', { value: '' });

        st.doesNotThrow(qs.parse.bind(null, 'a=b'));
        st.deepEqual(qs.parse('a=b'), { a: 'b' });
        st.doesNotThrow(qs.parse.bind(null, 'a[][b]=c'));
        st.deepEqual(qs.parse('a[][b]=c'), { a: [{ b: 'c' }] });

        st.end();
    });

    t.test('parses a string with an alternative string delimiter', function (st) {
        st.deepEqual(qs.parse('a=b;c=d', { delimiter: ';' }), { a: 'b', c: 'd' });
        st.end();
    });

    t.test('parses a string with an alternative RegExp delimiter', function (st) {
        st.deepEqual(qs.parse('a=b; c=d', { delimiter: /[;,] */ }), { a: 'b', c: 'd' });
        st.end();
    });

    t.test('does not use non-splittable objects as delimiters', function (st) {
        st.deepEqual(qs.parse('a=b&c=d', { delimiter: true }), { a: 'b', c: 'd' });
        st.end();
    });

    t.test('allows overriding parameter limit', function (st) {
        st.deepEqual(qs.parse('a=b&c=d', { parameterLimit: 1 }), { a: 'b' });
        st.end();
    });

    t.test('allows setting the parameter limit to Infinity', function (st) {
        st.deepEqual(qs.parse('a=b&c=d', { parameterLimit: Infinity }), { a: 'b', c: 'd' });
        st.end();
    });

    t.test('allows overriding array limit', function (st) {
        st.deepEqual(qs.parse('a[0]=b', { arrayLimit: -1 }), { a: { 0: 'b' } });
        st.deepEqual(qs.parse('a[0]=b', { arrayLimit: 0 }), { a: { 0: 'b' } });

        st.deepEqual(qs.parse('a[-1]=b', { arrayLimit: -1 }), { a: { '-1': 'b' } });
        st.deepEqual(qs.parse('a[-1]=b', { arrayLimit: 0 }), { a: { '-1': 'b' } });

        st.deepEqual(qs.parse('a[0]=b&a[1]=c', { arrayLimit: -1 }), { a: { 0: 'b', 1: 'c' } });
        st.deepEqual(qs.parse('a[0]=b&a[1]=c', { arrayLimit: 0 }), { a: { 0: 'b', 1: 'c' } });

        st.end();
    });

    t.test('allows disabling array parsing', function (st) {
        var indices = qs.parse('a[0]=b&a[1]=c', { parseArrays: false });
        st.deepEqual(indices, { a: { 0: 'b', 1: 'c' } });
        st.equal(Array.isArray(indices.a), false, 'parseArrays:false, indices case is not an array');

        var emptyBrackets = qs.parse('a[]=b', { parseArrays: false });
        st.deepEqual(emptyBrackets, { a: { 0: 'b' } });
        st.equal(Array.isArray(emptyBrackets.a), false, 'parseArrays:false, empty brackets case is not an array');

        st.end();
    });

    t.test('allows for query string prefix', function (st) {
        st.deepEqual(qs.parse('?foo=bar', { ignoreQueryPrefix: true }), { foo: 'bar' });
        st.deepEqual(qs.parse('foo=bar', { ignoreQueryPrefix: true }), { foo: 'bar' });
        st.deepEqual(qs.parse('?foo=bar', { ignoreQueryPrefix: false }), { '?foo': 'bar' });

        st.end();
    });

    t.test('parses an object', function (st) {
        var input = {
            'user[name]': { 'pop[bob]': 3 },
            'user[email]': null
        };

        var expected = {
            user: {
                name: { 'pop[bob]': 3 },
                email: null
            }
        };

        var result = qs.parse(input);

        st.deepEqual(result, expected);
        st.end();
    });

    t.test('parses string with comma as array divider', function (st) {
        st.deepEqual(qs.parse('foo=bar,tee', { comma: true }), { foo: ['bar', 'tee'] });
        st.deepEqual(qs.parse('foo[bar]=coffee,tee', { comma: true }), { foo: { bar: ['coffee', 'tee'] } });
        st.deepEqual(qs.parse('foo=', { comma: true }), { foo: '' });
        st.deepEqual(qs.parse('foo', { comma: true }), { foo: '' });
        st.deepEqual(qs.parse('foo', { comma: true, strictNullHandling: true }), { foo: null });

        // test cases inversed from from stringify tests
        st.deepEqual(qs.parse('a[0]=c'), { a: ['c'] });
        st.deepEqual(qs.parse('a[]=c'), { a: ['c'] });
        st.deepEqual(qs.parse('a[]=c', { comma: true }), { a: ['c'] });

        st.deepEqual(qs.parse('a[0]=c&a[1]=d'), { a: ['c', 'd'] });
        st.deepEqual(qs.parse('a[]=c&a[]=d'), { a: ['c', 'd'] });
        st.deepEqual(qs.parse('a=c,d', { comma: true }), { a: ['c', 'd'] });

        st.end();
    });

    t.test('parses values with comma as array divider', function (st) {
        st.deepEqual(qs.parse({ foo: 'bar,tee' }, { comma: false }), { foo: 'bar,tee' });
        st.deepEqual(qs.parse({ foo: 'bar,tee' }, { comma: true }), { foo: ['bar', 'tee'] });
        st.end();
    });

    t.test('use number decoder, parses string that has one number with comma option enabled', function (st) {
        var decoder = function (str, defaultDecoder, charset, type) {
            if (!isNaN(Number(str))) {
                return parseFloat(str);
            }
            return defaultDecoder(str, defaultDecoder, charset, type);
        };

        st.deepEqual(qs.parse('foo=1', { comma: true, decoder: decoder }), { foo: 1 });
        st.deepEqual(qs.parse('foo=0', { comma: true, decoder: decoder }), { foo: 0 });

        st.end();
    });

    t.test('parses brackets holds array of arrays when having two parts of strings with comma as array divider', function (st) {
        st.deepEqual(qs.parse('foo[]=1,2,3&foo[]=4,5,6', { comma: true }), { foo: [['1', '2', '3'], ['4', '5', '6']] });
        st.deepEqual(qs.parse('foo[]=1,2,3&foo[]=', { comma: true }), { foo: [['1', '2', '3'], ''] });
        st.deepEqual(qs.parse('foo[]=1,2,3&foo[]=,', { comma: true }), { foo: [['1', '2', '3'], ['', '']] });
        st.deepEqual(qs.parse('foo[]=1,2,3&foo[]=a', { comma: true }), { foo: [['1', '2', '3'], 'a'] });

        st.end();
    });

    t.test('parses url-encoded brackets holds array of arrays when having two parts of strings with comma as array divider', function (st) {
        st.deepEqual(qs.parse('foo%5B%5D=1,2,3&foo%5B%5D=4,5,6', { comma: true }), { foo: [['1', '2', '3'], ['4', '5', '6']] });
        st.deepEqual(qs.parse('foo%5B%5D=1,2,3&foo%5B%5D=', { comma: true }), { foo: [['1', '2', '3'], ''] });
        st.deepEqual(qs.parse('foo%5B%5D=1,2,3&foo%5B%5D=,', { comma: true }), { foo: [['1', '2', '3'], ['', '']] });
        st.deepEqual(qs.parse('foo%5B%5D=1,2,3&foo%5B%5D=a', { comma: true }), { foo: [['1', '2', '3'], 'a'] });

        st.end();
    });

    t.test('parses comma delimited array while having percent-encoded comma treated as normal text', function (st) {
        st.deepEqual(qs.parse('foo=a%2Cb', { comma: true }), { foo: 'a,b' });
        st.deepEqual(qs.parse('foo=a%2C%20b,d', { comma: true }), { foo: ['a, b', 'd'] });
        st.deepEqual(qs.parse('foo=a%2C%20b,c%2C%20d', { comma: true }), { foo: ['a, b', 'c, d'] });

        st.end();
    });

    t.test('parses an object in dot notation', function (st) {
        var input = {
            'user.name': { 'pop[bob]': 3 },
            'user.email.': null
        };

        var expected = {
            user: {
                name: { 'pop[bob]': 3 },
                email: null
            }
        };

        var result = qs.parse(input, { allowDots: true });

        st.deepEqual(result, expected);
        st.end();
    });

    t.test('parses an object and not child values', function (st) {
        var input = {
            'user[name]': { 'pop[bob]': { test: 3 } },
            'user[email]': null
        };

        var expected = {
            user: {
                name: { 'pop[bob]': { test: 3 } },
                email: null
            }
        };

        var result = qs.parse(input);

        st.deepEqual(result, expected);
        st.end();
    });

    t.test('does not mutate an object input', function (st) {
        var arr = ['x'];
        st.deepEqual(qs.parse({ a: arr, 'a[]': 'y' }), { a: ['x', 'y'] }, 'appends to a copy of an input array');
        st.deepEqual(arr, ['x'], 'the input array is unchanged');

        var nested = { b: ['x'] };
        st.deepEqual(qs.parse({ a: nested, 'a[b][]': 'y' }), { a: { b: ['x', 'y'] } }, 'appends to a copy of a nested input array');
        st.deepEqual(nested, { b: ['x'] }, 'the nested input array is unchanged');

        var obj = { b: 'c' };
        st.deepEqual(qs.parse({ a: obj, 'a[d]': 'e' }), { a: { b: 'c', d: 'e' } }, 'merges into a copy of an input object');
        st.deepEqual(obj, { b: 'c' }, 'the input object is unchanged');

        var sparse = { b: [1, undefined, 2] };
        st.deepEqual(qs.parse({ a: sparse }), { a: { b: [1, 2] } }, 'compacts a copy of an input array');
        st.deepEqual(sparse, { b: [1, undefined, 2] }, 'the input array is not compacted');

        var nullProto = { __proto__: null, b: 'c' };
        st.equal(Object.getPrototypeOf(qs.parse({ a: nullProto }).a), null, 'a null-prototype input object stays null-prototype');

        var date = new Date(0);
        st.equal(qs.parse({ a: date }).a, date, 'a non-plain object is not copied');

        var cyclic = { b: 'c' };
        cyclic.self = cyclic;
        var result = qs.parse({ a: cyclic });
        st.notEqual(result.a, cyclic, 'a cyclic input object is copied');
        st.equal(result.a.self, result.a, 'the copy keeps the cycle');

        st.end();
    });

    t.test('does not blow up when Buffer global is missing', function (st) {
        var restore = mockProperty(global, 'Buffer', { 'delete': true });

        var result = qs.parse('a=b&c=d');

        restore();

        st.deepEqual(result, { a: 'b', c: 'd' });
        st.end();
    });

    t.test('does not crash when parsing circular references', function (st) {
        var a = {};
        a.b = a;

        var parsed;

        st.doesNotThrow(function () {
            parsed = qs.parse({ 'foo[bar]': 'baz', 'foo[baz]': a });
        });

        st.equal('foo' in parsed, true, 'parsed has "foo" property');
        st.equal('bar' in parsed.foo, true);
        st.equal('baz' in parsed.foo, true);
        st.equal(parsed.foo.bar, 'baz');
        st.deepEqual(parsed.foo.baz, a);
        st.end();
    });

    t.test('does not crash on multi-step circular references', function (st) {
        var a = {};
        a.b = { c: { d: a } };

        var parsed;

        st.doesNotThrow(function () {
            parsed = qs.parse({ foo: a });
        });

        st.equal('foo' in parsed, true, 'parsed has "foo" property');
        st.equal(parsed.foo.b.c.d, parsed.foo, 'the multi-step cycle is preserved');
        st.end();
    });

    t.test('does not crash when parsing deep objects', function (st) {
        var parsed;
        var str = 'foo';

        for (var i = 0; i < 5000; i++) {
            str += '[p]';
        }

        str += '=bar';

        st.doesNotThrow(function () {
            parsed = qs.parse(str, { depth: 5000 });
        });

        st.equal('foo' in parsed, true, 'parsed has "foo" property');

        var depth = 0;
        var ref = parsed.foo;
        while ((ref = ref.p)) {
            depth += 1;
        }

        st.equal(depth, 5000, 'parsed is 5000 properties deep');

        st.end();
    });

    t.test('parses null objects correctly', { skip: !hasProto }, function (st) {
        var a = { __proto__: null, b: 'c' };

        st.deepEqual(qs.parse(a), { b: 'c' });
        var result = qs.parse({ a: a });
        st.equal('a' in result, true, 'result has "a" property');
        st.deepEqual(result.a, a);
        st.end();
    });

    t.test('parses dates correctly', function (st) {
        var now = new Date();
        st.deepEqual(qs.parse({ a: now }), { a: now });
        st.end();
    });

    t.test('parses regular expressions correctly', function (st) {
        var re = /^test$/;
        st.deepEqual(qs.parse({ a: re }), { a: re });
        st.end();
    });

    t.test('does not allow overwriting prototype properties', function (st) {
        st.deepEqual(qs.parse('a[hasOwnProperty]=b', { allowPrototypes: false }), {});
        st.deepEqual(qs.parse('hasOwnProperty=b', { allowPrototypes: false }), {});

        st.deepEqual(
            qs.parse('toString', { allowPrototypes: false }),
            {},
            'bare "toString" results in {}'
        );

        st.end();
    });

    t.test('can allow overwriting prototype properties', function (st) {
        st.deepEqual(qs.parse('a[hasOwnProperty]=b', { allowPrototypes: true }), { a: { hasOwnProperty: 'b' } });
        st.deepEqual(qs.parse('hasOwnProperty=b', { allowPrototypes: true }), { hasOwnProperty: 'b' });

        st.deepEqual(
            qs.parse('toString', { allowPrototypes: true }),
            { toString: '' },
            'bare "toString" results in { toString: "" }'
        );

        st.end();
    });

    t.test('does not crash when the global Object prototype is frozen', { skip: !hasPropertyDescriptors || !hasOverrideMistake }, function (st) {
        // We can't actually freeze the global Object prototype as that will interfere with other tests, and once an object is frozen, it
        // can't be unfrozen. Instead, we add a new non-writable property to simulate this.
        st.teardown(mockProperty(Object.prototype, 'frozenProp', { value: 'foo', nonWritable: true, nonEnumerable: true }));

        st['throws'](
            function () {
                var obj = {};
                obj.frozenProp = 'bar';
            },
            // node < 6 has a different error message
            /^TypeError: Cannot assign to read only property 'frozenProp' of (?:object '#<Object>'|#<Object>)/,
            'regular assignment of an inherited non-writable property throws'
        );

        var parsed;
        st.doesNotThrow(
            function () {
                parsed = qs.parse('frozenProp', { allowPrototypes: false });
            },
            'parsing a nonwritable Object.prototype property does not throw'
        );

        st.deepEqual(parsed, {}, 'bare "frozenProp" results in {}');

        st.end();
    });

    t.test('params starting with a closing bracket', function (st) {
        st.deepEqual(qs.parse(']=toString'), { ']': 'toString' });
        st.deepEqual(qs.parse(']]=toString'), { ']]': 'toString' });
        st.deepEqual(qs.parse(']hello]=toString'), { ']hello]': 'toString' });
        st.end();
    });

    t.test('params starting with a starting bracket', function (st) {
        st.deepEqual(qs.parse('[=toString'), { '[': 'toString' });
        st.deepEqual(qs.parse('[[=toString'), { '[[': 'toString' });
        st.deepEqual(qs.parse('[hello[=toString'), { '[hello[': 'toString' });
        st.end();
    });

    t.test('add keys to objects', function (st) {
        st.deepEqual(
            qs.parse('a[b]=c&a=d', { strictMerge: false }),
            { a: { b: 'c', d: true } },
            'can add keys to objects'
        );

        st.deepEqual(
            qs.parse('a[b]=c&a=toString', { strictMerge: false }),
            { a: { b: 'c' } },
            'can not overwrite prototype'
        );

        st.deepEqual(
            qs.parse('a[b]=c&a=toString', { strictMerge: false, allowPrototypes: true }),
            { a: { b: 'c', toString: true } },
            'can overwrite prototype with allowPrototypes true'
        );

        st.deepEqual(
            qs.parse('a[b]=c&a=toString', { strictMerge: false, plainObjects: true }),
            { __proto__: null, a: { __proto__: null, b: 'c', toString: true } },
            'can overwrite prototype with plainObjects true'
        );

        st.end();
    });

    t.test('strictMerge wraps object and primitive into an array', function (st) {
        st.deepEqual(
            qs.parse('a[b]=c&a=d'),
            { a: [{ b: 'c' }, 'd'] },
            'object then primitive produces array'
        );

        st.deepEqual(
            qs.parse('a=d&a[b]=c'),
            { a: ['d', { b: 'c' }] },
            'primitive then object produces array'
        );

        st.deepEqual(
            qs.parse('a[b]=c&a=toString'),
            { a: [{ b: 'c' }, 'toString'] },
            'prototype-colliding value is preserved in array'
        );

        st.deepEqual(
            qs.parse('a[b]=c&a=toString', { plainObjects: true }),
            { __proto__: null, a: [{ __proto__: null, b: 'c' }, 'toString'] },
            'plainObjects preserved in array wrapping'
        );

        st.end();
    });

    t.test('strictMerge conflicts do not overwrite indexed values already at that path', function (st) {
        st.deepEqual(
            qs.parse('a[z]=o&a=p&a[y]=q&a[2]=keep&[a]=r'),
            { a: { 0: { z: 'o' }, 1: 'p', 2: 'keep', 3: 'r', y: 'q' } },
            'an indexed key merged into the container is kept'
        );

        st.deepEqual(
            qs.parse('a[z]=o&a=p&a[2]=keep&a[y]=q&[a]=r'),
            { a: { 0: { z: 'o' }, 1: 'p', 2: 'keep', 3: 'r', y: 'q' } },
            'an indexed key that extended the container while it was an array is kept'
        );

        st.end();
    });

    t.test('strictMerge conflicts do not overwrite values once the container overflows', function (st) {
        st.deepEqual(
            qs.parse('a[z]=v0&a=v1&a[y]=v2&[a]=v3&[a]x=v4&a[2]=v5&[a]x1=v6', { arrayLimit: 2 }),
            { a: { 0: { z: 'v0' }, 1: 'v1', 2: ['v3', 'v5'], 3: 'v4', 4: 'v6', y: 'v2' } },
            'a conflict appended after the container overflowed keeps every value'
        );

        st.deepEqual(
            qs.parse('a[2]=v1&a=v5&a=v7&[a]x=v9', { parseArrays: false, arrayLimit: 1 }),
            { a: { 0: 'v5', 1: 'v7', 2: 'v1', 3: 'v9' } },
            'an index the container already holds is not reused'
        );

        st.end();
    });

    t.test('dunder proto is ignored', function (st) {
        var payload = 'categories[__proto__]=login&categories[__proto__]&categories[length]=42';
        var result = qs.parse(payload, { allowPrototypes: true });

        st.deepEqual(
            result,
            {
                categories: {
                    length: '42'
                }
            },
            'silent [[Prototype]] payload'
        );

        var plainResult = qs.parse(payload, { allowPrototypes: true, plainObjects: true });

        st.deepEqual(
            plainResult,
            {
                __proto__: null,
                categories: {
                    __proto__: null,
                    length: '42'
                }
            },
            'silent [[Prototype]] payload: plain objects'
        );

        var query = qs.parse('categories[__proto__]=cats&categories[__proto__]=dogs&categories[some][json]=toInject', { allowPrototypes: true });

        st.notOk(Array.isArray(query.categories), 'is not an array');
        st.notOk(query.categories instanceof Array, 'is not instanceof an array');
        st.deepEqual(query.categories, { some: { json: 'toInject' } });
        st.equal(JSON.stringify(query.categories), '{"some":{"json":"toInject"}}', 'stringifies as a non-array');

        st.deepEqual(
            qs.parse('foo[__proto__][hidden]=value&foo[bar]=stuffs', { allowPrototypes: true }),
            {
                foo: {
                    bar: 'stuffs'
                }
            },
            'hidden values'
        );

        st.deepEqual(
            qs.parse('foo[__proto__][hidden]=value&foo[bar]=stuffs', { allowPrototypes: true, plainObjects: true }),
            {
                __proto__: null,
                foo: {
                    __proto__: null,
                    bar: 'stuffs'
                }
            },
            'hidden values: plain objects'
        );

        st.end();
    });

    t.test('object-valued input with own `__proto__` does not mutate sub-object [[Prototype]]', function (st) {
        // JSON.parse creates own data `__proto__` properties (via CreateDataProperty),
        // which would trigger the Object.prototype.__proto__ accessor if merged via `acc[key] = value`.
        var out = qs.parse({
            'user[name]': 'alice',
            user: JSON.parse('{"__proto__":{"isAdmin":true}}')
        }, { allowPrototypes: false });

        st.equal(out.user.name, 'alice', 'name from bracket key is preserved');
        st.equal(out.user.isAdmin, undefined, 'attacker-controlled inherited property is not exposed');
        st.equal(Object.getPrototypeOf(out.user), Object.prototype, 'sub-object [[Prototype]] is unchanged');
        st.equal(Object.prototype.isAdmin, undefined, 'Object.prototype is not polluted');

        st.end();
    });

    var withOwnProto = function (value) {
        var obj = {};
        Object.defineProperty(obj, '__proto__', {
            configurable: true,
            enumerable: true,
            value: value,
            writable: true
        });
        return obj;
    };
    // node < 0.12 reads an own `__proto__` data property as `Object.prototype`, so it can not be copied by value
    var ownProtoIsReadable = withOwnProto(1).__proto__ === 1; // eslint-disable-line no-proto

    t.test('object-valued input with only an own `__proto__` does not mutate sub-object [[Prototype]]', function (st) {
        // `JSON.parse` in node < 0.12 sets the [[Prototype]] instead of creating an own `__proto__`
        var out = qs.parse({ user: withOwnProto({ isAdmin: true }) });

        st.equal(out.user.isAdmin, undefined, 'attacker-controlled inherited property is not exposed');
        st.equal(Object.getPrototypeOf(out.user), Object.prototype, 'sub-object [[Prototype]] is unchanged');
        st.equal(Object.prototype.isAdmin, undefined, 'Object.prototype is not polluted');

        var sibling = withOwnProto({ isAdmin: true });
        sibling.name = 'alice';
        var withSibling = qs.parse({ user: sibling });

        st.equal(withSibling.user.name, 'alice', 'sibling key is preserved');
        st.equal(withSibling.user.isAdmin, undefined, 'a sibling key does not hide an inherited property');
        st.equal(Object.getPrototypeOf(withSibling.user), Object.prototype, 'a sibling key does not change [[Prototype]]');

        st.end();
    });

    t.test('object-valued input keeps an own `__proto__` as a data property', { skip: !ownProtoIsReadable }, function (st) {
        var descriptor = function (value) {
            return {
                configurable: true,
                enumerable: true,
                value: value,
                writable: true
            };
        };

        st.deepEqual(
            Object.getOwnPropertyDescriptor(qs.parse({ user: withOwnProto({ isAdmin: true }) }).user, '__proto__'),
            descriptor({ isAdmin: true }),
            'an object value is stored as a data property'
        );
        st.deepEqual(
            Object.getOwnPropertyDescriptor(qs.parse({ user: withOwnProto('admin') }).user, '__proto__'),
            descriptor('admin'),
            'a primitive value is stored as a data property'
        );
        st.deepEqual(
            Object.getOwnPropertyDescriptor(qs.parse({ 'user[name]': 'alice', user: withOwnProto({ isAdmin: true }) }).user, '__proto__'),
            descriptor({ isAdmin: true }),
            'it survives a merge with a bracket key'
        );

        st.end();
    });

    t.test('can return null objects', { skip: !hasProto }, function (st) {
        var expected = {
            __proto__: null,
            a: {
                __proto__: null,
                b: 'c',
                hasOwnProperty: 'd'
            }
        };
        st.deepEqual(qs.parse('a[b]=c&a[hasOwnProperty]=d', { plainObjects: true }), expected);
        st.deepEqual(qs.parse(null, { plainObjects: true }), { __proto__: null });
        var expectedArray = {
            __proto__: null,
            a: {
                __proto__: null,
                0: 'b',
                c: 'd'
            }
        };
        st.deepEqual(qs.parse('a[]=b&a[c]=d', { plainObjects: true }), expectedArray);
        st.end();
    });

    t.test('returns null objects for empty brackets when parseArrays is false', { skip: !hasProto }, function (st) {
        st.deepEqual(
            qs.parse('a[]=b', { parseArrays: false, plainObjects: true }),
            { __proto__: null, a: { __proto__: null, 0: 'b' } }
        );
        st.deepEqual(
            qs.parse('a[]=b&a[hasOwnProperty]=c', { parseArrays: false, plainObjects: true }),
            { __proto__: null, a: { __proto__: null, 0: 'b', hasOwnProperty: 'c' } },
            'prototype keys land on a null object'
        );
        st.end();
    });

    t.test('can parse with custom encoding', function (st) {
        st.deepEqual(qs.parse('%8c%a7=%91%e5%8d%e3%95%7b', {
            decoder: function (str) {
                var reg = /%([0-9A-F]{2})/ig;
                var result = [];
                var parts = reg.exec(str);
                while (parts) {
                    result.push(parseInt(parts[1], 16));
                    parts = reg.exec(str);
                }
                return String(iconv.decode(SaferBuffer.from(result), 'shift_jis'));
            }
        }), { 県: '大阪府' });
        st.end();
    });

    t.test('receives the default decoder as a second argument', function (st) {
        st.plan(1);
        qs.parse('a', {
            decoder: function (str, defaultDecoder) {
                st.equal(defaultDecoder, utils.decode);
            }
        });
        st.end();
    });

    t.test('throws error with wrong decoder', function (st) {
        st['throws'](function () {
            qs.parse({}, { decoder: 'string' });
        }, new TypeError('Decoder has to be a function.'));
        st.end();
    });

    t.test('does not mutate the options argument', function (st) {
        var options = {};
        qs.parse('a[b]=true', options);
        st.deepEqual(options, {});
        st.end();
    });

    t.test('throws if an invalid charset is specified', function (st) {
        st['throws'](function () {
            qs.parse('a=b', { charset: 'foobar' });
        }, new TypeError('The charset option must be either utf-8, iso-8859-1, or undefined'));
        st.end();
    });

    t.test('parses an iso-8859-1 string if asked to', function (st) {
        st.deepEqual(qs.parse('%A2=%BD', { charset: 'iso-8859-1' }), { '¢': '½' });
        st.end();
    });

    var urlEncodedCheckmarkInUtf8 = '%E2%9C%93';
    var urlEncodedOSlashInUtf8 = '%C3%B8';
    var urlEncodedNumCheckmark = '%26%2310003%3B';
    var urlEncodedNumSmiley = '%26%239786%3B';

    t.test('prefers an utf-8 charset specified by the utf8 sentinel to a default charset of iso-8859-1', function (st) {
        st.deepEqual(qs.parse('utf8=' + urlEncodedCheckmarkInUtf8 + '&' + urlEncodedOSlashInUtf8 + '=' + urlEncodedOSlashInUtf8, { charsetSentinel: true, charset: 'iso-8859-1' }), { ø: 'ø' });
        st.end();
    });

    t.test('prefers an iso-8859-1 charset specified by the utf8 sentinel to a default charset of utf-8', function (st) {
        st.deepEqual(qs.parse('utf8=' + urlEncodedNumCheckmark + '&' + urlEncodedOSlashInUtf8 + '=' + urlEncodedOSlashInUtf8, { charsetSentinel: true, charset: 'utf-8' }), { 'Ã¸': 'Ã¸' });
        st.end();
    });

    t.test('does not require the utf8 sentinel to be defined before the parameters whose decoding it affects', function (st) {
        st.deepEqual(qs.parse('a=' + urlEncodedOSlashInUtf8 + '&utf8=' + urlEncodedNumCheckmark, { charsetSentinel: true, charset: 'utf-8' }), { a: 'Ã¸' });
        st.end();
    });

    t.test('ignores an utf8 sentinel with an unknown value', function (st) {
        st.deepEqual(qs.parse('utf8=foo&' + urlEncodedOSlashInUtf8 + '=' + urlEncodedOSlashInUtf8, { charsetSentinel: true, charset: 'utf-8' }), { ø: 'ø' });
        st.end();
    });

    t.test('uses the utf8 sentinel to switch to utf-8 when no default charset is given', function (st) {
        st.deepEqual(qs.parse('utf8=' + urlEncodedCheckmarkInUtf8 + '&' + urlEncodedOSlashInUtf8 + '=' + urlEncodedOSlashInUtf8, { charsetSentinel: true }), { ø: 'ø' });
        st.end();
    });

    t.test('uses the utf8 sentinel to switch to iso-8859-1 when no default charset is given', function (st) {
        st.deepEqual(qs.parse('utf8=' + urlEncodedNumCheckmark + '&' + urlEncodedOSlashInUtf8 + '=' + urlEncodedOSlashInUtf8, { charsetSentinel: true }), { 'Ã¸': 'Ã¸' });
        st.end();
    });

    t.test('interprets numeric entities in iso-8859-1 when `interpretNumericEntities`', function (st) {
        st.deepEqual(qs.parse('foo=' + urlEncodedNumSmiley, { charset: 'iso-8859-1', interpretNumericEntities: true }), { foo: '☺' });
        st.end();
    });

    t.test('interprets numeric entities above U+FFFF as surrogate pairs', function (st) {
        var options = { charset: 'iso-8859-1', interpretNumericEntities: true };
        st.deepEqual(qs.parse('foo=%26%23128512%3B', options), { foo: '\uD83D\uDE00' }, 'U+1F600, which a browser submits as `&#128512;` from an iso-8859-1 form');
        st.deepEqual(qs.parse('foo=%26%2365536%3B', options), { foo: '\uD800\uDC00' }, 'U+10000');
        st.deepEqual(qs.parse('foo=%26%231114111%3B', options), { foo: '\uDBFF\uDFFF' }, 'U+10FFFF');
        st.deepEqual(qs.parse('foo=%26%2365535%3B', options), { foo: '\uFFFF' }, 'U+FFFF is still one code unit');
        st.end();
    });

    t.test('interprets numeric entities in each value, but not in keys', function (st) {
        var options = { charset: 'iso-8859-1', interpretNumericEntities: true };
        st.deepEqual(qs.parse('a=' + urlEncodedNumSmiley + ',x', options), { a: '☺,x' }, 'a value with commas stays one string without `comma`');
        st.deepEqual(qs.parse('a' + urlEncodedNumSmiley + '=x', options), { 'a&#9786;': 'x' }, 'keys are not interpreted');
        st.deepEqual(qs.parse('a[]=' + urlEncodedNumSmiley + '&a[]=x', options), { a: ['☺', 'x'] }, 'bracket array values');
        st.deepEqual(qs.parse('a=' + urlEncodedNumSmiley + '&a=x', options), { a: ['☺', 'x'] }, 'repeated key values');
        st.deepEqual(qs.parse('a[b]=' + urlEncodedNumSmiley, options), { a: { b: '☺' } }, 'nested key values');
        st.deepEqual(
            qs.parse('utf8=%26%2310003%3B&a=' + urlEncodedNumSmiley, { charsetSentinel: true, interpretNumericEntities: true }),
            { a: '☺' },
            'an iso-8859-1 charset sentinel enables interpretation'
        );
        st.deepEqual(qs.parse('a=' + urlEncodedNumSmiley + ',x', { charset: 'iso-8859-1', comma: true }), { a: ['&#9786;', 'x'] }, '`comma` splits without `interpretNumericEntities`');
        st.end();
    });

    t.test('handles a custom decoder returning `null`, in the `iso-8859-1` charset, when `interpretNumericEntities`', function (st) {
        st.deepEqual(qs.parse('foo=&bar=' + urlEncodedNumSmiley, {
            charset: 'iso-8859-1',
            decoder: function (str, defaultDecoder, charset) {
                return str ? defaultDecoder(str, defaultDecoder, charset) : null;
            },
            interpretNumericEntities: true
        }), { foo: null, bar: '☺' });
        st.end();
    });

    t.test('handles a custom decoder returning `null`, with a string key of `null`', function (st) {
        st.deepEqual(
            qs.parse('null=1&ToNull=2', {
                decoder: function (str, defaultDecoder, charset) {
                    return str === 'ToNull' ? null : defaultDecoder(str, defaultDecoder, charset);
                }
            }),
            { 'null': '1' },
            '"null" key is not overridden by `null` decoder result'
        );

        st.end();
    });

    t.test('does not interpret numeric entities in iso-8859-1 when `interpretNumericEntities` is absent', function (st) {
        st.deepEqual(qs.parse('foo=' + urlEncodedNumSmiley, { charset: 'iso-8859-1' }), { foo: '&#9786;' });
        st.end();
    });

    t.test('does not interpret numeric entities when the charset is utf-8, even when `interpretNumericEntities`', function (st) {
        st.deepEqual(qs.parse('foo=' + urlEncodedNumSmiley, { charset: 'utf-8', interpretNumericEntities: true }), { foo: '&#9786;' });
        st.end();
    });

    t.test('interpretNumericEntities preserves comma arrays in iso charset', function (st) {
        st.deepEqual(
            qs.parse('b&a[]=1,' + urlEncodedNumSmiley, { comma: true, charset: 'iso-8859-1', interpretNumericEntities: true }),
            { b: '', a: [['1', '☺']] }
        );

        st.end();
    });

    t.test('interprets numeric entities per comma-separated value', function (st) {
        var options = { comma: true, charset: 'iso-8859-1', interpretNumericEntities: true };
        st.deepEqual(qs.parse('a=b,c', options), { a: ['b', 'c'] });
        st.deepEqual(qs.parse('a=' + urlEncodedNumSmiley + ',%26%239786%3B', options), { a: ['☺', '☺'] });
        st.deepEqual(qs.parse('a=%26%2344%3B,b%2Cc', options), { a: [',', 'b,c'] });
        st.deepEqual(qs.parse('a=,b,', options), { a: ['', 'b', ''] });
        st.deepEqual(qs.parse('a=b,c&a=d,e', options), { a: ['b', 'c', 'd', 'e'] });
        st.deepEqual(qs.parse('a[]=b,c&a[]=d,e', options), { a: [['b', 'c'], ['d', 'e']] });
        st.deepEqual(qs.parse('a[0]=b,c', options), { a: [['b', 'c']] });
        st.deepEqual(qs.parse('utf8=%26%2310003%3B&a=b,' + urlEncodedNumSmiley, {
            comma: true,
            charsetSentinel: true,
            interpretNumericEntities: true
        }), { a: ['b', '☺'] });
        st.deepEqual(qs.parse('a=b,c,d', {
            comma: true,
            charset: 'iso-8859-1',
            interpretNumericEntities: true,
            arrayLimit: 2
        }), { a: { 0: 'b', 1: 'c', 2: 'd' } });
        st['throws'](function () {
            qs.parse('a=b,c,d', {
                comma: true,
                charset: 'iso-8859-1',
                interpretNumericEntities: true,
                arrayLimit: 2,
                throwOnLimitExceeded: true
            });
        }, RangeError);
        st.end();
    });

    t.test('preserves falsy decoder results inside comma arrays', function (st) {
        st.deepEqual(qs.parse('a=null,0,false,' + urlEncodedNumSmiley, {
            comma: true,
            charset: 'iso-8859-1',
            interpretNumericEntities: true,
            decoder: function (str, defaultDecoder, charset, type) {
                if (type === 'value') {
                    if (str === 'null') {
                        return null;
                    }
                    if (str === '0') {
                        return 0;
                    }
                    if (str === 'false') {
                        return false;
                    }
                }
                return defaultDecoder(str, defaultDecoder, charset, type);
            }
        }), { a: [null, 0, false, '☺'] });
        st.end();
    });

    t.test('does not interpret %uXXXX syntax in iso-8859-1 mode', function (st) {
        st.deepEqual(qs.parse('%u263A=%u263A', { charset: 'iso-8859-1' }), { '%u263A': '%u263A' });
        st.end();
    });

    t.test('allows for decoding keys and values differently', function (st) {
        var decoder = function (str, defaultDecoder, charset, type) {
            if (type === 'key') {
                return defaultDecoder(str, defaultDecoder, charset, type).toLowerCase();
            }
            if (type === 'value') {
                return defaultDecoder(str, defaultDecoder, charset, type).toUpperCase();
            }
            throw 'this should never happen! type: ' + type;
        };

        st.deepEqual(qs.parse('KeY=vAlUe', { decoder: decoder }), { key: 'VALUE' });

        var noopDecoder = function () { return 'x'; };
        noopDecoder();
        st['throws'](
            function () { decoder('x', noopDecoder, 'utf-8', 'unknown'); },
            'this should never happen! type: unknown',
            'decoder throws for unexpected type'
        );

        st.end();
    });

    t.test('parameter limit tests', function (st) {
        st.test('does not throw error when within parameter limit', function (sst) {
            var result = qs.parse('a=1&b=2&c=3', { parameterLimit: 5, throwOnLimitExceeded: true });
            sst.deepEqual(result, { a: '1', b: '2', c: '3' }, 'parses without errors');
            sst.end();
        });

        st.test('throws error when throwOnLimitExceeded is present but not boolean', function (sst) {
            sst['throws'](
                function () {
                    qs.parse('a=1&b=2&c=3&d=4&e=5&f=6', { parameterLimit: 3, throwOnLimitExceeded: 'true' });
                },
                new TypeError('`throwOnLimitExceeded` option must be a boolean'),
                'throws error when throwOnLimitExceeded is present and not boolean'
            );
            sst.end();
        });

        st.test('throws error when parameter limit exceeded', function (sst) {
            sst['throws'](
                function () {
                    qs.parse('a=1&b=2&c=3&d=4&e=5&f=6', { parameterLimit: 3, throwOnLimitExceeded: true });
                },
                new RangeError('Parameter limit exceeded. Only 3 parameters allowed.'),
                'throws error when parameter limit is exceeded'
            );

            sst['throws'](
                function () {
                    qs.parse('a=1&b=2', { parameterLimit: 1, throwOnLimitExceeded: true });
                },
                new RangeError('Parameter limit exceeded. Only 1 parameter allowed.'),
                'throws error with singular "parameter" when parameterLimit is 1'
            );
            sst.end();
        });

        st.test('silently truncates when throwOnLimitExceeded is not given', function (sst) {
            var result = qs.parse('a=1&b=2&c=3&d=4&e=5', { parameterLimit: 3 });
            sst.deepEqual(result, { a: '1', b: '2', c: '3' }, 'parses and truncates silently');
            sst.end();
        });

        st.test('silently truncates when parameter limit exceeded without error', function (sst) {
            var result = qs.parse('a=1&b=2&c=3&d=4&e=5', { parameterLimit: 3, throwOnLimitExceeded: false });
            sst.deepEqual(result, { a: '1', b: '2', c: '3' }, 'parses and truncates silently');
            sst.end();
        });

        st.test('allows unlimited parameters when parameterLimit set to Infinity', function (sst) {
            var result = qs.parse('a=1&b=2&c=3&d=4&e=5&f=6', { parameterLimit: Infinity });
            sst.deepEqual(result, { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6' }, 'parses all parameters without truncation');
            sst.end();
        });

        st.test('allows unlimited parameters when parameterLimit is Infinity and throwOnLimitExceeded is true', function (sst) {
            var result = qs.parse('a=1&b=2&c=3&d=4&e=5&f=6', { parameterLimit: Infinity, throwOnLimitExceeded: true });
            sst.deepEqual(result, { a: '1', b: '2', c: '3', d: '4', e: '5', f: '6' }, 'parses all parameters without truncation or throwing');
            sst.end();
        });

        st.end();
    });

    t.test('array limit tests', function (st) {
        st.test('does not throw error when array is within limit', function (sst) {
            var result = qs.parse('a[]=1&a[]=2&a[]=3', { arrayLimit: 5, throwOnLimitExceeded: true });
            sst.deepEqual(result, { a: ['1', '2', '3'] }, 'parses array without errors');
            sst.end();
        });

        st.test('throws error when throwOnLimitExceeded is present but not boolean for array limit', function (sst) {
            sst['throws'](
                function () {
                    qs.parse('a[]=1&a[]=2&a[]=3&a[]=4', { arrayLimit: 3, throwOnLimitExceeded: 'true' });
                },
                new TypeError('`throwOnLimitExceeded` option must be a boolean'),
                'throws error when throwOnLimitExceeded is present and not boolean for array limit'
            );
            sst.end();
        });

        st.test('throws error when array limit exceeded', function (sst) {
            // 4 elements exceeds limit of 3
            sst['throws'](
                function () {
                    qs.parse('a[]=1&a[]=2&a[]=3&a[]=4', { arrayLimit: 3, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
                'throws error when array limit is exceeded'
            );
            sst.end();
        });

        st.test('zero and negative arrayLimit allow non-array values', function (sst) {
            forEach([0, -1], function (arrayLimit) {
                var options = { arrayLimit: arrayLimit, throwOnLimitExceeded: true };
                var label = 'arrayLimit ' + arrayLimit;
                sst.deepEqual(qs.parse('a=b&c[d]=e', options), { a: 'b', c: { d: 'e' } }, label + ': query string fields');
                sst.deepEqual(qs.parse('a=b', { arrayLimit: arrayLimit, throwOnLimitExceeded: true, comma: true }), { a: 'b' }, label + ': a value without commas when comma is enabled');
                sst.deepEqual(qs.parse({ a: 'b', 'c[d]': 'e' }, options), { a: 'b', c: { d: 'e' } }, label + ': object input fields');
                sst.deepEqual(qs.parse({ a: [] }, options), { a: [] }, label + ': an empty input array has no elements');
                sst.deepEqual(
                    qs.parse('a=b&a=c', { arrayLimit: arrayLimit, throwOnLimitExceeded: true, duplicates: 'last' }),
                    { a: 'c' },
                    label + ': replacing a duplicate does not create an array'
                );
                sst.deepEqual(
                    qs.parse('a[]=', { arrayLimit: arrayLimit, throwOnLimitExceeded: true, allowEmptyArrays: true }),
                    { a: [] },
                    label + ': an empty array has no elements to exceed the limit'
                );
                sst.deepEqual(qs.parse({ a: ['b'] }, options), { a: ['b'] }, label + ': an array value in object input is left as-is');
                sst.deepEqual(qs.parse({ 'a[b]': ['x'] }, options), { a: { b: ['x'] } }, label + ': an array value under a nested key in object input is left as-is');
                sst.deepEqual(qs.parse('a.b=c', { arrayLimit: arrayLimit, throwOnLimitExceeded: true, allowDots: true }), { a: { b: 'c' } }, label + ': dotted keys');
                sst.deepEqual(
                    qs.parse('a=b&a=c', { arrayLimit: arrayLimit, throwOnLimitExceeded: true, duplicates: 'first' }),
                    { a: 'b' },
                    label + ': keeping the first duplicate does not create an array'
                );
                sst.deepEqual(
                    qs.parse('a[]=b', { arrayLimit: arrayLimit, throwOnLimitExceeded: true, parseArrays: false }),
                    { a: { 0: 'b' } },
                    label + ': array syntax with parseArrays false does not create an array'
                );
            });
            sst.end();
        });

        st.test('does not throw when at limit', function (sst) {
            // 3 elements = limit of 3, should not throw
            var result = qs.parse('a[]=1&a[]=2&a[]=3', { arrayLimit: 3, throwOnLimitExceeded: true });
            sst.ok(Array.isArray(result.a), 'result is an array');
            sst.deepEqual(result.a, ['1', '2', '3'], 'all values present');
            sst.end();
        });

        st.test('zero and negative arrayLimit', function (sst) {
            forEach([0, -1], function (arrayLimit) {
                var options = { arrayLimit: arrayLimit };
                var throwOptions = { arrayLimit: arrayLimit, throwOnLimitExceeded: true };
                var label = 'arrayLimit ' + arrayLimit;

                sst.deepEqual(qs.parse('a=b&c[d]=e', options), { a: 'b', c: { d: 'e' } }, label + ': scalar and object fields are unaffected');
                sst.deepEqual(qs.parse('a[]=b', options), { a: { 0: 'b' } }, label + ': a bracket array becomes an object');
                sst.deepEqual(qs.parse('a[]=b&a[]=c', options), { a: { 0: 'b', 1: 'c' } }, label + ': a multi-element bracket array becomes an object');
                sst.deepEqual(qs.parse('a[0]=b', options), { a: { 0: 'b' } }, label + ': an indexed array becomes an object');
                sst.deepEqual(qs.parse('a=b&a=c', options), { a: { 0: 'b', 1: 'c' } }, label + ': combined duplicates become an object');
                sst.deepEqual(qs.parse('a[]=', options), { a: { 0: '' } }, label + ': an empty-string element still counts as an element');
                sst.deepEqual(qs.parse('a[]=', { arrayLimit: arrayLimit, allowEmptyArrays: true }), { a: [] }, label + ': an empty array has no elements');
                sst.deepEqual(qs.parse({ 'a[]': 'b' }, options), { a: { 0: 'b' } }, label + ': a bracket key in object input becomes an object');
                sst.deepEqual(qs.parse({ a: ['b'] }, options), { a: ['b'] }, label + ': an array value in object input is left as-is');
                sst.deepEqual(qs.parse({ a: [] }, options), { a: [] }, label + ': an empty array value in object input is left as-is');

                var error = arrayLimit === 0
                    ? new RangeError('Array limit exceeded. Only 0 elements allowed in an array.')
                    : RangeError;
                sst['throws'](function () { qs.parse('a[]=b', throwOptions); }, error, label + ': throws on a bracket array');
                sst['throws'](function () { qs.parse('a[0]=b', throwOptions); }, error, label + ': throws on an indexed array');
                sst['throws'](function () { qs.parse('a=b&a=c', throwOptions); }, error, label + ': throws on combined duplicates');
                sst['throws'](function () { qs.parse('a[]=', throwOptions); }, error, label + ': throws on an empty-string element');
                sst['throws'](function () { qs.parse({ 'a[]': 'b' }, throwOptions); }, error, label + ': throws on a bracket key in object input');
            });

            sst.end();
        });

        st.test('zero and negative arrayLimit with comma', function (sst) {
            forEach([0, -1], function (arrayLimit) {
                var options = { arrayLimit: arrayLimit, comma: true };
                var throwOptions = { arrayLimit: arrayLimit, comma: true, throwOnLimitExceeded: true };
                var label = 'arrayLimit ' + arrayLimit;

                sst.deepEqual(qs.parse('a=b', options), { a: 'b' }, label + ': a value without commas is unaffected');
                sst.deepEqual(qs.parse('a=b,c', options), { a: { 0: 'b', 1: 'c' } }, label + ': a comma value becomes an object');
                sst.deepEqual(qs.parse('a[]=b,c', options), { a: { 0: ['b', 'c'] } }, label + ': a bracket array holding a comma group becomes an object');
                sst.deepEqual(qs.parse('a[0]=b,c', options), { a: { 0: { 0: 'b', 1: 'c' } } }, label + ': an indexed comma group becomes an object');

                var error = arrayLimit === 0
                    ? new RangeError('Array limit exceeded. Only 0 elements allowed in an array.')
                    : RangeError;
                sst['throws'](function () { qs.parse('a=b,c', throwOptions); }, error, label + ': throws on a comma value');
                sst['throws'](function () { qs.parse('a[]=b,c', throwOptions); }, error, label + ': throws on a comma group under `[]=`');
                sst['throws'](function () { qs.parse('a[0]=b,c', throwOptions); }, error, label + ': throws on an indexed comma group');
            });

            sst.end();
        });

        st.test('converts array to object if length is greater than limit', function (sst) {
            var result = qs.parse('a[1]=1&a[2]=2&a[3]=3&a[4]=4&a[5]=5&a[6]=6', { arrayLimit: 5 });

            sst.deepEqual(result, { a: { 1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6' } }, 'parses into object if array length is greater than limit');
            sst.end();
        });

        st.test('throws error when indexed notation exceeds arrayLimit with throwOnLimitExceeded', function (sst) {
            sst['throws'](
                function () {
                    qs.parse('a[1001]=b', { arrayLimit: 1000, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 1000 elements allowed in an array.'),
                'throws error for a single index exceeding arrayLimit'
            );

            sst['throws'](
                function () {
                    qs.parse('a[0]=1&a[1]=2&a[2]=3&a[10]=4', { arrayLimit: 6, throwOnLimitExceeded: true, allowSparse: true });
                },
                new RangeError('Array limit exceeded. Only 6 elements allowed in an array.'),
                'throws error when a sparse index exceeds arrayLimit'
            );

            sst['throws'](
                function () {
                    qs.parse('a[2]=b', { arrayLimit: 1, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'throws error with singular "element" when arrayLimit is 1'
            );

            sst.end();
        });

        st.test('does not throw for indexed notation within arrayLimit with throwOnLimitExceeded', function (sst) {
            var result = qs.parse('a[4]=b', { arrayLimit: 5, throwOnLimitExceeded: true, allowSparse: true });
            sst.ok(Array.isArray(result.a), 'result is an array');
            sst.equal(result.a.length, 5, 'array has correct length');
            sst.equal(result.a[4], 'b', 'value at index 4 is correct');
            sst.end();
        });

        st.test('silently converts to object for indexed notation exceeding arrayLimit without throwOnLimitExceeded', function (sst) {
            var result = qs.parse('a[1001]=b', { arrayLimit: 1000 });
            sst.deepEqual(result, { a: { 1001: 'b' } }, 'converts to object without throwing');
            sst.end();
        });

        st.test('throws when duplicate bracket keys exceed arrayLimit with throwOnLimitExceeded', function (sst) {
            sst['throws'](
                function () {
                    qs.parse('a[]=1&a[]=2&a[]=3&a[]=4&a[]=5&a[]=6', { arrayLimit: 5, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 5 elements allowed in an array.'),
                'throws error when duplicate bracket notation exceeds array limit'
            );
            sst.end();
        });

        st.test('throws when cumulative comma + duplicate-key combine exceeds arrayLimit', function (sst) {
            sst['throws'](
                function () {
                    qs.parse('a=1,2,3&a=4,5,6', { comma: true, arrayLimit: 5, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 5 elements allowed in an array.'),
                'throws when comma groups within the limit cumulatively exceed it across duplicate keys'
            );

            sst['throws'](
                function () {
                    qs.parse('a=v,v,v,v,v&a=v,v,v,v,v&a=v,v,v,v,v', { comma: true, arrayLimit: 5, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 5 elements allowed in an array.'),
                'throws on a subsequent part once the cumulative array is already over the limit'
            );
            sst.end();
        });

        st.test('throws when plain duplicate keys combine past arrayLimit at the boundary', function (sst) {
            sst['throws'](
                function () { qs.parse('a=x&a=y', { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'duplicate scalar keys'
            );

            sst['throws'](
                function () { qs.parse('a[]=x&a[]=y', { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'duplicate bracket keys'
            );
            sst.end();
        });

        st.test('throws when mixed index and key notation merge past arrayLimit', function (sst) {
            sst['throws'](
                function () { qs.parse('a=x&a[0]=y', { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'scalar then index that overflows on merge'
            );

            sst['throws'](
                function () { qs.parse('a[0]=1&a[1]=2&a=3', { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'indexed array then scalar that overflows on merge'
            );
            sst.end();
        });

        st.test('enforces arrayLimit on merge at the boundary, consistently with combine', function (sst) {
            sst['throws'](
                function () { qs.parse('a[0]=x&a=y', { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'a trailing scalar merged into an at-limit array throws'
            );
            sst.deepEqual(
                qs.parse('a[0]=x&a=y', { arrayLimit: 1 }),
                { a: { 0: 'x', 1: 'y' } },
                'and converts to an overflow object without throwOnLimitExceeded'
            );

            sst['throws'](
                function () { qs.parse('a[0]=x&a[]=y', { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'mixed index and bracket notation merged past the limit throws'
            );
            sst.deepEqual(
                qs.parse('a[0]=x&a[]=y', { arrayLimit: 1 }),
                { a: { 0: 'x', 1: 'y' } },
                'mixed index and bracket notation converts like duplicate-bracket combine'
            );

            sst.end();
        });

        st.test('counts the elements of a sparse indexed array on merge, not its holes', function (sst) {
            sst.deepEqual(qs.parse('a[]=new&a[19]=19&a[0]=0'), { a: ['new', '19', '0'] }, 'an array merged into a sparse array');
            sst.deepEqual(qs.parse('a[]=new&a[19]=19&a[0]=0', { throwOnLimitExceeded: true }), { a: ['new', '19', '0'] }, 'and it does not throw');
            sst.deepEqual(qs.parse('a[0]=w&a[19]=x&a[]=y'), { a: ['w', 'x', 'y'] }, 'a bracket value appended after a high index');
            sst.deepEqual(qs.parse('a[19]=x&a=y'), { a: ['x', 'y'] }, 'a scalar merged into a sparse array');
            sst.deepEqual(qs.parse('a[19]=x&a=y', { throwOnLimitExceeded: true }), { a: ['x', 'y'] }, 'and it does not throw');

            sst.deepEqual(
                qs.parse('a[1]=x&a[]=y&a[]=z', { arrayLimit: 2 }),
                { a: { 0: 'y', 1: 'x', 2: 'z' } },
                'more elements than arrayLimit still converts when the array has holes'
            );
            sst['throws'](
                function () { qs.parse('a[1]=x&a[]=y&a[]=z', { arrayLimit: 2, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 2 elements allowed in an array.'),
                'and throws with throwOnLimitExceeded'
            );

            sst.end();
        });

        st.test('enforces arrayLimit when a strictMerge conflict appends to its container', function (sst) {
            var aliased = 'a[z]=o&a=p&a[y]=q&[a]=r';
            sst['throws'](
                function () { qs.parse(aliased, { arrayLimit: 2, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 2 elements allowed in an array.'),
                'a third conflicting value throws once the container would exceed arrayLimit'
            );
            sst.deepEqual(
                qs.parse(aliased, { arrayLimit: 3, throwOnLimitExceeded: true }),
                { a: { 0: { z: 'o' }, 1: 'p', 2: 'r', y: 'q' } },
                'appends while the container stays within arrayLimit'
            );
            sst.deepEqual(
                qs.parse(aliased, { arrayLimit: 2 }),
                { a: { 0: { z: 'o' }, 1: 'p', 2: 'r', y: 'q' } },
                'appends without throwing when throwOnLimitExceeded is not set'
            );

            sst.end();
        });

        st.test('enforces arrayLimit when differently spelled keys collide', function (sst) {
            sst['throws'](
                function () { qs.parse('[a]=x&a=y', { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'two primitives throw, as `a=x&a=y` does'
            );
            sst['throws'](
                function () { qs.parse('a[b]=x&a=y', { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'an object and a primitive throw under strictMerge'
            );
            sst.deepEqual(
                qs.parse('[a]=x&a=y', { arrayLimit: 1 }),
                { a: { 0: 'x', 1: 'y' } },
                'without throwOnLimitExceeded, two primitives convert to an object, as `a=x&a=y` does'
            );
            sst.deepEqual(
                qs.parse('a[b]=x&a=y', { arrayLimit: 1 }),
                { a: { 0: { b: 'x' }, 1: 'y' } },
                'and so do an object and a primitive'
            );
            sst.deepEqual(
                qs.parse('a[b]=x&a=y', { arrayLimit: 2, throwOnLimitExceeded: true }),
                { a: [{ b: 'x' }, 'y'] },
                'a collision within arrayLimit is still an array'
            );

            sst.end();
        });

        st.test('does not throw when cumulative comma combine stays within arrayLimit', function (sst) {
            var result = qs.parse('a=1,2,3&a=4', { comma: true, arrayLimit: 5, throwOnLimitExceeded: true });
            sst.deepEqual(result, { a: ['1', '2', '3', '4'] }, 'combined array within limit is preserved');
            sst.end();
        });

        st.test('throws when a comma array at arrayLimit is combined with one more value', function (sst) {
            var error = new RangeError('Array limit exceeded. Only 2 elements allowed in an array.');
            sst['throws'](
                function () { qs.parse('a=x,y&a=z', { comma: true, arrayLimit: 2, throwOnLimitExceeded: true }); },
                error,
                'a plain value appended to a full comma array'
            );
            sst['throws'](
                function () { qs.parse('a=x&a=y,z', { comma: true, arrayLimit: 2, throwOnLimitExceeded: true }); },
                error,
                'a comma value appended to a plain value'
            );
            sst.end();
        });

        st.test('does not throw when a duplicate of a full comma array is discarded or replaces it', function (sst) {
            sst.deepEqual(
                qs.parse('a=x,y&a=z', { comma: true, arrayLimit: 2, throwOnLimitExceeded: true, duplicates: 'first' }),
                { a: ['x', 'y'] },
                'duplicates: first keeps the full array'
            );
            sst.deepEqual(
                qs.parse('a=x,y&a=z', { comma: true, arrayLimit: 2, throwOnLimitExceeded: true, duplicates: 'last' }),
                { a: 'z' },
                'duplicates: last replaces the full array'
            );
            sst.end();
        });

        st.test('silently combines to an overflow object when throwOnLimitExceeded is not set', function (sst) {
            var result = qs.parse('a=1,2,3&a=4,5,6', { comma: true, arrayLimit: 5 });
            sst.deepEqual(result, { a: { 0: '1', 1: '2', 2: '3', 3: '4', 4: '5', 5: '6' } }, 'converts to object without throwing');
            sst.end();
        });

        st.test('spreads a comma group appended to an already-overflowed object', function (sst) {
            var result = qs.parse('a=1,2,3,4,5,6&a=7,8', { comma: true, arrayLimit: 5 });
            sst.deepEqual(
                result,
                { a: { 0: '1', 1: '2', 2: '3', 3: '4', 4: '5', 5: '6', 6: '7', 7: '8' } },
                'appended comma values are flattened, not nested'
            );
            sst.end();
        });

        st.test('keeps a `[]=` comma group as one element when appended to an already-overflowed key', function (sst) {
            var result = qs.parse('a[]=1&a[]=2&a[]=3&a[]=4,5', { comma: true, arrayLimit: 2 });
            sst.deepEqual(
                result,
                { a: { 0: '1', 1: '2', 2: '3', 3: ['4', '5'] } },
                'nested comma group stays a single element, not double-nested'
            );
            sst.end();
        });

        st.test('spreads every later comma group appended to an already-overflowed object', function (sst) {
            var result = qs.parse('a=1,2,3,4,5,6&a=7,8&a=9,10', { comma: true, arrayLimit: 5 });
            sst.deepEqual(
                result,
                { a: { 0: '1', 1: '2', 2: '3', 3: '4', 4: '5', 5: '6', 6: '7', 7: '8', 8: '9', 9: '10' } },
                'each appended group is flattened in order'
            );
            sst.end();
        });

        st.test('spreads a comma group appended to an object overflowed under the default arrayLimit', function (sst) {
            var values = [];
            for (var i = 0; i <= 20; i += 1) {
                values[values.length] = String(i);
            }
            var expected = {};
            for (var j = 0; j < values.length; j += 1) {
                expected[j] = values[j];
            }
            expected[21] = 'x';
            expected[22] = 'y';

            var result = qs.parse('a=' + values.join(',') + '&a=x,y', { comma: true });
            sst.deepEqual(result, { a: expected }, 'appended values land at indices 21 and 22');
            sst.end();
        });

        st.test('spreads a comma group appended to an already-overflowed object with plainObjects', function (sst) {
            var result = qs.parse('a=1,2,3,4,5,6&a=7,8', { comma: true, arrayLimit: 5, plainObjects: true });
            sst.deepEqual(
                result,
                { __proto__: null, a: { __proto__: null, 0: '1', 1: '2', 2: '3', 3: '4', 4: '5', 5: '6', 6: '7', 7: '8' } },
                'appended comma values are flattened into the null object'
            );
            sst.end();
        });

        st.test('still throws with throwOnLimitExceeded when a comma group is appended to an already-overflowed object', function (sst) {
            sst['throws'](
                function () {
                    qs.parse('a=1,2,3,4,5,6&a=7,8', { comma: true, arrayLimit: 5, throwOnLimitExceeded: true });
                },
                /Array limit exceeded/,
                'throws before spreading the appended group'
            );
            sst.end();
        });
        st.test('does not throw for comma groups nested under bracket notation, counting each group as one element', function (sst) {
            var result = qs.parse('a[]=1,2,3&a[]=4,5,6', { comma: true, arrayLimit: 5, throwOnLimitExceeded: true });
            sst.deepEqual(result, { a: [['1', '2', '3'], ['4', '5', '6']] }, 'nested comma groups count as one element each');
            sst.end();
        });

        st.test('throws before splitting when a single comma value exceeds arrayLimit', function (sst) {
            sst['throws'](
                function () {
                    qs.parse('a=1,2,3,4,5,6', { comma: true, arrayLimit: 5, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 5 elements allowed in an array.'),
                'a flat comma value over the limit throws'
            );

            sst['throws'](
                function () {
                    qs.parse('a=1,2', { comma: true, arrayLimit: 1, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'singular message at arrayLimit 1'
            );

            sst['throws'](
                function () {
                    qs.parse('a[b]=1,2,3,4,5,6', { comma: true, arrayLimit: 5, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 5 elements allowed in an array.'),
                'a non-bracket nested key comma value over the limit throws'
            );
            sst.end();
        });

        st.test('does not throw for a single comma value within arrayLimit', function (sst) {
            sst.deepEqual(
                qs.parse('a=1,2,3', { comma: true, arrayLimit: 5, throwOnLimitExceeded: true }),
                { a: ['1', '2', '3'] },
                'within the limit'
            );
            sst.deepEqual(
                qs.parse('a=1,2,3,4,5', { comma: true, arrayLimit: 5, throwOnLimitExceeded: true }),
                { a: ['1', '2', '3', '4', '5'] },
                'exactly at the limit'
            );
            sst.end();
        });

        st.test('throws before splitting when a bracketed comma group exceeds arrayLimit', function (sst) {
            sst['throws'](
                function () {
                    qs.parse('a[]=1,2,3,4,5,6', { comma: true, arrayLimit: 5, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 5 elements allowed in an array.'),
                'the inner group is itself an array and is subject to arrayLimit'
            );
            sst.end();
        });

        st.test('throws before splitting when a comma group under `[]=` exceeds arrayLimit', function (sst) {
            sst['throws'](
                function () {
                    qs.parse('a[]=1,2,3,4', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
                'a bracket-push comma group over the limit throws like the flat form'
            );

            sst['throws'](
                function () {
                    qs.parse('a[]=1,2', { comma: true, arrayLimit: 1, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'singular message at arrayLimit 1'
            );

            sst['throws'](
                function () {
                    qs.parse('a[b][]=1,2,3,4', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
                'a nested bracket-push key throws'
            );

            sst['throws'](
                function () {
                    qs.parse('a[][]=1,2,3,4', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
                'a doubly bracket-pushed key throws'
            );

            sst['throws'](
                function () {
                    qs.parse('a[]=5&a[]=1,2,3,4', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
                'an oversized group appended after a scalar throws'
            );

            sst['throws'](
                function () {
                    qs.parse('a[]=1,2,3,4&a[]=5', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
                'an oversized group throws even when a later part would fit'
            );

            sst['throws'](
                function () {
                    qs.parse('a[]=1,2,3,4&a[]=5', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true, duplicates: 'first' });
                },
                new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
                'throws with duplicates: first'
            );

            sst['throws'](
                function () {
                    qs.parse('a[]=5&a[]=1,2,3,4', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true, duplicates: 'last' });
                },
                new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
                'throws with duplicates: last'
            );

            sst['throws'](
                function () {
                    qs.parse({ a: '1,2,3,4' }, { comma: true, arrayLimit: 3, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
                'an oversized comma value in object input throws'
            );

            var big = 'a[]=' + new Array(1e5 + 1).join('1,') + '1';
            sst['throws'](
                function () {
                    qs.parse(big, { comma: true, arrayLimit: 3, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
                'a very long bracket-push comma group throws'
            );
            sst.end();
        });

        st.test('does not throw for a comma group under `[]=` within arrayLimit', function (sst) {
            sst.deepEqual(
                qs.parse('a[]=1,2,3', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true }),
                { a: [['1', '2', '3']] },
                'an inner group exactly at the limit stays a single nested element'
            );
            sst.deepEqual(
                qs.parse('a[]=1,2,3&a[]=4,5,6&a[]=7', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true }),
                { a: [['1', '2', '3'], ['4', '5', '6'], '7'] },
                'each group counts as one element of the outer array'
            );
            sst.deepEqual(
                qs.parse('a[b][]=1,2,3', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true }),
                { a: { b: [['1', '2', '3']] } },
                'nested bracket-push key within the limit'
            );
            sst.deepEqual(
                qs.parse({ a: '1,2,3' }, { comma: true, arrayLimit: 3, throwOnLimitExceeded: true }),
                { a: ['1', '2', '3'] },
                'object input within the limit'
            );
            sst.end();
        });

        st.test('keeps an oversized comma group under `[]=` as a nested array without throwOnLimitExceeded', function (sst) {
            sst.deepEqual(
                qs.parse('a[]=1,2,3,4', { comma: true, arrayLimit: 3 }),
                { a: [['1', '2', '3', '4']] },
                'the inner group is not converted to an overflow object'
            );
            sst.end();
        });

        st.test('throws for a bracketed comma group when arrayLimit is 0', function (sst) {
            sst['throws'](
                function () {
                    qs.parse('a[]=1,2,3', { comma: true, arrayLimit: 0, throwOnLimitExceeded: true });
                },
                new RangeError('Array limit exceeded. Only 0 elements allowed in an array.'),
                'a single bracketed element still exceeds arrayLimit 0'
            );
            sst.end();
        });

        st.end();
    });

    t.end();
});

test('parses empty keys', function (t) {
    emptyTestCases.forEach(function (testCase) {
        t.test('skips empty string key with ' + testCase.input, function (st) {
            st.deepEqual(qs.parse(testCase.input), testCase.noEmptyKeys);

            st.end();
        });
    });
});

test('`duplicates` option', function (t) {
    v.nonStrings.concat('not a valid option').forEach(function (invalidOption) {
        if (typeof invalidOption !== 'undefined') {
            t['throws'](
                function () { qs.parse('', { duplicates: invalidOption }); },
                TypeError,
                'throws on invalid option: ' + inspect(invalidOption)
            );
        }
    });

    t.deepEqual(
        qs.parse('foo=bar&foo=baz'),
        { foo: ['bar', 'baz'] },
        'duplicates: default, combine'
    );

    t.deepEqual(
        qs.parse('foo=bar&foo=baz', { duplicates: 'combine' }),
        { foo: ['bar', 'baz'] },
        'duplicates: combine'
    );

    t.deepEqual(
        qs.parse('foo=bar&foo=baz', { duplicates: 'first' }),
        { foo: 'bar' },
        'duplicates: first'
    );

    t.deepEqual(
        qs.parse('foo=bar&foo=baz', { duplicates: 'last' }),
        { foo: 'baz' },
        'duplicates: last'
    );

    t.test('bracket notation always combines regardless of duplicates', function (st) {
        st.deepEqual(
            qs.parse('a=1&a=2&b[]=1&b[]=2', { duplicates: 'last' }),
            { a: '2', b: ['1', '2'] },
            'duplicates last: unbracketed takes last, bracketed combines'
        );

        st.deepEqual(
            qs.parse('b[]=1&b[]=2', { duplicates: 'last' }),
            { b: ['1', '2'] },
            'duplicates last: bracketed always combines'
        );

        st.deepEqual(
            qs.parse('b[]=1&b[]=2', { duplicates: 'first' }),
            { b: ['1', '2'] },
            'duplicates first: bracketed always combines'
        );

        st.deepEqual(
            qs.parse('a=1&a=2&b[]=1&b[]=2', { duplicates: 'first' }),
            { a: '1', b: ['1', '2'] },
            'duplicates first: unbracketed takes first, bracketed combines'
        );

        st.end();
    });

    t.test('`[]=` in a value does not force combining', function (st) {
        st.deepEqual(
            qs.parse('a[b]=1&a[b]=2[]=3', { duplicates: 'last' }),
            { a: { b: '2[]=3' } },
            'duplicates last: `[]=` in the value is not a bracketed key'
        );

        st.deepEqual(
            qs.parse('a[b]=1&a[b]=2[]=3', { duplicates: 'first' }),
            { a: { b: '1' } },
            'duplicates first: `[]=` in the value is not a bracketed key'
        );

        st.deepEqual(
            qs.parse('a[b]=1&a[b]=2[]=3', { duplicates: 'combine' }),
            { a: { b: ['1', '2[]=3'] } },
            'duplicates combine: still combines'
        );

        st.end();
    });

    t.end();
});

test('qs strictDepth option - throw cases', function (t) {
    t.test('throws an exception when depth exceeds the limit with strictDepth: true', function (st) {
        st['throws'](
            function () {
                qs.parse('a[b][c][d][e][f][g][h][i]=j', { depth: 1, strictDepth: true });
            },
            RangeError,
            'throws RangeError'
        );
        st.end();
    });

    t.test('throws an exception for multiple nested arrays with strictDepth: true', function (st) {
        st['throws'](
            function () {
                qs.parse('a[0][1][2][3][4]=b', { depth: 3, strictDepth: true });
            },
            RangeError,
            'throws RangeError'
        );
        st.end();
    });

    t.test('throws an exception for nested objects and arrays with strictDepth: true', function (st) {
        st['throws'](
            function () {
                qs.parse('a[b][c][0][d][e]=f', { depth: 3, strictDepth: true });
            },
            RangeError,
            'throws RangeError'
        );
        st.end();
    });

    t.test('throws an exception for different types of values with strictDepth: true', function (st) {
        st['throws'](
            function () {
                qs.parse('a[b][c][d][e]=true&a[b][c][d][f]=42', { depth: 3, strictDepth: true });
            },
            RangeError,
            'throws RangeError'
        );
        st.end();
    });

});

test('qs strictDepth option - non-throw cases', function (t) {
    t.test('when depth is 0 and strictDepth true, do not throw', function (st) {
        st.doesNotThrow(
            function () {
                qs.parse('a[b][c][d][e]=true&a[b][c][d][f]=42', { depth: 0, strictDepth: true });
            },
            RangeError,
            'does not throw RangeError'
        );
        st.end();
    });

    t.test('parses successfully when depth is within the limit with strictDepth: true', function (st) {
        st.doesNotThrow(
            function () {
                var result = qs.parse('a[b]=c', { depth: 1, strictDepth: true });
                st.deepEqual(result, { a: { b: 'c' } }, 'parses correctly');
            }
        );
        st.end();
    });

    t.test('does not throw an exception when depth exceeds the limit with strictDepth: false', function (st) {
        st.doesNotThrow(
            function () {
                var result = qs.parse('a[b][c][d][e][f][g][h][i]=j', { depth: 1 });
                st.deepEqual(result, { a: { b: { '[c][d][e][f][g][h][i]': 'j' } } }, 'parses with depth limit');
            }
        );
        st.end();
    });

    t.test('parses successfully when depth is within the limit with strictDepth: false', function (st) {
        st.doesNotThrow(
            function () {
                var result = qs.parse('a[b]=c', { depth: 1 });
                st.deepEqual(result, { a: { b: 'c' } }, 'parses correctly');
            }
        );
        st.end();
    });

    t.test('does not throw when depth is exactly at the limit with strictDepth: true', function (st) {
        st.doesNotThrow(
            function () {
                var result = qs.parse('a[b][c]=d', { depth: 2, strictDepth: true });
                st.deepEqual(result, { a: { b: { c: 'd' } } }, 'parses correctly');
            }
        );
        st.end();
    });
});

test('DOS', function (t) {
    var arr = [];
    for (var i = 0; i < 105; i++) {
        arr[arr.length] = 'x';
    }
    var attack = 'a[]=' + arr.join('&a[]=');
    var result = qs.parse(attack, { arrayLimit: 100 });

    t.notOk(Array.isArray(result.a), 'arrayLimit is respected: result is an object, not an array');
    t.equal(Object.keys(result.a).length, 105, 'all values are preserved');

    t.end();
});

test('arrayLimit boundary conditions', function (t) {
    // arrayLimit is the max number of elements allowed in an array
    t.test('exactly at the limit stays as array', function (st) {
        // 3 elements = limit of 3
        var result = qs.parse('a[]=1&a[]=2&a[]=3', { arrayLimit: 3 });
        st.ok(Array.isArray(result.a), 'result is an array when count equals limit');
        st.deepEqual(result.a, ['1', '2', '3'], 'all values present');
        st.end();
    });

    t.test('one over the limit converts to object', function (st) {
        // 4 elements exceeds limit of 3
        var result = qs.parse('a[]=1&a[]=2&a[]=3&a[]=4', { arrayLimit: 3 });
        st.notOk(Array.isArray(result.a), 'result is not an array when over limit');
        st.deepEqual(result.a, { 0: '1', 1: '2', 2: '3', 3: '4' }, 'all values preserved as object');
        st.end();
    });

    t.test('arrayLimit 1 with one value', function (st) {
        // 1 element = limit of 1
        var result = qs.parse('a[]=1', { arrayLimit: 1 });
        st.ok(Array.isArray(result.a), 'result is an array when count equals limit');
        st.deepEqual(result.a, ['1'], 'value preserved as array');
        st.end();
    });

    t.test('arrayLimit 1 with two values converts to object', function (st) {
        // 2 elements exceeds limit of 1
        var result = qs.parse('a[]=1&a[]=2', { arrayLimit: 1 });
        st.notOk(Array.isArray(result.a), 'result is not an array');
        st.deepEqual(result.a, { 0: '1', 1: '2' }, 'all values preserved as object');
        st.end();
    });

    t.end();
});

test('comma + arrayLimit', function (t) {
    t.test('comma-separated values within arrayLimit stay as array', function (st) {
        var result = qs.parse('a=1,2,3', { comma: true, arrayLimit: 5 });
        st.ok(Array.isArray(result.a), 'result is an array');
        st.deepEqual(result.a, ['1', '2', '3'], 'all values present');
        st.end();
    });

    t.test('comma-separated values exceeding arrayLimit convert to object', function (st) {
        var result = qs.parse('a=1,2,3,4', { comma: true, arrayLimit: 3 });
        st.notOk(Array.isArray(result.a), 'result is not an array when over limit');
        st.deepEqual(result.a, { 0: '1', 1: '2', 2: '3', 3: '4' }, 'all values preserved as object');
        st.end();
    });

    t.test('comma-separated values exceeding arrayLimit with throwOnLimitExceeded throws', function (st) {
        st['throws'](
            function () {
                qs.parse('a=1,2,3,4', { comma: true, arrayLimit: 3, throwOnLimitExceeded: true });
            },
            new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
            'throws error when comma-split exceeds array limit'
        );

        st['throws'](
            function () {
                qs.parse('a=1,2,3', { comma: true, arrayLimit: 1, throwOnLimitExceeded: true });
            },
            new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
            'throws error with singular "element" when arrayLimit is 1'
        );
        st.end();
    });

    t.test('comma-separated values at exactly arrayLimit stay as array', function (st) {
        var result = qs.parse('a=1,2,3', { comma: true, arrayLimit: 3 });
        st.ok(Array.isArray(result.a), 'result is an array when exactly at limit');
        st.deepEqual(result.a, ['1', '2', '3'], 'all values present');
        st.end();
    });

    t.end();
});

test('mixed array and object notation', function (t) {
    t.test('array brackets with object key - under limit', function (st) {
        st.deepEqual(
            qs.parse('a[]=b&a[c]=d'),
            { a: { 0: 'b', c: 'd' } },
            'mixing [] and [key] converts to object'
        );
        st.end();
    });

    t.test('array index with object key - under limit', function (st) {
        st.deepEqual(
            qs.parse('a[0]=b&a[c]=d'),
            { a: { 0: 'b', c: 'd' } },
            'mixing [0] and [key] produces object'
        );
        st.end();
    });

    t.test('plain value with array brackets - under limit', function (st) {
        st.deepEqual(
            qs.parse('a=b&a[]=c', { arrayLimit: 20 }),
            { a: ['b', 'c'] },
            'plain value combined with [] stays as array under limit'
        );
        st.end();
    });

    t.test('array brackets with plain value - under limit', function (st) {
        st.deepEqual(
            qs.parse('a[]=b&a=c', { arrayLimit: 20 }),
            { a: ['b', 'c'] },
            '[] combined with plain value stays as array under limit'
        );
        st.end();
    });

    t.test('plain value with array index - under limit', function (st) {
        st.deepEqual(
            qs.parse('a=b&a[0]=c', { arrayLimit: 20 }),
            { a: ['b', 'c'] },
            'plain value combined with [0] stays as array under limit'
        );
        st.end();
    });

    t.test('multiple plain values with duplicates combine', function (st) {
        st.deepEqual(
            qs.parse('a=b&a=c&a=d', { arrayLimit: 20 }),
            { a: ['b', 'c', 'd'] },
            'duplicate plain keys combine into array'
        );
        st.end();
    });

    t.test('multiple plain values exceeding limit', function (st) {
        // 3 elements (indices 0-2), max index 2 > limit 1
        st.deepEqual(
            qs.parse('a=b&a=c&a=d', { arrayLimit: 1 }),
            { a: { 0: 'b', 1: 'c', 2: 'd' } },
            'duplicate plain keys convert to object when exceeding limit'
        );
        st.end();
    });

    t.test('mixed notation produces consistent results when arrayLimit is exceeded', function (st) {
        var expected = { a: { 0: 'b', 1: 'c', 2: 'd' } };

        st.deepEqual(
            qs.parse('a[]=b&a[1]=c&a=d', { arrayLimit: -1 }),
            expected,
            'arrayLimit -1'
        );

        st.deepEqual(
            qs.parse('a[]=b&a[1]=c&a=d', { arrayLimit: 0 }),
            expected,
            'arrayLimit 0'
        );

        st.deepEqual(
            qs.parse('a[]=b&a[1]=c&a=d', { arrayLimit: 1 }),
            expected,
            'arrayLimit 1'
        );

        st.end();
    });

    t.test('uses existing array length for currentArrayLength when parsing object input with bracket keys', function (st) {
        var input = {};
        var arr = ['x', 'y'];
        arr.a = ['z', 'w'];
        input['a[]'] = arr;
        st.deepEqual(qs.parse(input), { a: ['x', 'y'] }, 'parses object input with bracket keys using existing array values');
        st.end();
    });

    t.test('throws with singular message when object input bracket key exceeds arrayLimit of 1', function (st) {
        var input = {};
        var arr = ['x'];
        arr.a = ['z', 'w'];
        input['a[]'] = arr;
        st['throws'](
            function () {
                qs.parse(input, { throwOnLimitExceeded: true, arrayLimit: 1 });
            },
            new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
            'throws singular error for object input exceeding arrayLimit 1'
        );
        st.end();
    });

    t.end();
});
