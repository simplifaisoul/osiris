'use strict';

var test = require('tape');
var inspect = require('object-inspect');
var SaferBuffer = require('safer-buffer').Buffer;
var forEach = require('for-each');
var v = require('es-value-fixtures');

var utils = require('../lib/utils');

test('merge()', function (t) {
    t.deepEqual(utils.merge(null, true), [null, true], 'merges true into null');

    t.deepEqual(utils.merge(null, [42]), [null, 42], 'merges null into an array');

    t.deepEqual(utils.merge({ a: 'b' }, { a: 'c' }), { a: ['b', 'c'] }, 'merges two objects with the same key');

    var oneMerged = utils.merge({ foo: 'bar' }, { foo: { first: '123' } });
    t.deepEqual(oneMerged, { foo: ['bar', { first: '123' }] }, 'merges a standalone and an object into an array');

    var twoMerged = utils.merge({ foo: ['bar', { first: '123' }] }, { foo: { second: '456' } });
    t.deepEqual(twoMerged, { foo: { 0: 'bar', 1: { first: '123' }, second: '456' } }, 'merges a standalone and two objects into an array');

    var sandwiched = utils.merge({ foo: ['bar', { first: '123', second: '456' }] }, { foo: 'baz' });
    t.deepEqual(sandwiched, { foo: ['bar', { first: '123', second: '456' }, 'baz'] }, 'merges an object sandwiched by two standalones into an array');

    var nestedArrays = utils.merge({ foo: ['baz'] }, { foo: ['bar', 'xyzzy'] });
    t.deepEqual(nestedArrays, { foo: ['baz', 'bar', 'xyzzy'] });

    var noOptionsNonObjectSource = utils.merge({ foo: 'baz' }, 'bar');
    t.deepEqual(noOptionsNonObjectSource, { foo: 'baz', bar: true });

    var func = function f() {};
    func();
    t.deepEqual(
        utils.merge(func, { foo: 'bar' }),
        [func, { foo: 'bar' }],
        'functions can not be merged into'
    );

    func.bar = 'baz';
    t.deepEqual(
        utils.merge({ foo: 'bar' }, func),
        { foo: 'bar', bar: 'baz' },
        'functions can be merge sources'
    );

    t.test(
        'avoids invoking array setters unnecessarily',
        { skip: typeof Object.defineProperty !== 'function' },
        function (st) {
            var setCount = 0;
            var getCount = 0;
            var observed = [];
            Object.defineProperty(observed, 0, {
                get: function () {
                    getCount += 1;
                    return { bar: 'baz' };
                },
                set: function () { setCount += 1; }
            });
            utils.merge(observed, [null]);
            st.equal(setCount, 0);
            st.equal(getCount, 1);
            observed[0] = observed[0]; // eslint-disable-line no-self-assign
            st.equal(setCount, 1);
            st.equal(getCount, 2);

            st.end();
        }
    );

    t.test('with overflow objects (from arrayLimit)', function (st) {
        // arrayLimit is max index, so with limit 0, max index 0 is allowed (1 element)
        // To create overflow, need 2+ elements with limit 0, or 3+ with limit 1, etc.
        st.test('merges primitive into overflow object at next index', function (s2t) {
            // Create an overflow object via combine: 3 elements (indices 0-2) with limit 0
            var overflow = utils.combine(['a', 'b'], 'c', 0, false);
            s2t.ok(utils.isOverflow(overflow), 'overflow object is marked');
            var merged = utils.merge(overflow, 'd');
            s2t.deepEqual(merged, { 0: 'a', 1: 'b', 2: 'c', 3: 'd' }, 'adds primitive at next numeric index');

            s2t.end();
        });

        st.test('merges primitive into regular object with numeric keys normally', function (s2t) {
            var obj = { 0: 'a', 1: 'b' };
            s2t.notOk(utils.isOverflow(obj), 'plain object is not marked as overflow');
            var merged = utils.merge(obj, 'c');
            s2t.deepEqual(merged, { 0: 'a', 1: 'b', c: true }, 'adds primitive as key (not at next index)');
            s2t.end();
        });

        st.test('merges primitive into object with non-numeric keys normally', function (s2t) {
            var obj = { foo: 'bar' };
            var merged = utils.merge(obj, 'baz');
            s2t.deepEqual(merged, { foo: 'bar', baz: true }, 'adds primitive as key with value true');

            s2t.end();
        });

        st.test('with strictMerge, wraps object and primitive in array', function (s2t) {
            var obj = { foo: 'bar' };
            var merged = utils.merge(obj, 'baz', { strictMerge: true });
            s2t.deepEqual(merged, [{ foo: 'bar' }, 'baz'], 'wraps in array with strictMerge');
            s2t.end();
        });

        st.test('with strictMerge, repeated conflicts append instead of nesting a new wrapper', function (s2t) {
            var opts = { strictMerge: true };
            var wrapped = utils.merge({ foo: 'bar' }, 'baz', opts);
            s2t.deepEqual(wrapped, [{ foo: 'bar' }, 'baz'], 'first conflict wraps in an array');

            var withObject = utils.merge(wrapped, { qux: 'quux' }, opts);
            s2t.deepEqual(
                withObject,
                { 0: { foo: 'bar' }, 1: 'baz', qux: 'quux' },
                'merging an object converts the wrapper to an object'
            );

            var second = utils.merge(withObject, 'corge', opts);
            s2t.deepEqual(
                second,
                { 0: { foo: 'bar' }, 1: 'baz', 2: 'corge', qux: 'quux' },
                'a second conflict appends at the next index'
            );

            var third = utils.merge(second, 'grault', opts);
            s2t.deepEqual(
                third,
                { 0: { foo: 'bar' }, 1: 'baz', 2: 'corge', 3: 'grault', qux: 'quux' },
                'a third conflict appends again, so nesting depth stays constant'
            );

            s2t.end();
        });

        st.test('with strictMerge, a caller-supplied array is still wrapped, not appended to', function (s2t) {
            var merged = utils.merge({ 0: 'a', 1: 'b' }, 'c', { strictMerge: true });
            s2t.deepEqual(merged, [{ 0: 'a', 1: 'b' }, 'c'], 'an unmarked object with numeric keys is wrapped');
            s2t.end();
        });

        st.test('with strictMerge, throws instead of appending a conflict past arrayLimit with throwOnLimitExceeded', function (s2t) {
            var appendConflict = function (options) {
                var wrapped = utils.merge({ foo: 'bar' }, 'baz', { strictMerge: true });
                var container = utils.merge(wrapped, { qux: 'quux' }, { strictMerge: true });
                return utils.merge(container, 'corge', options);
            };

            s2t['throws'](
                function () { appendConflict({ strictMerge: true, arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'appending to a two-element container past arrayLimit throws'
            );
            s2t['throws'](
                function () { appendConflict({ strictMerge: true, arrayLimit: 2, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 2 elements allowed in an array.'),
                'uses the plural message when arrayLimit is not 1'
            );
            s2t.deepEqual(
                appendConflict({ strictMerge: true, arrayLimit: 3, throwOnLimitExceeded: true }),
                { 0: { foo: 'bar' }, 1: 'baz', 2: 'corge', qux: 'quux' },
                'appends while the container stays within arrayLimit'
            );
            s2t.deepEqual(
                appendConflict({ strictMerge: true, arrayLimit: 1 }),
                { 0: { foo: 'bar' }, 1: 'baz', 2: 'corge', qux: 'quux' },
                'still appends past arrayLimit without throwOnLimitExceeded, since the container is already an object'
            );

            s2t.end();
        });

        st.test('with strictMerge, a conflict appends after numeric keys already in its container', function (s2t) {
            var opts = { strictMerge: true };

            var container = utils.merge(utils.merge({ foo: 'bar' }, 'baz', opts), { qux: 'quux' }, opts);
            var withIndex = utils.merge(container, { 2: 'keep' }, opts);
            s2t.deepEqual(
                utils.merge(withIndex, 'corge', opts),
                { 0: { foo: 'bar' }, 1: 'baz', 2: 'keep', 3: 'corge', qux: 'quux' },
                'a numeric key merged into the container is not overwritten'
            );

            var sparse = [];
            sparse[2] = 'keep';
            var extended = utils.merge(utils.merge({ foo: 'bar' }, 'baz', opts), sparse, opts);
            s2t.deepEqual(extended, [{ foo: 'bar' }, 'baz', 'keep'], 'an indexed value extends the container while it is an array');
            var converted = utils.merge(extended, { qux: 'quux' }, opts);
            s2t.deepEqual(
                utils.merge(converted, 'corge', opts),
                { 0: { foo: 'bar' }, 1: 'baz', 2: 'keep', 3: 'corge', qux: 'quux' },
                'converting the container to an object keeps its last index'
            );

            s2t.end();
        });

        st.test('enforces arrayLimit on the two-element array built for colliding values', function (s2t) {
            s2t['throws'](
                function () { utils.merge({ foo: 'bar' }, 'baz', { strictMerge: true, arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'a strictMerge conflict throws at arrayLimit 1'
            );
            s2t['throws'](
                function () { utils.merge('a', 'b', { arrayLimit: 0, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 0 elements allowed in an array.'),
                'two colliding primitives throw at arrayLimit 0'
            );

            var conflict = utils.merge({ foo: 'bar' }, 'baz', { strictMerge: true, arrayLimit: 1 });
            s2t.ok(utils.isOverflow(conflict), 'without throwOnLimitExceeded, a strictMerge conflict converts to an overflow object');
            s2t.deepEqual(conflict, { 0: { foo: 'bar' }, 1: 'baz' }, 'holding both values');

            var pair = utils.merge('a', 'b', { arrayLimit: 1 });
            s2t.ok(utils.isOverflow(pair), 'without throwOnLimitExceeded, two colliding primitives convert to an overflow object');
            s2t.deepEqual(pair, { 0: 'a', 1: 'b' }, 'holding both values');

            s2t.deepEqual(
                utils.merge({ foo: 'bar' }, 'baz', { strictMerge: true, arrayLimit: 2, throwOnLimitExceeded: true }),
                [{ foo: 'bar' }, 'baz'],
                'a strictMerge conflict within arrayLimit is still an array'
            );
            s2t.deepEqual(
                utils.merge('a', 'b', { arrayLimit: 2, throwOnLimitExceeded: true }),
                ['a', 'b'],
                'two colliding primitives within arrayLimit are still an array'
            );

            s2t.end();
        });

        st.test('seeds an overflow container index from the keys it already holds', function (s2t) {
            var overflow = utils.combine(['a'], 'b', 0, false);
            s2t.ok(utils.isOverflow(overflow), 'the source is an overflow object');

            var merged = utils.merge({ 2: 'keep', z: 'zz' }, overflow);
            s2t.ok(utils.isOverflow(merged), 'the result is marked as overflow');
            s2t.deepEqual(
                utils.merge(merged, 'c'),
                { 0: 'a', 1: 'b', 2: 'keep', 3: 'c', z: 'zz' },
                'the next value lands after the highest numeric key the container already held'
            );

            s2t.end();
        });

        st.test('merges overflow object into primitive', function (s2t) {
            // Create an overflow object via combine: 2 elements (indices 0-1) with limit 0
            var overflow = utils.combine(['a'], 'b', 0, false);
            s2t.ok(utils.isOverflow(overflow), 'overflow object is marked');
            var merged = utils.merge('c', overflow);
            s2t.ok(utils.isOverflow(merged), 'result is also marked as overflow');
            s2t.deepEqual(merged, { 0: 'c', 1: 'a', 2: 'b' }, 'creates object with primitive at 0, source values shifted');

            s2t.end();
        });

        st.test('merges overflow object into primitive with plainObjects', function (s2t) {
            var overflow = utils.combine(['a'], 'b', 0, false);
            s2t.ok(utils.isOverflow(overflow), 'overflow object is marked');
            var merged = utils.merge('c', overflow, { plainObjects: true });
            s2t.ok(utils.isOverflow(merged), 'result is also marked as overflow');
            s2t.deepEqual(merged, { __proto__: null, 0: 'c', 1: 'a', 2: 'b' }, 'creates null-proto object with primitive at 0');

            s2t.end();
        });

        st.test('merges overflow object with multiple values into primitive', function (s2t) {
            // Create an overflow object via combine: 3 elements (indices 0-2) with limit 0
            var overflow = utils.combine(['b', 'c'], 'd', 0, false);
            s2t.ok(utils.isOverflow(overflow), 'overflow object is marked');
            var merged = utils.merge('a', overflow);
            s2t.deepEqual(merged, { 0: 'a', 1: 'b', 2: 'c', 3: 'd' }, 'shifts all source indices by 1');

            s2t.end();
        });

        st.test('merges regular object into primitive as array', function (s2t) {
            var obj = { foo: 'bar' };
            var merged = utils.merge('a', obj);
            s2t.deepEqual(merged, ['a', { foo: 'bar' }], 'creates array with primitive and object');

            s2t.end();
        });

        st.test('merges primitive into array that exceeds arrayLimit', function (s2t) {
            var arr = ['a', 'b', 'c'];
            var merged = utils.merge(arr, 'd', { arrayLimit: 1 });
            s2t.ok(utils.isOverflow(merged), 'result is marked as overflow');
            s2t.deepEqual(merged, { 0: 'a', 1: 'b', 2: 'c', 3: 'd' }, 'converts to overflow object with primitive appended');

            s2t.end();
        });

        st.test('merges array into primitive that exceeds arrayLimit', function (s2t) {
            var merged = utils.merge('a', ['b', 'c'], { arrayLimit: 1 });
            s2t.ok(utils.isOverflow(merged), 'result is marked as overflow');
            s2t.deepEqual(merged, { 0: 'a', 1: 'b', 2: 'c' }, 'converts to overflow object');

            s2t.end();
        });

        st.test('merges primitive into array at the arrayLimit boundary, consistently with combine', function (s2t) {
            var merged = utils.merge(['a'], 'b', { arrayLimit: 1 });
            s2t.ok(utils.isOverflow(merged), 'result is marked as overflow at the boundary');
            s2t.deepEqual(merged, { 0: 'a', 1: 'b' }, 'converts to overflow object instead of a length-2 array');

            s2t.end();
        });

        st.test('merges two arrays that exceed arrayLimit into an overflow object', function (s2t) {
            var merged = utils.merge(['a'], ['b'], { arrayLimit: 1 });
            s2t.ok(utils.isOverflow(merged), 'result is marked as overflow');
            s2t.deepEqual(merged, { 0: 'a', 1: 'b' }, 'array-into-array merge enforces arrayLimit like combine');

            s2t.end();
        });

        st.test('throws at the arrayLimit boundary when merging a primitive into an array with throwOnLimitExceeded', function (s2t) {
            s2t['throws'](
                function () { utils.merge(['a'], 'b', { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'throws when the resulting length would exceed arrayLimit'
            );

            s2t.end();
        });

        st.test('throws when merging two arrays past arrayLimit with throwOnLimitExceeded', function (s2t) {
            s2t['throws'](
                function () { utils.merge(['a'], ['b'], { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'array-into-array merge throws rather than silently exceeding arrayLimit'
            );
            s2t['throws'](
                function () { utils.merge(['a', 'b', 'c'], ['d', 'e', 'f'], { arrayLimit: 2, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 2 elements allowed in an array.'),
                'uses the plural message when arrayLimit is not 1'
            );

            s2t.end();
        });

        st.test('throws instead of merging primitive into over-limit array when throwOnLimitExceeded is set', function (s2t) {
            s2t['throws'](
                function () { utils.merge(['a', 'b', 'c'], 'd', { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'throws rather than converting to an overflow object'
            );
            s2t['throws'](
                function () { utils.merge(['a', 'b', 'c'], 'd', { arrayLimit: 2, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 2 elements allowed in an array.'),
                'uses the plural message when arrayLimit is not 1'
            );

            s2t.end();
        });

        st.test('throws instead of merging array into primitive when throwOnLimitExceeded is set', function (s2t) {
            s2t['throws'](
                function () { utils.merge('a', ['b', 'c'], { arrayLimit: 1, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'throws rather than converting to an overflow object'
            );
            s2t['throws'](
                function () { utils.merge('a', ['b', 'c', 'd'], { arrayLimit: 2, throwOnLimitExceeded: true }); },
                new RangeError('Array limit exceeded. Only 2 elements allowed in an array.'),
                'uses the plural message when arrayLimit is not 1'
            );

            s2t.end();
        });

        st.end();
    });

    t.end();
});

test('assign()', function (t) {
    var target = { a: 1, b: 2 };
    var source = { b: 3, c: 4 };
    var result = utils.assign(target, source);

    t.equal(result, target, 'returns the target');
    t.deepEqual(target, { a: 1, b: 3, c: 4 }, 'target and source are merged');
    t.deepEqual(source, { b: 3, c: 4 }, 'source is untouched');

    t.end();
});

test('combine()', function (t) {
    t.test('both arrays', function (st) {
        var a = [1];
        var b = [2];
        var combined = utils.combine(a, b);

        st.deepEqual(a, [1], 'a is not mutated');
        st.deepEqual(b, [2], 'b is not mutated');
        st.notEqual(a, combined, 'a !== combined');
        st.notEqual(b, combined, 'b !== combined');
        st.deepEqual(combined, [1, 2], 'combined is a + b');

        st.end();
    });

    t.test('one array, one non-array', function (st) {
        var aN = 1;
        var a = [aN];
        var bN = 2;
        var b = [bN];

        var combinedAnB = utils.combine(aN, b);
        st.deepEqual(b, [bN], 'b is not mutated');
        st.notEqual(aN, combinedAnB, 'aN + b !== aN');
        st.notEqual(a, combinedAnB, 'aN + b !== a');
        st.notEqual(bN, combinedAnB, 'aN + b !== bN');
        st.notEqual(b, combinedAnB, 'aN + b !== b');
        st.deepEqual([1, 2], combinedAnB, 'first argument is array-wrapped when not an array');

        var combinedABn = utils.combine(a, bN);
        st.deepEqual(a, [aN], 'a is not mutated');
        st.notEqual(aN, combinedABn, 'a + bN !== aN');
        st.notEqual(a, combinedABn, 'a + bN !== a');
        st.notEqual(bN, combinedABn, 'a + bN !== bN');
        st.notEqual(b, combinedABn, 'a + bN !== b');
        st.deepEqual([1, 2], combinedABn, 'second argument is array-wrapped when not an array');

        st.end();
    });

    t.test('neither is an array', function (st) {
        var combined = utils.combine(1, 2);
        st.notEqual(1, combined, '1 + 2 !== 1');
        st.notEqual(2, combined, '1 + 2 !== 2');
        st.deepEqual([1, 2], combined, 'both arguments are array-wrapped when not an array');

        st.end();
    });

    t.test('with arrayLimit', function (st) {
        st.test('under the limit', function (s2t) {
            var combined = utils.combine(['a', 'b'], 'c', 10, false);
            s2t.deepEqual(combined, ['a', 'b', 'c'], 'returns array when under limit');
            s2t.ok(Array.isArray(combined), 'result is an array');
            s2t.end();
        });

        st.test('exactly at the limit stays as array', function (s2t) {
            var combined = utils.combine(['a', 'b'], 'c', 3, false);
            s2t.deepEqual(combined, ['a', 'b', 'c'], 'stays as array when count equals limit');
            s2t.ok(Array.isArray(combined), 'result is an array');
            s2t.end();
        });

        st.test('over the limit', function (s2t) {
            var combined = utils.combine(['a', 'b', 'c'], 'd', 3, false);
            s2t.deepEqual(combined, { 0: 'a', 1: 'b', 2: 'c', 3: 'd' }, 'converts to object when over limit');
            s2t.notOk(Array.isArray(combined), 'result is not an array');
            s2t.end();
        });

        st.test('with arrayLimit 1', function (s2t) {
            var combined = utils.combine([], 'a', 1, false);
            s2t.deepEqual(combined, ['a'], 'stays as array when count equals limit');
            s2t.ok(Array.isArray(combined), 'result is an array');
            s2t.end();
        });

        st.test('with arrayLimit 0 converts single element to object', function (s2t) {
            var combined = utils.combine([], 'a', 0, false);
            s2t.deepEqual(combined, { 0: 'a' }, 'converts to object when count exceeds limit');
            s2t.notOk(Array.isArray(combined), 'result is not an array');
            s2t.end();
        });

        st.test('with arrayLimit 0 and two elements converts to object', function (s2t) {
            var combined = utils.combine(['a'], 'b', 0, false);
            s2t.deepEqual(combined, { 0: 'a', 1: 'b' }, 'converts to object when count exceeds limit');
            s2t.notOk(Array.isArray(combined), 'result is not an array');
            s2t.end();
        });

        st.test('with plainObjects option', function (s2t) {
            var combined = utils.combine(['a', 'b'], 'c', 1, true);
            var expected = { __proto__: null, 0: 'a', 1: 'b', 2: 'c' };
            s2t.deepEqual(combined, expected, 'converts to object with null prototype');
            s2t.equal(Object.getPrototypeOf(combined), null, 'result has null prototype when plainObjects is true');
            s2t.end();
        });

        st.end();
    });

    t.test('with throwOnLimitExceeded', function (st) {
        st.test('throws when concatenation exceeds the limit', function (s2t) {
            s2t['throws'](
                function () { utils.combine(['a', 'b', 'c'], 'd', 3, false, true); },
                new RangeError('Array limit exceeded. Only 3 elements allowed in an array.'),
                'throws instead of converting to an overflow object'
            );
            s2t['throws'](
                function () { utils.combine([], 'a', 0, false, true); },
                new RangeError('Array limit exceeded. Only 0 elements allowed in an array.'),
                'throws with the correct count at arrayLimit 0'
            );
            s2t.end();
        });

        st.test('throws when adding to an existing overflow object', function (s2t) {
            var overflow = utils.combine(['a', 'b'], 'c', 0, false);
            s2t.ok(utils.isOverflow(overflow), 'initial object is marked as overflow');

            s2t['throws'](
                function () { utils.combine(overflow, 'd', 0, false, true); },
                new RangeError('Array limit exceeded. Only 0 elements allowed in an array.'),
                'throws rather than appending to the overflow object'
            );
            s2t['throws'](
                function () { utils.combine(overflow, 'd', 1, false, true); },
                new RangeError('Array limit exceeded. Only 1 element allowed in an array.'),
                'uses the singular message at arrayLimit 1'
            );
            s2t.end();
        });

        st.test('does not throw when within the limit', function (s2t) {
            var combined = utils.combine(['a'], 'b', 5, false, true);
            s2t.deepEqual(combined, ['a', 'b'], 'returns the array unchanged when under the limit');
            s2t.end();
        });

        st.end();
    });

    t.test('with existing overflow object', function (st) {
        st.test('adds to existing overflow object at next index', function (s2t) {
            // Create overflow object first via combine: 3 elements (indices 0-2) with limit 0
            var overflow = utils.combine(['a', 'b'], 'c', 0, false);
            s2t.ok(utils.isOverflow(overflow), 'initial object is marked as overflow');

            var combined = utils.combine(overflow, 'd', 10, false);
            s2t.equal(combined, overflow, 'returns the same object (mutated)');
            s2t.deepEqual(combined, { 0: 'a', 1: 'b', 2: 'c', 3: 'd' }, 'adds value at next numeric index');
            s2t.end();
        });

        st.test('does not treat plain object with numeric keys as overflow', function (s2t) {
            var plainObj = { 0: 'a', 1: 'b' };
            s2t.notOk(utils.isOverflow(plainObj), 'plain object is not marked as overflow');

            // combine treats this as a regular value, not an overflow object to append to
            var combined = utils.combine(plainObj, 'c', 10, false);
            s2t.deepEqual(combined, [{ 0: 'a', 1: 'b' }, 'c'], 'concatenates as regular values');
            s2t.end();
        });

        st.end();
    });

    t.end();
});

test('decode', function (t) {
    t.equal(
        utils.decode('a+b'),
        'a b',
        'decodes + to space'
    );

    t.equal(
        utils.decode('name%2Eobj'),
        'name.obj',
        'decodes a string'
    );
    t.equal(
        utils.decode('name%2Eobj%2Efoo', null, 'iso-8859-1'),
        'name.obj.foo',
        'decodes a string in iso-8859-1'
    );

    t.test('strings with no percent sign', function (st) {
        st.equal(utils.decode(''), '', 'empty string');
        st.equal(utils.decode('abc'), 'abc', 'returns a plain string unchanged');
        st.equal(utils.decode('abc', null, 'iso-8859-1'), 'abc', 'returns a plain string unchanged in iso-8859-1');
        st.equal(utils.decode('a++b+'), 'a  b ', 'decodes every + to a space');
        st.equal(utils.decode('a++b+', null, 'iso-8859-1'), 'a  b ', 'decodes every + to a space in iso-8859-1');
        st.equal(utils.decode('\uD800x\uDC00'), '\uD800x\uDC00', 'leaves lone surrogates unchanged');
        st.equal(utils.decode('😀+'), '😀 ', 'leaves surrogate pairs unchanged');
        st.equal(utils.decode('a=b&c'), 'a=b&c', 'leaves delimiters unchanged');

        st.end();
    });

    t.test('strings with a percent sign', function (st) {
        st.equal(utils.decode('a+%20b'), 'a  b', 'decodes both + and an escape');
        st.equal(utils.decode('%E9+x', null, 'iso-8859-1'), 'é x', 'decodes both + and an escape in iso-8859-1');
        st.equal(utils.decode('a+%'), 'a %', 'decodes + even when the escape is malformed');
        st.equal(utils.decode('a+%E0%A4%A'), 'a %E0%A4%A', 'decodes + even when the escape is truncated');

        st.end();
    });

    t.test('non-strings', function (st) {
        forEach(v.nullPrimitives, function (nullish) {
            st['throws'](
                function () { utils.decode(nullish); },
                TypeError,
                inspect(nullish) + ' is not a string'
            );
        });
        st['throws'](
            function () { utils.decode(['a']); },
            TypeError,
            'an array is not a string'
        );

        /* eslint no-new-wrappers: 0 */
        st.equal(utils.decode(new String('ab')), 'ab', 'a boxed string decodes to a primitive');
        st.equal(utils.decode(new String('a+b')), 'a b', 'a boxed string with + decodes to a primitive');
        st.equal(utils.decode(new String('a%20b')), 'a b', 'a boxed string with an escape decodes to a primitive');

        st.end();
    });

    t.end();
});

test('encode', function (t) {
    forEach(v.nullPrimitives, function (nullish) {
        t['throws'](
            function () { utils.encode(nullish); },
            TypeError,
            inspect(nullish) + ' is not a string'
        );
    });

    t.equal(utils.encode(''), '', 'empty string returns itself');
    t.deepEqual(utils.encode([]), [], 'empty array returns itself');
    t.deepEqual(utils.encode({ length: 0 }), { length: 0 }, 'empty arraylike returns itself');

    t.test('symbols', { skip: !v.hasSymbols }, function (st) {
        st.equal(utils.encode(Symbol('x')), 'Symbol%28x%29', 'symbol is encoded');

        st.end();
    });

    t.equal(
        utils.encode('(abc)'),
        '%28abc%29',
        'encodes parentheses'
    );
    t.equal(
        utils.encode({ toString: function () { return '(abc)'; } }),
        '%28abc%29',
        'toStrings and encodes parentheses'
    );

    t.equal(
        utils.encode('abc 123 💩', null, 'iso-8859-1'),
        'abc%20123%20%26%2355357%3B%26%2356489%3B',
        'encodes in iso-8859-1'
    );

    var longString = '';
    var expectedString = '';
    for (var i = 0; i < 1500; i++) {
        longString += ' ';
        expectedString += '%20';
    }

    t.equal(
        utils.encode(longString),
        expectedString,
        'encodes a long string'
    );

    var boundary = '';
    var expected = '';
    for (var j = 0; j < 1023; j++) {
        boundary += 'a';
        expected += 'a';
    }
    boundary += '😀';
    expected += '%F0%9F%98%80';

    t.equal(
        utils.encode(boundary),
        expected,
        'encodes a surrogate pair split across long-string chunks'
    );

    var laterBoundary = '';
    var laterExpected = '';
    for (var k = 0; k < 2047; k++) {
        laterBoundary += 'a';
        laterExpected += 'a';
    }
    laterBoundary += '😀';
    laterExpected += '%F0%9F%98%80';

    t.equal(
        utils.encode(laterBoundary),
        laterExpected,
        'encodes a surrogate pair split across a later chunk boundary'
    );

    var twoPairs = '';
    for (k = 0; k < 1023; k++) {
        twoPairs += 'a';
    }
    twoPairs += '😀';
    for (k = 0; k < 1022; k++) {
        twoPairs += 'b';
    }
    twoPairs += '😀';

    t.equal(
        (utils.encode(twoPairs).match(/%F0%9F%98%80/g) || []).length,
        2,
        'encodes two surrogate pairs each split across a chunk boundary'
    );

    var roundTrip = '';
    for (k = 0; k < 1023; k++) {
        roundTrip += 'a';
    }
    roundTrip += '😀';

    t.equal(
        decodeURIComponent(utils.encode(roundTrip)),
        roundTrip,
        'a boundary-split surrogate pair round-trips through decodeURIComponent'
    );

    var loneBoundary = '';
    var loneExpected = '';
    for (k = 0; k < 1023; k++) {
        loneBoundary += 'a';
        loneExpected += 'a';
    }
    loneBoundary += '\uD83DX';
    loneExpected += '%EF%BF%BDX';

    t.equal(
        utils.encode(loneBoundary),
        loneExpected,
        'a lone high surrogate at a chunk boundary encodes the same as mid-chunk'
    );

    t.equal(
        utils.encode(loneBoundary.slice(0, 1023) + '\uDC00X'),
        loneExpected.slice(0, 1023) + '%EF%BF%BDX',
        'a lone low surrogate at a chunk boundary does not consume the next character'
    );
    t.equal(
        utils.encode(loneBoundary.slice(0, 1024)),
        loneExpected.slice(0, 1023) + '%EF%BF%BD',
        'a lone high surrogate ending a string of exactly one chunk encodes as U+FFFD'
    );

    t.equal(
        utils.encode('\x28\x29'),
        '%28%29',
        'encodes parens normally'
    );
    t.equal(
        utils.encode('\x28\x29', null, null, null, 'RFC1738'),
        '()',
        'does not encode parens in RFC1738'
    );

    t.equal(
        utils.encode('~*()'),
        '~%2A%28%29',
        'leaves `~` unencoded, and encodes `*` and parens, by default'
    );
    t.equal(
        utils.encode('~*()', null, null, null, 'RFC3986'),
        '~%2A%28%29',
        'leaves `~` unencoded, and encodes `*` and parens, in RFC3986'
    );
    t.equal(
        utils.encode('~*() ', null, null, null, 'RFC1738'),
        '~%2A()%20',
        'leaves `~` and parens unencoded, and encodes `*` and spaces, in RFC1738'
    );

    // todo RFC1738 format

    t.equal(
        utils.encode('~*()', null, null, null, 'WHATWG'),
        '%7E*%28%29',
        'encodes `~` and parens, but not `*`, in WHATWG'
    );

    t.equal(
        utils.encode('Āက豈'),
        '%C4%80%E1%80%80%EF%A4%80',
        'encodes multibyte chars'
    );

    t.equal(
        utils.encode('\uD83D \uDCA9'),
        '%EF%BF%BD%20%EF%BF%BD',
        'encodes lone surrogates as U+FFFD, without consuming the next character'
    );
    t.equal(
        utils.encode('\uDCA9\uD83D'),
        '%EF%BF%BD%EF%BF%BD',
        'encodes a reversed surrogate pair as two U+FFFD'
    );
    t.equal(
        utils.encode('x\uD83D'),
        'x%EF%BF%BD',
        'encodes a trailing lone high surrogate as U+FFFD'
    );
    t.equal(
        utils.encode('\uD83D\uD83D\uDCA9'),
        '%EF%BF%BD%F0%9F%92%A9',
        'a lone high surrogate does not prevent the following pair from encoding'
    );
    t.equal(
        utils.encode('\uD83D\uE000'),
        '%EF%BF%BD%EE%80%80',
        'a high surrogate followed by a code unit above the low surrogate range is not combined'
    );
    t.equal(
        utils.encode('\uDC00\uDC00'),
        '%EF%BF%BD%EF%BF%BD',
        'a low surrogate followed by a low surrogate is not combined'
    );

    t.end();
});

test('isBuffer()', function (t) {
    var fn = function () {};
    fn();
    forEach([null, undefined, true, false, '', 'abc', 42, 0, NaN, {}, [], fn, /a/g], function (x) {
        t.equal(utils.isBuffer(x), false, inspect(x) + ' is not a buffer');
    });

    var fakeBuffer = { constructor: Buffer };
    t.equal(utils.isBuffer(fakeBuffer), false, 'fake buffer is not a buffer');

    forEach(['x', 1, true, {}, [], { isBuffer: true }], function (notCallable) {
        var obj = { constructor: { isBuffer: notCallable } };
        t.doesNotThrow(function () { utils.isBuffer(obj); }, 'non-callable `constructor.isBuffer` (' + inspect(notCallable) + ') does not throw');
        t.equal(utils.isBuffer(obj), false, 'non-callable `constructor.isBuffer` (' + inspect(notCallable) + ') is not a buffer');
    });

    var nullObject = { __proto__: null, constructor: { __proto__: null, isBuffer: 'y' } };
    t.equal(utils.isBuffer(nullObject), false, 'null object with non-callable `constructor.isBuffer` is not a buffer');

    var duckBuffer = { constructor: { isBuffer: function () { return true; } } };
    t.equal(utils.isBuffer(duckBuffer), true, 'callable `constructor.isBuffer` is still honored');

    var saferBuffer = SaferBuffer.from('abc');
    t.equal(utils.isBuffer(saferBuffer), true, 'SaferBuffer instance is a buffer');

    var buffer = SaferBuffer.from('abc');
    t.notEqual(saferBuffer, buffer, 'different buffer instances');
    t.equal(utils.isBuffer(buffer), true, 'another Buffer instance is a buffer');
    t.end();
});

test('isRegExp()', function (t) {
    t.equal(utils.isRegExp(/a/g), true, 'RegExp is a RegExp');
    t.equal(utils.isRegExp(new RegExp('a', 'g')), true, 'new RegExp is a RegExp');
    t.equal(utils.isRegExp(new Date()), false, 'Date is not a RegExp');

    forEach(v.primitives, function (primitive) {
        t.equal(utils.isRegExp(primitive), false, inspect(primitive) + ' is not a RegExp');
    });

    t.end();
});
